import type { ActionResult, Character, WorldBible, WorldState } from '../../../shared/types';
import { enforceTurnPlanNarration, planOpeningTurn } from './gameDirector';
import { applyOpeningSceneQualityGate } from './openingSceneQualityGate';
import { generateCoopNarration, generateNarration, generateVillainMove } from './openai';
import { supabaseAdmin } from './supabase';
import {
  buildCampaignSpineSnapshot as buildCampaignSpineSnapshotFromSystem,
  buildLocationGraphSnapshot as buildLocationGraphSnapshotFromSystem,
  mergeWorldStateChanges as mergeWorldStateChangesFromSystem,
} from './worldStateSystem';

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

  // Check if the villain should make a proactive move — every 3 sessions or on first return
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
    ? `SUCCESSOR_ENTRY: Frame ${character.name}, a new ${character.race} ${character.class}, already arriving at the first playable situation after the fall of ${fallenHeroes[fallenHeroes.length - 1].name} (${fallenHeroes[fallenHeroes.length - 1].race} ${fallenHeroes[fallenHeroes.length - 1].class}, level ${fallenHeroes[fallenHeroes.length - 1].level}) — ${fallenHeroes[fallenHeroes.length - 1].cause}. NPCs may acknowledge the fallen. Do not invent ${character.name}'s dialogue, emotions, gestures, decisions, or first voluntary action. End by asking what the player does.${villainMovePreamble}`
    : `OPENING_SCENE: Establish the immediate place, NPC/world activity, pressure, and visible opportunities around ${character.name}. The hero is present but has not acted yet. Do not invent their dialogue, emotions, gestures, movement, decision, or opening action. Stop at the first choice and return control.${villainMovePreamble}`;

  const rawAiResponse = await generateNarration(
    openingAction,
    openingPlan.worldStateForNarration,
    openingWb,
    character as Character,
    [],
    openingContext
  );
  const aiResponse = applyOpeningSceneQualityGate({
    result: rawAiResponse,
    worldBible: openingWb,
    characters: [character as Character],
    isCoop: false,
  });
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

  // Save just the narration — no player action event for the opening
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
  const openingDirective = `OPENING_SCENE — this is the campaign's first beat, not a player action. Frame ${p1.name} and ${p2.name} already together in ONE shared place and moment. Establish what they can perceive, what NPCs/the world are doing, and the first pressure or opportunity. Neither hero has acted yet: invent no dialogue, emotions, gestures, movement, agreement, or decision for either one. End at the first shared choice and return control. Single camera: no "Meanwhile" or split locations.${villainMovePreamble}`;
  const partnerDirective = `Same opening scene — ${p2.name} is present alongside ${p1.name}, but has not taken a voluntary action yet. Do not perform the hero for the player.`;

  const rawAiResponse = await generateCoopNarration(
    [
      { character: p1, action: openingDirective },
      { character: p2, action: partnerDirective },
    ],
    openingWs,
    openingWb,
    [],
    openingContext
  );
  const aiResponse = applyOpeningSceneQualityGate({
    result: rawAiResponse,
    worldBible: openingWb,
    characters: party,
    isCoop: true,
  });

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
