import { supabaseAdmin } from './supabase';
import { generateNarration, generateRollOutcome, generateSceneSummary, generateVillainMove, runStoryDirector, generateCoopNarration } from './openai';
import OpenAI from 'openai';
import type { Character, WorldState, WorldBible, DiceRollResult, ActionResult, ShopItem, CampaignJournalEntry, CharacterHistoryEntry, RollContext, NpcMemory, InventoryItem } from '../../../shared/types';
import { enforceTurnPlanNarration, planCoopTurn, planOpeningTurn } from './gameDirector';
import { applyContinuityRepairs, buildContinuityDirective, buildContinuityPatch } from './storyContinuity';
import { preventUngroundedFight } from './aiContractValidator';
import {
  getStatModifier as getStatModifierFromSystem,
  rollDice as rollDiceFromSystem,
} from './characterProgressionSystem';
import {
  advanceActIfAllowed,
  applyConsequences,
  getRecentHistory,
  queueFutureHookExtraction,
} from './campaignTurnPersistence';
import { advanceCombatState as advanceCombatStateFromSystem, newlyDefeatedCombatants } from './combatSystem';
import { actionSignals, combatantMemoryPatch } from './npcMemorySystem';
import {
  buildCampaignSpineSnapshot as buildCampaignSpineSnapshotFromSystem,
  buildLocationGraphSnapshot as buildLocationGraphSnapshotFromSystem,
  campaignLengthTargetActions as campaignLengthTargetActionsFromSystem,
  mergeWorldStateChanges as mergeWorldStateChangesFromSystem,
} from './worldStateSystem';
import {
  appendAchievement,
  appendRecipe,
  applyFactionRepChange,
  buildActiveNpcChange,
  buildAutoNpcMemory,
  buildBackstoryHookChanges,
  buildForeshadowingAndFutureHookChanges,
  buildLocationTracking,
  buildSceneStateUpdate,
  buildShopInventoryChange,
  resolveConsumedItems,
  resolveEndgamePhase,
} from './turnStateHelpers';
export { processAction } from './soloTurnProcessor';

// Safe array coercion — (value || []) only guards against null/undefined, but the AI
// occasionally returns {} for a field that should be an array, which is truthy and
// causes .map() to crash. This helper handles that case cleanly.
function toArr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import { getAbilityForLevel } from '../../../shared/classAbilities';
import {
  calculateActionXp,
  calculateNarrativeXp,
  degreeOfSuccess,
  resolvePlayerCombatRoll,
} from './rulesEngine';

export async function compressToJournalEntry(
  _campaignId: string,
  sessionNotes: string[],
  actNumber: number,
  sessionCount: number
): Promise<CampaignJournalEntry> {
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a campaign journal scribe. Compress session notes into a brief journal entry. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: `Compress these session notes into a journal entry. Extract key decisions and notable NPCs introduced.

Session notes:
${sessionNotes.join('\n')}

Return JSON:
{
  "summary": "2-3 sentence summary of the session",
  "keyDecisions": ["decision 1", "decision 2"],
  "majorNPCsIntroduced": ["npc name 1", "npc name 2"]
}`,
      },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return {
    actNumber,
    sessionNumber: sessionCount,
    summary: parsed.summary || 'Session events recorded.',
    keyDecisions: parsed.keyDecisions || [],
    majorNPCsIntroduced: parsed.majorNPCsIntroduced || [],
    createdAt: new Date().toISOString(),
  };
}

export async function resolveRollAction(
  characterId: string,
  campaignId: string,
  rollResult: number,
  rollTotal: number,
  dc: number,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
  rollContext: RollContext
): Promise<ActionResult> {
  const { data: character, error: charError } = await supabaseAdmin.from('characters').select('*').eq('id', characterId).single();
  if (charError || !character) throw new Error('Character not found');

  const { data: campaign, error: campError } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
  if (campError || !campaign) throw new Error('Campaign not found');

  const recentHistory = await getRecentHistory(campaignId, characterId);

  const aiResponse = await generateRollOutcome(
    rollResult,
    rollTotal,
    dc,
    success,
    isCritSuccess,
    isCritFail,
    rollContext,
    campaign.world_state as WorldState,
    character as Character,
    recentHistory
  );

  const xpGained = calculateActionXp(
    (character as Character).level,
    degreeOfSuccess(rollResult, rollTotal, dc),
    { combat: !!(campaign.world_state as WorldState).combatState?.inCombat, dramatic: rollContext.isDramatic },
  );
  const combatRoll = resolvePlayerCombatRoll(
    character as Character,
    (campaign.world_state as WorldState).combatState,
    rollContext,
    rollResult,
    rollTotal,
    dc,
  );
  const worldStateChanges = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> | undefined),
    ...(combatRoll ? { combatState: combatRoll.combatState } : {}),
  };

  const { updatedCharacter, updatedWorldState } = await applyConsequences(
    characterId,
    {
      worldStateChanges,
      isDeath: aiResponse.isDeath,
      xpGained,
      hpChange: aiResponse.isDeath ? -(character as Character).max_hp : aiResponse.hpChange,
      goldChange: aiResponse.goldChange,
      loot: aiResponse.loot as { id: string; name: string; description: string; quantity: number; type: string; value?: number }[] | undefined,
    },
    character as Character,
    { id: campaignId, world_state: campaign.world_state as WorldState, act: campaign.act, world_bible: campaign.world_bible as WorldBible }
  );

  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'dice_roll',
    content: `Rolled ${rollResult} (total ${rollTotal}) vs DC ${dc} â€” ${success ? 'SUCCESS' : 'FAILURE'}`,
    metadata: { rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, rollContext, combatDamage: combatRoll?.damage || 0, combatTarget: combatRoll?.target },
  });
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'narration',
    content: aiResponse.narration,
    metadata: { suggestedActions: aiResponse.suggestedActions, fromRoll: true, sceneImagePrompt: aiResponse.sceneImagePrompt || null },
  });

  return {
    narration: aiResponse.narration,
    diceRoll: {
      sides: 20,
      rolls: [rollResult],
      modifier: rollTotal - rollResult,
      total: rollTotal,
      description: `${rollContext.stat.toUpperCase()} check vs DC ${dc}`,
    },
    worldStateChanges: updatedWorldState,
    characterChanges: {
      hp: updatedCharacter.hp,
      xp: updatedCharacter.xp,
      level: updatedCharacter.level,
      gold: updatedCharacter.gold,
      inventory: updatedCharacter.inventory,
      status_effects: updatedCharacter.status_effects,
    },
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: aiResponse.suggestedActions,
    isDeath: aiResponse.isDeath,
    isVictory: combatRoll?.victory || aiResponse.isVictory,
    isCombat: combatRoll ? !combatRoll.victory : aiResponse.isCombat,
    combatDamage: combatRoll?.target ? { target: combatRoll.target, amount: combatRoll.damage, defeated: combatRoll.defeated } : undefined,
    loot: aiResponse.loot as ActionResult['loot'],
    isLevelUp: false,
  };
}

export async function resolveCoopRollAction(
  campaignId: string,
  characterId: string,
  rollResult: number,
  rollTotal: number,
  dc: number,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
  rollContext: RollContext
): Promise<ActionResult> {
  const { data: campaign, error: campError } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
  if (campError || !campaign) throw new Error('Campaign not found');

  const ws = campaign.world_state as WorldState;
  const pending = ws.coopPendingRoll;
  if (!pending || pending.actingCharacterId !== characterId) throw new Error('No pending co-op roll for this character');

  const partnerAction = pending.actions.find(pa => pa.characterId !== characterId);
  if (!partnerAction) throw new Error('Co-op partner action not found');

  // Resolve the roll for the acting character via the standard roll-outcome flow
  const result = await resolveRollAction(characterId, campaignId, rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, rollContext);

  // Reward the partner with the same XP for the joint turn and clear the pending roll
  const { data: partnerChar, error: partnerError } = await supabaseAdmin.from('characters').select('*').eq('id', partnerAction.characterId).single();
  if (partnerError || !partnerChar) throw new Error('Co-op partner character not found');

  const { data: refreshedCampaign } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', campaignId).single();
  const wsAfterRoll = (refreshedCampaign?.world_state || result.worldStateChanges || ws) as WorldState;

  const xpGained = calculateActionXp(
    (partnerChar as Character).level,
    degreeOfSuccess(rollResult, rollTotal, dc),
    { combat: !!ws.combatState?.inCombat, dramatic: rollContext.isDramatic, coop: true },
  );
  // worldStateChanges (not the passed-in snapshot) is what actually persists:
  // applyConsequences re-fetches the latest world state before writing, so the
  // pending roll must be cleared via the merge path or it lives in the DB forever.
  const { updatedCharacter: updatedPartner, updatedWorldState } = await applyConsequences(
    partnerAction.characterId,
    { xpGained, worldStateChanges: { coopPendingRoll: null } },
    partnerChar as Character,
    { id: campaignId, world_state: { ...wsAfterRoll, coopPendingRoll: null }, act: campaign.act, world_bible: campaign.world_bible as WorldBible }
  );

  const partnerLeveledUp = updatedPartner.level > (partnerChar as Character).level;
  const partnerAbility = partnerLeveledUp ? getAbilityForLevel((partnerChar as Character).class, updatedPartner.level) ?? null : null;

  // Mirror the roll narration into the partner's feed, carrying enough metadata
  // for their client to show the same turn effects the roller sees.
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: partnerAction.characterId,
    event_type: 'narration',
    content: result.narration,
    metadata: {
      coopRound: true,
      fromRoll: true,
      suggestedActions: result.suggestedActions,
      sceneImagePrompt: result.sceneImagePrompt || null,
      isCombat: result.isCombat ?? false,
      isVictory: result.isVictory ?? false,
      enemyName: result.enemyName ?? null,
      personal: {
        isLevelUp: partnerLeveledUp,
        level: updatedPartner.level,
        maxHp: updatedPartner.max_hp,
        newAbility: partnerAbility,
      },
    },
  });

  return {
    ...result,
    worldStateChanges: updatedWorldState,
    character2Changes: {
      hp: updatedPartner.hp,
      max_hp: updatedPartner.max_hp,
      gold: updatedPartner.gold,
      inventory: updatedPartner.inventory,
    },
  };
}

export async function getOpeningScene(
  characterId: string,
  campaignId: string
): Promise<ActionResult> {
  const { data: character } = await supabaseAdmin.from('characters').select('*').eq('id', characterId).single();
  if (!character) throw new Error('Character not found');
  const { data: campaign } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
  if (!campaign) throw new Error('Campaign not found');

  const openingWs = campaign.world_state as WorldState;
  const openingWb = campaign.world_bible as WorldBible;
  const openingPlan = planOpeningTurn(character as Character, openingWs, openingWb);

  // Increment session count each time a player enters the game
  const newSessionCount = (openingWs.sessionCount ?? 0) + 1;
  openingWs.sessionCount = newSessionCount;
  await supabaseAdmin.from('campaigns').update({ world_state: openingWs }).eq('id', campaignId);

  // Check if the villain should make a proactive move â€” every 3 sessions or on first return
  const villainMoveCount = openingWs.villainMoveCount ?? 0;
  const sessionCount = newSessionCount;
  const villainMoveDue = sessionCount > 0 && (sessionCount % 3 === 0 || villainMoveCount === 0) && sessionCount > villainMoveCount * 3;
  let villainMovePreamble = '';
  if (villainMoveDue && openingWb.primaryAntagonist) {
    try {
      const move = await generateVillainMove(openingWs, openingWb, campaign.act || 1);
      villainMovePreamble = `\n\nWHILE YOU WERE AWAY:\n${move.narration}`;
      // Save the villain move to world state
      const updatedWs = {
        ...openingWs,
        villainMoveCount: villainMoveCount + 1,
        sessionNotes: [...(openingWs.sessionNotes || []), move.sessionNote],
      };
      await supabaseAdmin.from('campaigns').update({ world_state: updatedWs }).eq('id', campaignId);
      Object.assign(openingWs, updatedWs);
    } catch { /* non-critical */ }
  }

  const openingContext = {
    journal: openingWs.campaignJournal || [],
    characterHistory: openingWs.characterHistory || [],
    antagonists: openingWb.antagonistRoster || (openingWb.primaryAntagonist ? [openingWb.primaryAntagonist] : []),
    centralConflict: openingWb.centralConflict || '',
    act: campaign.act || 1,
    sessionCount: openingWs.sessionCount || 1,
    roadmap: openingWb.dmRoadmap,
    foreshadowingLedger: openingWs.foreshadowingLedger,
    backstoryHooks: openingWs.backstoryHooks,
    actGoalsAchieved: openingWs.actGoalsAchieved,
    railDirectives: openingPlan.guardrails,
  };

  const fallenHeroes = openingWs.fallenHeroes || [];
  const openingAction = fallenHeroes.length > 0
    ? `SUCCESSOR_ENTRY: A new hero enters the world. The previous hero ${fallenHeroes[fallenHeroes.length - 1].name} (${fallenHeroes[fallenHeroes.length - 1].race} ${fallenHeroes[fallenHeroes.length - 1].class}, level ${fallenHeroes[fallenHeroes.length - 1].level}) fell â€” ${fallenHeroes[fallenHeroes.length - 1].cause}. The new hero is ${character.name}, ${character.race} ${character.class}. Acknowledge the fallen in a way that fits the world. NPCs who knew the previous hero may reference them.${villainMovePreamble}`
    : `OPENING_SCENE${villainMovePreamble}`;

  const aiResponse = await generateNarration(
    openingAction,
    openingPlan.worldStateForNarration,
    openingWb,
    character as Character,
    [],
    openingContext
  );
  enforceTurnPlanNarration(aiResponse, openingPlan);

  const openingChanges: Partial<WorldState> = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> || {}),
    ...openingPlan.worldStatePatch,
    characterLocations: {
      ...(openingWs.characterLocations || {}),
      [characterId]: (aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.currentLocation || openingPlan.worldStatePatch.currentLocation || openingWs.currentLocation || 'Unknown',
    },
    characterLastSeen: {
      ...(openingWs.characterLastSeen || {}),
      [characterId]: new Date().toISOString(),
    },
  };
  const openingWorldState = mergeWorldStateChangesFromSystem(openingWs, openingChanges);
  openingWorldState.locationGraph = buildLocationGraphSnapshotFromSystem(openingWorldState, openingWb);
  openingWorldState.campaignSpine = buildCampaignSpineSnapshotFromSystem(openingWorldState, openingWb, campaign.act || 1);
  await supabaseAdmin.from('campaigns').update({ world_state: openingWorldState }).eq('id', campaignId);

  // Save just the narration â€” no player action event for the opening
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'narration',
    content: aiResponse.narration,
    metadata: { suggestedActions: aiResponse.suggestedActions, isOpening: true, sceneImagePrompt: aiResponse.sceneImagePrompt || null },
  });

  return {
    narration: aiResponse.narration,
    worldStateChanges: openingWorldState,
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: aiResponse.suggestedActions,
    isDeath: false,
    isLevelUp: false,
  };
}

// In co-op, both players hit /start independently. Running the solo opening per
// character produces two near-identical openings from the same world bible (the
// "same opening line for both characters" bug). Instead, the FIRST caller in a
// session generates ONE shared single-camera opening via generateCoopNarration
// and writes it for both characters; the partner's /start (arriving within the
// dedupe window) returns that same opening. Caller must hold the campaign lock.
const COOP_OPENING_DEDUPE_MS = 5 * 60 * 1000;

export async function getCoopOpeningScene(
  campaignId: string,
  forCharacterId: string
): Promise<ActionResult> {
  const { data: campaign } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
  if (!campaign) throw new Error('Campaign not found');

  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_alive', true);
  const characters = (chars || []) as Character[];

  // Not actually a 2-player party right now — fall back to the solo opening.
  if (characters.length < 2) {
    return getOpeningScene(forCharacterId, campaignId);
  }

  // Stable party order so character1/character2 mapping is deterministic across
  // both /start calls (the partner reads the same saved opening regardless).
  const party = [...characters].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);

  // Dedupe: if a partner just generated the shared opening, return it verbatim.
  const { data: recentNarrations } = await supabaseAdmin
    .from('story_events')
    .select('content, metadata, character_id, created_at')
    .eq('campaign_id', campaignId)
    .eq('event_type', 'narration')
    .order('created_at', { ascending: false })
    .limit(6);
  const existingOpening = (recentNarrations || []).find(e =>
    (e.metadata as { isOpening?: boolean } | null)?.isOpening === true &&
    Date.now() - Date.parse(e.created_at) < COOP_OPENING_DEDUPE_MS
  );
  if (existingOpening) {
    // Prefer the row written for THIS character (carries their own suggestions).
    const mine = (recentNarrations || []).find(e =>
      e.character_id === forCharacterId &&
      (e.metadata as { isOpening?: boolean } | null)?.isOpening === true &&
      Date.now() - Date.parse(e.created_at) < COOP_OPENING_DEDUPE_MS
    ) || existingOpening;
    const meta = (mine.metadata || {}) as { suggestedActions?: string[]; sceneImagePrompt?: string };
    return {
      narration: mine.content,
      sceneImagePrompt: meta.sceneImagePrompt || undefined,
      suggestedActions: meta.suggestedActions || [],
      isDeath: false,
      isLevelUp: false,
    };
  }

  const openingWs = campaign.world_state as WorldState;
  const openingWb = campaign.world_bible as WorldBible;

  // Increment session count once for the whole party (the partner's call dedupes
  // out above, so it won't double-count).
  const newSessionCount = (openingWs.sessionCount ?? 0) + 1;
  openingWs.sessionCount = newSessionCount;
  await supabaseAdmin.from('campaigns').update({ world_state: openingWs }).eq('id', campaignId);

  // Villain "while you were away" move, mirroring the solo opening.
  const villainMoveCount = openingWs.villainMoveCount ?? 0;
  const villainMoveDue = newSessionCount > 0 && (newSessionCount % 3 === 0 || villainMoveCount === 0) && newSessionCount > villainMoveCount * 3;
  let villainMovePreamble = '';
  if (villainMoveDue && openingWb.primaryAntagonist) {
    try {
      const move = await generateVillainMove(openingWs, openingWb, campaign.act || 1);
      villainMovePreamble = `\n\nWHILE YOU WERE AWAY:\n${move.narration}`;
      const updatedWs = {
        ...openingWs,
        villainMoveCount: villainMoveCount + 1,
        sessionNotes: [...(openingWs.sessionNotes || []), move.sessionNote],
      };
      await supabaseAdmin.from('campaigns').update({ world_state: updatedWs }).eq('id', campaignId);
      Object.assign(openingWs, updatedWs);
    } catch { /* non-critical */ }
  }

  const openingContext = {
    journal: openingWs.campaignJournal || [],
    characterHistory: openingWs.characterHistory || [],
    antagonists: openingWb.antagonistRoster || (openingWb.primaryAntagonist ? [openingWb.primaryAntagonist] : []),
    centralConflict: openingWb.centralConflict || '',
    act: campaign.act || 1,
    sessionCount: openingWs.sessionCount || 1,
    roadmap: openingWb.dmRoadmap,
    foreshadowingLedger: openingWs.foreshadowingLedger,
    backstoryHooks: openingWs.backstoryHooks,
    actGoalsAchieved: openingWs.actGoalsAchieved,
  };

  const [p1, p2] = party;
  const openingDirective = `OPENING_SCENE — this is the campaign's first beat, not a player action. Open ONE shared scene that brings ${p1.name} and ${p2.name} together in the same place at the same moment. Establish where they are and why they are together, give each a concrete presence, and end on a hook or first choice. Single camera: no "Meanwhile", no splitting them across separate locations.${villainMovePreamble}`;
  const partnerDirective = `Same opening scene — ${p2.name} is present alongside ${p1.name} in this one shared moment.`;

  const aiResponse = await generateCoopNarration(
    [
      { character: p1, action: openingDirective },
      { character: p2, action: partnerDirective },
    ],
    openingWs,
    openingWb,
    [],
    openingContext
  );

  // Persist any world state the opening established (location, NPCs met, active
  // NPC) so both players share a consistent world from turn one.
  if (aiResponse.worldStateChanges) {
    const mergedWs = mergeWorldStateChangesFromSystem(openingWs, aiResponse.worldStateChanges);
    await supabaseAdmin.from('campaigns').update({ world_state: mergedWs }).eq('id', campaignId);
  }

  // Write the same narration for BOTH characters, each carrying its own
  // per-character suggestions, tagged isOpening so the partner's call dedupes.
  const suggestionsFor = (idx: number): string[] =>
    (idx === 0 ? aiResponse.character1SuggestedActions : aiResponse.character2SuggestedActions)
    || aiResponse.suggestedActions || [];
  await Promise.all(party.map((c, idx) =>
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: c.id,
      event_type: 'narration',
      content: aiResponse.narration,
      metadata: {
        suggestedActions: suggestionsFor(idx),
        isOpening: true,
        coopRound: true,
        sceneImagePrompt: aiResponse.sceneImagePrompt || null,
      },
    })
  ));

  const myIdx = party.findIndex(c => c.id === forCharacterId);
  return {
    narration: aiResponse.narration,
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: suggestionsFor(myIdx >= 0 ? myIdx : 0),
    worldStateChanges: aiResponse.worldStateChanges,
    isDeath: false,
    isLevelUp: false,
  };
}

export async function processCoopAction(
  campaignId: string,
  pendingActions: { characterId: string; userId: string; action: string; characterName: string }[]
): Promise<ActionResult> {
  // Load both characters
  const charResults = await Promise.all(
    pendingActions.map(pa =>
      supabaseAdmin.from('characters').select('*').eq('id', pa.characterId).single()
    )
  );

  const characters = charResults.map((r, i) => {
    if (r.error || !r.data) throw new Error(`Character not found: ${pendingActions[i].characterId}`);
    return r.data as Character;
  });

  if (!characters[0].is_alive || !characters[1].is_alive) {
    throw new Error('Your character has perished. Their story is over.');
  }

  // Load campaign
  const { data: campaign, error: campError } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();
  if (campError || !campaign) throw new Error('Campaign not found');

  const ws = campaign.world_state as WorldState;
  const wb = campaign.world_bible as WorldBible;
  const coopPlan = planCoopTurn(characters, pendingActions.map(pa => pa.action), ws, wb);
  const continuityDirectives = buildContinuityDirective(characters, coopPlan.rails, ws, wb);

  // Get recent history (use first character as reference)
  const recentHistory = await getRecentHistory(campaignId, pendingActions[0].characterId);

  // Compute campaign context (mirrors processAction's solo logic)
  const currentAct = campaign.act || 1;
  const roadmap = wb.dmRoadmap;
  const mustIntroduce = currentAct === 1 ? (roadmap?.act1MustIntroduce || []) : [];
  const mustIntroduceStatus: Record<string, boolean> = {};
  if (mustIntroduce.length > 0) {
    const allNpcNamesLower = toArr<NpcMemory>(ws.npcMemory).map(n => n.name.toLowerCase());
    const allLocationsLower = toArr<string>(ws.discoveredLocations).map(l => l.toLowerCase());
    for (const item of mustIntroduce) {
      const itemLower = item.toLowerCase();
      mustIntroduceStatus[item] =
        allNpcNamesLower.some(n => itemLower.includes(n) || n.includes(itemLower.split(' ')[0])) ||
        allLocationsLower.some(l => itemLower.includes(l) || l.includes(itemLower.split(' ')[0]));
    }
  }

  const campaignContext = {
    journal: ws.campaignJournal || [],
    characterHistory: ws.characterHistory || [],
    antagonists: wb.antagonistRoster || (wb.primaryAntagonist ? [wb.primaryAntagonist] : []),
    centralConflict: wb.centralConflict || '',
    act: currentAct,
    sessionCount: ws.sessionCount || 1,
    roadmap,
    foreshadowingLedger: ws.foreshadowingLedger,
    backstoryHooks: ws.backstoryHooks,
    actGoalsAchieved: ws.actGoalsAchieved,
    forceComplication: (ws.sceneState?.stalledCount ?? 0) >= 3,
    forceEscalation: (ws.sceneState?.cluesThisScene ?? 0) >= 2,
    actionsInCurrentAct: ws.actionsInCurrentAct || 0,
    keyNPCs: ws.keyNPCs,
    mustIntroduceStatus: mustIntroduce.length > 0 ? mustIntroduceStatus : undefined,
    pendingDirectorBeat: ws.pendingDirectorBeat || null,
    futureHooks: (ws.futureHooks || []).filter(h => !h.resolved).slice(-10),
    railDirectives: coopPlan.guardrails,
    continuityDirectives,
  };

  // Call generateCoopNarration
  const aiResponse = await generateCoopNarration(
    pendingActions.map((pa, i) => ({ character: characters[i], action: pa.action })),
    coopPlan.worldStateForNarration,
    wb,
    recentHistory,
    campaignContext
  );
  enforceTurnPlanNarration(aiResponse, coopPlan);
  applyContinuityRepairs(aiResponse, characters, coopPlan.rails);
  preventUngroundedFight(aiResponse, pendingActions.map(pa => pa.action), ws.currentLocation, !!ws.combatState?.inCombat);
  if (coopPlan.resolvedRolls.length > 0) {
    aiResponse.awaitingRoll = false;
    aiResponse.rollContext = undefined;
  }

  // Explicit rest detection - override AI per character if they clearly stated rest intent (but not negations)
  const isNegatedRest = (action: string) => /\b(not|don'?t|won'?t|can'?t|no|never|stop|avoid|refuse)\b.{0,20}\b(rest|sleep|camp|recover)\b/i.test(action);
  const isExplicitRest = (action: string) => !isNegatedRest(action) && /\b(rest|sleep|camp|make camp|short rest|long rest|take a rest|take a break|set up camp|meditate|recover)\b/i.test(action);
  if (isExplicitRest(pendingActions[0].action)) {
    aiResponse.character1Changes = { ...(aiResponse.character1Changes || {}), isRest: true };
  }
  if (isExplicitRest(pendingActions[1].action)) {
    aiResponse.character2Changes = { ...(aiResponse.character2Changes || {}), isRest: true };
  }

  // If the AI wants a roll from one of the players, pause the turn for that roll
  if (aiResponse.awaitingRoll && aiResponse.rollContext) {
    const actingCharacterId = aiResponse.actingCharacterId
      && pendingActions.some(pa => pa.characterId === aiResponse.actingCharacterId)
      ? aiResponse.actingCharacterId
      : pendingActions[0].characterId;

    await Promise.all(pendingActions.map(pa =>
      supabaseAdmin.from('story_events').insert({
        campaign_id: campaignId,
        character_id: pa.characterId,
        event_type: 'action',
        content: pa.action,
        metadata: { coopRound: true },
      })
    ));
    await Promise.all(pendingActions.map(pa =>
      supabaseAdmin.from('story_events').insert({
        campaign_id: campaignId,
        character_id: pa.characterId,
        event_type: 'narration',
        content: aiResponse.narration,
        metadata: { coopRound: true, awaitingRoll: true, rollContext: aiResponse.rollContext, actingCharacterId, sceneImagePrompt: aiResponse.sceneImagePrompt || null },
      })
    ));

    const wsWithChanges = aiResponse.worldStateChanges ? mergeWorldStateChangesFromSystem(ws, aiResponse.worldStateChanges) : ws;

    await supabaseAdmin.from('campaigns').update({
      world_state: { ...wsWithChanges, pendingTurn: null, coopPendingRoll: { actingCharacterId, rollContext: aiResponse.rollContext, actions: pendingActions } }
    }).eq('id', campaignId);

    return {
      narration: aiResponse.narration,
      awaitingRoll: true,
      rollContext: aiResponse.rollContext,
      actingCharacterId,
      suggestedActions: [],
      sceneImagePrompt: aiResponse.sceneImagePrompt,
      isDeath: false,
      isLevelUp: false,
    };
  }

  // Handle auto-resolved dice roll if required
  let diceResult: DiceRollResult | undefined;
  let success = true;
  if (aiResponse.diceRequired && aiResponse.diceType) {
    const rollingCharacter = (aiResponse.actingCharacterId && characters.find(c => c.id === aiResponse.actingCharacterId)) || characters[0];
    const sides = parseInt(aiResponse.diceType.replace('d', ''), 10) || 20;
    const rollingAction = pendingActions.find(pa => pa.characterId === rollingCharacter.id)?.action || pendingActions[0].action;
    const statKey = rollingAction.toLowerCase().includes('sneak') || rollingAction.toLowerCase().includes('hide') ? 'dex'
      : rollingAction.toLowerCase().includes('know') || rollingAction.toLowerCase().includes('lore') ? 'int'
      : rollingAction.toLowerCase().includes('persuad') || rollingAction.toLowerCase().includes('charm') ? 'cha'
      : rollingAction.toLowerCase().includes('percei') || rollingAction.toLowerCase().includes('notice') ? 'wis'
      : rollingAction.toLowerCase().includes('lift') || rollingAction.toLowerCase().includes('attack') ? 'str'
      : 'dex';

    const modifier = getStatModifierFromSystem(rollingCharacter.stats[statKey as keyof typeof rollingCharacter.stats] as number);
    diceResult = rollDiceFromSystem(sides, modifier);
    diceResult.description = aiResponse.diceDescription;
    success = diceResult.total >= (aiResponse.diceDC ?? 12);
  }

  const xpGained = calculateNarrativeXp(
    Math.max(characters[0]?.level || 1, characters[1]?.level || 1),
    { combat: !!aiResponse.isCombat, coop: true },
  ) + (aiResponse.comboBonus ? 5 : 0);

  // Build world state changes (tracking both characters)
  const newActionCount = (ws.actionCount || 0) + 1;
  const newActionsInCurrentAct = (ws.actionsInCurrentAct || 0) + 1;

  // Update spotlight balance
  const currentBalance = { ...(ws.spotlightBalance || {}) };
  if (aiResponse.spotlightCharacterId) {
    currentBalance[aiResponse.spotlightCharacterId] = (currentBalance[aiResponse.spotlightCharacterId] || 0) + 1;
  }

  const newLocation = coopPlan.worldStatePatch.currentLocation || (aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.currentLocation || ws.currentLocation;
  const locationTracking = buildLocationTracking(ws, [characters[0].id, characters[1].id], newLocation);

  // Scene summary â€” regenerate every 4 actions
  const sceneActionCount = (ws.actionsSinceLastSummary || 0) + 1;
  let currentSceneSummary = ws.currentSceneSummary;
  let actionsSinceLastSummary = sceneActionCount;
  if (sceneActionCount >= 4) {
    try {
      currentSceneSummary = await generateSceneSummary(recentHistory, ws.currentLocation || 'Unknown', `${characters[0].name} & ${characters[1].name}`, ws.combatState ?? null);
      actionsSinceLastSummary = 0;
    } catch { /* non-critical */ }
  }

  const newSceneState = buildSceneStateUpdate(ws.sceneState, aiResponse);

  const activeNPCChange = buildActiveNpcChange(ws, aiResponse, newLocation);
  const autoNpcMemory = buildAutoNpcMemory(
    ws,
    aiResponse.worldStateChanges as Partial<WorldState> | undefined,
    activeNPCChange.activeNPC,
    characters.map(character => character.name),
    newLocation,
  );

  const { shopInventoryChange, shopItems } = buildShopInventoryChange(ws, aiResponse, newLocation || 'unknown');
  if (shopItems) aiResponse.shopItems = shopItems;

  // Update combat state (shared with the solo path)
  const { combatState, forcedVictory } = advanceCombatStateFromSystem(ws.combatState ?? null, aiResponse, pendingActions.map(pa => pa.action));
  const combatSignals = actionSignals(pendingActions.map(pa => pa.action));
  const newCombatEncounter = !ws.combatState?.inCombat && !!combatState?.inCombat;
  const combatantEnemies = combatState?.enemies || aiResponse.combatEnemies || ws.combatState?.enemies;
  const defeatedNames = newlyDefeatedCombatants(ws.combatState?.enemies, combatantEnemies, aiResponse.enemyDefeated);
  const shouldUpdateCombatantMemory = newCombatEncounter
    || defeatedNames.length > 0
    || combatSignals.pursuedOrCornered
    || combatSignals.sparedOrAcceptedSurrender
    || combatSignals.rescued;
  const combatantNpcMemory = shouldUpdateCombatantMemory
    ? combatantMemoryPatch(combatantEnemies, ws.npcMemory, {
        location: newLocation || ws.currentLocation,
        playerNames: characters.map(character => character.name),
        newEncounter: newCombatEncounter,
        defeatedNames,
        ...combatSignals,
      })
    : [];

  const { ledgerChanges, futureHooksChanges } = buildForeshadowingAndFutureHookChanges(aiResponse, ws, campaign.act || 1);

  const hookChanges = buildBackstoryHookChanges(aiResponse, ws.backstoryHooks);

  // Track act goal achievements
  const goalChanges: string[] = [];
  if (aiResponse.actGoalAchieved) goalChanges.push(aiResponse.actGoalAchieved);

  // Run Story Director every 5 actions to evaluate campaign health
  if (newActionCount % 5 === 0) {
    try {
      const directorBeat = await runStoryDirector(ws, wb, characters, campaign.act);
      if (directorBeat) {
        ws.pendingDirectorBeat = {
          beat: directorBeat.beat,
          urgency: directorBeat.urgency,
          expiresAfter: newActionCount + 2,
        };
      }
    } catch { /* non-critical */ }
  }

  // Trigger villain move every 10 actions
  let villainMoveNote: string | undefined;
  if (newActionCount % 10 === 0 && wb.primaryAntagonist) {
    try {
      const move = await generateVillainMove(ws, wb, campaign.act || 1);
      villainMoveNote = move.sessionNote;
    } catch { /* non-critical */ }
  }

  const endgamePhase = resolveEndgamePhase(
    ws.endgamePhase,
    aiResponse,
    ws,
    wb,
    newActionCount,
    campaignLengthTargetActionsFromSystem(wb),
  );

  const worldStateChangesWithTracking: Partial<WorldState> = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> || {}),
    ...coopPlan.worldStatePatch,
    ...(autoNpcMemory.length > 0 || combatantNpcMemory.length > 0
      ? {
          npcMemory: [
            ...toArr<NpcMemory>((aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.npcMemory),
            ...autoNpcMemory,
            ...combatantNpcMemory,
          ],
        }
      : {}),
    ...(ledgerChanges.length > 0 ? { foreshadowingLedger: ledgerChanges } : {}),
    ...(futureHooksChanges ? { futureHooks: futureHooksChanges } : {}),
    ...(hookChanges.length > 0 ? { backstoryHooks: hookChanges } : {}),
    ...(goalChanges.length > 0 ? { actGoalsAchieved: goalChanges } : {}),
    ...(endgamePhase !== ws.endgamePhase ? { endgamePhase } : {}),
    ...(aiResponse.isHighStakes ? { lastHighStakesAction: newActionCount } : {}),
    pendingDirectorBeat: aiResponse.directorBeatExecuted
      ? null
      : (ws.pendingDirectorBeat && newActionCount <= ws.pendingDirectorBeat.expiresAfter
          ? ws.pendingDirectorBeat
          : null),
    actionCount: newActionCount,
    actionsInCurrentAct: newActionsInCurrentAct,
    combatState,
    ...locationTracking,
    ...buildContinuityPatch(characters, coopPlan.rails, ws, aiResponse, newActionCount, newLocation),
    currentSceneSummary,
    actionsSinceLastSummary,
    sceneState: newSceneState,
    lastPillarUsed: aiResponse.scenePurpose
      ? [...(ws.lastPillarUsed || []), aiResponse.scenePurpose].slice(-5)
      : ws.lastPillarUsed,
    ...activeNPCChange,
    ...shopInventoryChange,
    pendingTurn: null,
    coopPendingRoll: null,
    spotlightBalance: currentBalance,
    ...(aiResponse.achievementUnlocked
      ? { unlockedAchievements: appendAchievement(ws.unlockedAchievements, aiResponse.achievementUnlocked, characters[0].name) }
      : {}),
    ...(aiResponse.newRecipe
      ? { knownRecipes: appendRecipe(ws.knownRecipes, aiResponse.newRecipe) }
      : {}),
    ...(aiResponse.companion !== undefined
      ? { companion: aiResponse.companion }
      : {}),
    ...(aiResponse.factionRepChange
      ? { factionStandings: applyFactionRepChange(ws.factionStandings, aiResponse.factionRepChange) }
      : {}),
  };

  const char1ConsumedItems = resolveConsumedItems(characters[0], aiResponse.character1Changes?.consumedItems, aiResponse.narration);
  const char2ConsumedItems = resolveConsumedItems(characters[1], aiResponse.character2Changes?.consumedItems, aiResponse.narration);

  // Apply consequences to Character 1
  const char1Result = await applyConsequences(
    pendingActions[0].characterId,
    {
      worldStateChanges: worldStateChangesWithTracking,
      xpGained,
      hpChange: aiResponse.character1Changes?.isDeath ? -characters[0].max_hp : (aiResponse.character1Changes?.hpChange ?? aiResponse.hpChange),
      loot: aiResponse.character1Changes?.loot ?? undefined,
      statusEffectChanges: aiResponse.character1Changes?.statusEffectChanges ?? undefined,
      sessionNote: villainMoveNote
        ? [aiResponse.sessionNote, villainMoveNote].filter(Boolean).join(' ')
        : aiResponse.sessionNote,
      goldChange: aiResponse.character1Changes?.goldChange,
      isDeath: aiResponse.character1Changes?.isDeath,
      deathDescription: aiResponse.character1Changes?.deathDescription,
      isRest: aiResponse.character1Changes?.isRest,
      abilityUsed: aiResponse.character1Changes?.abilityUsed,
      consumedItems: char1ConsumedItems.length > 0 ? char1ConsumedItems : undefined,
    },
    characters[0],
    { id: campaignId, world_state: ws, act: campaign.act, world_bible: wb }
  );

  // Apply consequences to Character 2 (world state already updated â€” applyConsequences re-fetches)
  const char2Result = await applyConsequences(
    pendingActions[1].characterId,
    {
      xpGained,
      hpChange: aiResponse.character2Changes?.isDeath ? -characters[1].max_hp : (aiResponse.character2Changes?.hpChange ?? aiResponse.hpChange),
      loot: aiResponse.character2Changes?.loot ?? undefined,
      statusEffectChanges: aiResponse.character2Changes?.statusEffectChanges ?? undefined,
      goldChange: aiResponse.character2Changes?.goldChange,
      isDeath: aiResponse.character2Changes?.isDeath,
      deathDescription: aiResponse.character2Changes?.deathDescription,
      isRest: aiResponse.character2Changes?.isRest,
      abilityUsed: aiResponse.character2Changes?.abilityUsed,
      consumedItems: char2ConsumedItems.length > 0 ? char2ConsumedItems : undefined,
      characterHistoryNote: aiResponse.characterHistoryNote as CharacterHistoryEntry | undefined,
      antagonistUpdate: aiResponse.antagonistUpdate,
    },
    characters[1],
    { id: campaignId, world_state: char1Result.updatedWorldState, act: campaign.act, world_bible: wb }
  );

  const didAdvanceAct = await advanceActIfAllowed(campaignId, aiResponse.advanceAct, char2Result.updatedWorldState, wb, campaign.act || 1);

  queueFutureHookExtraction({
    shouldRun: newActionCount % 3 === 0,
    actionSummary: `${characters[0].name}: ${pendingActions[0].action} | ${characters[1].name}: ${pendingActions[1].action}`,
    narration: aiResponse.narration,
    worldState: char2Result.updatedWorldState,
    actorName: `${characters[0].name} & ${characters[1].name}`,
    campaignId,
  });

  const updatedChar1 = char1Result.updatedCharacter;
  const updatedChar2 = char2Result.updatedCharacter;

  const char1LevelUp = updatedChar1.level > characters[0].level;
  const char2LevelUp = updatedChar2.level > characters[1].level;
  const grantedAbility1 = char1LevelUp ? getAbilityForLevel(characters[0].class, updatedChar1.level) ?? undefined : undefined;
  const grantedAbility2 = char2LevelUp ? getAbilityForLevel(characters[1].class, updatedChar2.level) ?? undefined : undefined;
  const isCombatNow = !!aiResponse.isCombat && combatState != null;
  const isVictoryNow = !!aiResponse.isVictory || forcedVictory;

  // Turn-effect metadata rides on each player's narration event so the partner
  // who submitted first (and receives this round via realtime, not the API
  // response) gets the same popups - loot, level-up, choice cards, shop - as
  // the player who submitted last.
  const char1Suggestions = aiResponse.character1SuggestedActions?.length ? aiResponse.character1SuggestedActions : aiResponse.suggestedActions;
  const char2Suggestions = aiResponse.character2SuggestedActions?.length ? aiResponse.character2SuggestedActions : aiResponse.suggestedActions;
  const sharedTurnMeta = {
    coopRound: true,
    sceneImagePrompt: aiResponse.sceneImagePrompt || null,
    isCombat: isCombatNow,
    isVictory: isVictoryNow,
    enemyName: aiResponse.enemyName ?? null,
    isHighStakes: !!aiResponse.isHighStakes,
    choiceCards: aiResponse.choiceCards ?? null,
    isMerchant: !!aiResponse.isMerchant,
    shopItems: aiResponse.isMerchant ? aiResponse.shopItems ?? null : null,
    advanceAct: didAdvanceAct,
    bossPhaseAdvance: !!aiResponse.bossPhaseAdvance,
    achievementUnlocked: aiResponse.achievementUnlocked ?? null,
    railRolls: coopPlan.resolvedRolls,
  };
  const personalTurnMeta = (updated: Character, original: Character, changes: typeof aiResponse.character1Changes, leveledUp: boolean, ability: ReturnType<typeof getAbilityForLevel> | undefined) => ({
    isLevelUp: leveledUp,
    level: updated.level,
    maxHp: updated.max_hp,
    newAbility: ability ?? null,
    loot: changes?.loot ?? null,
    goldGained: Math.max(0, (updated.gold ?? 0) - (original.gold ?? 0)) || null,
    isDeath: changes?.isDeath ?? false,
    deathDescription: changes?.deathDescription ?? null,
  });

  // Save story events for both characters. Insert both player actions FIRST and
  // await them before the narration rows, so created_at ordering is guaranteed -
  // the log always shows both decisions before the shared outcome, even though
  // both players submitted near-simultaneously.
  await Promise.all([
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: pendingActions[0].characterId,
      event_type: 'action',
      content: pendingActions[0].action,
      metadata: { coopRound: true, railRoll: coopPlan.resolvedRolls.find(r => r.characterId === pendingActions[0].characterId) },
    }),
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: pendingActions[1].characterId,
      event_type: 'action',
      content: pendingActions[1].action,
      metadata: { coopRound: true, railRoll: coopPlan.resolvedRolls.find(r => r.characterId === pendingActions[1].characterId) },
    }),
  ]);
  await Promise.all([
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: pendingActions[0].characterId,
      event_type: 'narration',
      content: aiResponse.narration,
      metadata: { ...sharedTurnMeta, suggestedActions: char1Suggestions, personal: personalTurnMeta(updatedChar1, characters[0], aiResponse.character1Changes, char1LevelUp, grantedAbility1) },
    }),
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: pendingActions[1].characterId,
      event_type: 'narration',
      content: aiResponse.narration,
      metadata: { ...sharedTurnMeta, suggestedActions: char2Suggestions, personal: personalTurnMeta(updatedChar2, characters[1], aiResponse.character2Changes, char2LevelUp, grantedAbility2) },
    }),
  ]);

  return {
    narration: aiResponse.narration,
    diceRoll: diceResult || (coopPlan.resolvedRolls[0]
      ? {
          sides: 20,
          rolls: [coopPlan.resolvedRolls[0].rollResult],
          modifier: coopPlan.resolvedRolls[0].modifier,
          total: coopPlan.resolvedRolls[0].rollTotal,
          description: `${coopPlan.resolvedRolls[0].characterName}: ${coopPlan.resolvedRolls[0].reason}`,
        }
      : undefined),
    worldStateChanges: char2Result.updatedWorldState,
    character1Id: characters[0].id,
    character2Id: characters[1].id,
    characterChanges: {
      hp: updatedChar1.hp,
      max_hp: updatedChar1.max_hp,
      xp: updatedChar1.xp,
      level: updatedChar1.level,
      gold: updatedChar1.gold,
      inventory: updatedChar1.inventory,
      status_effects: updatedChar1.status_effects,
    },
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    // The API response goes to the player who submitted last (pendingActions[1])
    suggestedActions: char2Suggestions,
    isLevelUp: char1LevelUp,
    newAbility: grantedAbility1,
    isDeath: aiResponse.character1Changes?.isDeath ?? false,
    deathDescription: aiResponse.character1Changes?.deathDescription,
    isCombat: isCombatNow,
    isVictory: isVictoryNow,
    enemyName: aiResponse.enemyName,
    loot: (aiResponse.character1Changes?.loot || aiResponse.loot) as ActionResult['loot'],
    isHighStakes: aiResponse.isHighStakes,
    choiceCards: aiResponse.choiceCards,
    advanceAct: didAdvanceAct,
    isBossFight: aiResponse.isBossFight,
    bossPhaseAdvance: aiResponse.bossPhaseAdvance,
    combatEnemies: aiResponse.combatEnemies,
    enemyDefeated: aiResponse.enemyDefeated,
    statusEffectChanges: aiResponse.character1Changes?.statusEffectChanges as ActionResult['statusEffectChanges'],
    achievementUnlocked: aiResponse.achievementUnlocked,
    comboBonus: aiResponse.comboBonus,
    isMerchant: aiResponse.isMerchant,
    shopItems: aiResponse.shopItems as ShopItem[] | undefined,
    character2Changes: {
      hp: updatedChar2.hp,
      max_hp: updatedChar2.max_hp,
      gold: updatedChar2.gold,
      inventory: updatedChar2.inventory,
      xp: updatedChar2.xp,
      level: updatedChar2.level,
      status_effects: updatedChar2.status_effects,
      isLevelUp: char2LevelUp,
      newAbility: grantedAbility2,
      isDeath: aiResponse.character2Changes?.isDeath ?? false,
      deathDescription: aiResponse.character2Changes?.deathDescription,
      loot: aiResponse.character2Changes?.loot as InventoryItem[] | undefined,
      statusEffectChanges: aiResponse.character2Changes?.statusEffectChanges as ActionResult['statusEffectChanges'],
    },
  };
}
