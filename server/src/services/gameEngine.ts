import { supabaseAdmin } from './supabase';
import { generateNarration, generateRollOutcome, generateVillainMove, generateCoopNarration } from './openai';
import OpenAI from 'openai';
import type { Character, WorldState, WorldBible, ActionResult, CampaignJournalEntry, RollContext } from '../../../shared/types';
import { enforceTurnPlanNarration, planOpeningTurn } from './gameDirector';
import {
  applyConsequences,
  getRecentHistory,
} from './campaignTurnPersistence';
import {
  buildCampaignSpineSnapshot as buildCampaignSpineSnapshotFromSystem,
  buildLocationGraphSnapshot as buildLocationGraphSnapshotFromSystem,
  mergeWorldStateChanges as mergeWorldStateChangesFromSystem,
} from './worldStateSystem';
export { processAction } from './soloTurnProcessor';
export { processCoopAction } from './coopTurnProcessor';

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import { getAbilityForLevel } from '../../../shared/classAbilities';
import {
  calculateActionXp,
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
