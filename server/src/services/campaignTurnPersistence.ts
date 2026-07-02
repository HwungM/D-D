import type { Character, CharacterHistoryEntry, DiceRollResult, HiddenIdentity, PartyAsset, WorldBible, WorldState } from '../../../shared/types';
import { activateBackstoryHooksForAct } from './actAdvancementState';
import { actRoleFor, arcNumberFor, canAdvanceAct, needsNextArcRoadmap } from './actPacingSystem';
import {
  appendCharacterHistory,
  appendFallenHero,
  applyCharacterConsequences,
} from './consequenceSystem';
import { resolveIdentityRevealed } from './hiddenIdentitySystem';
import { extractFutureHooks, generateNextArcRoadmap } from './openai';
import { buildSceneInteractables } from './sceneInteractableSystem';
import { resolvePartyAssetGranted, resolveSignatureItemEarned } from './signatureRewardsService';
import { supabaseAdmin } from './supabase';
import {
  buildCampaignSpineSnapshot,
  buildLocationGraphSnapshot,
  mergeWorldStateChanges,
} from './worldStateSystem';

type ConsequenceInput = {
  worldStateChanges?: Partial<WorldState>;
  isLevelUp?: boolean;
  isDeath?: boolean;
  deathDescription?: string;
  xpGained?: number;
  hpChange?: number;
  goldChange?: number;
  loot?: { id: string; name: string; description: string; quantity: number; type: string; value?: number; setName?: string; setBonus?: string }[];
  diceResult?: DiceRollResult;
  diceDC?: number;
  statusEffectChanges?: { add?: { name: string; description: string; type: string; duration?: number }[]; remove?: string[] };
  sessionNote?: string;
  characterHistoryNote?: CharacterHistoryEntry;
  antagonistUpdate?: { name: string; newStep?: string; lastAction?: string; nowKnowsPlayers?: boolean };
  isRest?: boolean;
  abilityUsed?: string;
  consumedItems?: string[];
  // Already guarded by the caller (see signatureRewardsService.guardSignatureItemEarned)
  // before reaching here. Resolved against WorldState.signatureItemQuests: marks
  // the quest earned and attaches the built InventoryItem to whichever
  // character/companion owns it.
  signatureItemEarned?: { characterId: string; questId: string };
  // Already guarded by the caller (see signatureRewardsService.guardPartyAssetGranted).
  // Appended to WorldState.partyAssets.
  partyAssetGranted?: { kind: PartyAsset['kind']; name: string; description: string; locationName?: string; unlocksHint?: string };
  // Already built by the caller (see hiddenIdentitySystem.detectHiddenIdentityIntroduction)
  // when a newly introduced NPC plausibly matches WorldBible.plannedBetrayal.
  // Appended to WorldState.hiddenIdentities.
  hiddenIdentityIntroduced?: HiddenIdentity;
  // Already guarded by the caller (see hiddenIdentitySystem.guardIdentityRevealed).
  // Resolved against WorldState.hiddenIdentities: marks the matching entry
  // revealed and pushes a high-urgency StoryLedgerEntry.
  identityRevealed?: { npcName: string };
};

type CampaignPersistenceSnapshot = {
  id: string;
  world_state: WorldState;
  act?: number;
  world_bible?: WorldBible;
};

export async function applyConsequences(
  characterId: string,
  actionResult: ConsequenceInput,
  currentCharacter: Character,
  campaign: CampaignPersistenceSnapshot,
): Promise<{ updatedCharacter: Character; updatedWorldState: WorldState }> {
  // Re-fetch latest world state right before writing to minimize race window in co-op.
  const { data: freshCampaign } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', campaign.id).single();
  const latestWorldState = (freshCampaign?.world_state as WorldState) || campaign.world_state;
  let newWorldState = { ...latestWorldState };

  if (actionResult.worldStateChanges) {
    newWorldState = mergeWorldStateChanges(newWorldState, actionResult.worldStateChanges as Partial<WorldState>);
  }

  // Signature item quest completion: resolve against the freshest quest list,
  // mark it earned, and route the built item to whichever character owns it —
  // the acting PC (folded into the normal loot pipeline below) or a companion
  // (patched directly into worldState.companions). If the owner is neither
  // (e.g. a co-op partner's PC not loaded in this call), the quest is still
  // marked earned with earnedItem attached so the item isn't lost.
  const signatureResolution = resolveSignatureItemEarned(newWorldState, actionResult.signatureItemEarned, characterId);
  if (signatureResolution.signatureItemQuests) newWorldState.signatureItemQuests = signatureResolution.signatureItemQuests;
  if (signatureResolution.companions) newWorldState.companions = signatureResolution.companions;

  const partyAssets = resolvePartyAssetGranted(
    newWorldState,
    actionResult.partyAssetGranted,
    actionResult.characterHistoryNote?.description || 'a major earned moment',
  );
  if (partyAssets) newWorldState.partyAssets = partyAssets;

  // Hidden identity: append a newly-detected planned-betrayal introduction,
  // then resolve any (already-guarded) reveal into isRevealed/revealedAt plus
  // a high-urgency story ledger entry so the twist lands as a real beat.
  if (actionResult.hiddenIdentityIntroduced) {
    newWorldState.hiddenIdentities = [...(newWorldState.hiddenIdentities || []), actionResult.hiddenIdentityIntroduced];
  }
  const identityRevealResolution = resolveIdentityRevealed(newWorldState, actionResult.identityRevealed);
  if (identityRevealResolution.hiddenIdentities) newWorldState.hiddenIdentities = identityRevealResolution.hiddenIdentities;
  if (identityRevealResolution.storyLedger) newWorldState.storyLedger = identityRevealResolution.storyLedger;

  const updates: Partial<Character> = applyCharacterConsequences(currentCharacter, {
    ...actionResult,
    loot: signatureResolution.extraLootForActingCharacter
      ? [...(actionResult.loot || []), ...signatureResolution.extraLootForActingCharacter]
      : actionResult.loot,
  });

  // Accumulate session notes until the players explicitly end the shared session.
  if (actionResult.sessionNote) {
    newWorldState.sessionNotes = [...(newWorldState.sessionNotes || []), actionResult.sessionNote].slice(-100);
  }

  if (actionResult.characterHistoryNote) {
    newWorldState = appendCharacterHistory(newWorldState, actionResult.characterHistoryNote);
  }

  if (actionResult.antagonistUpdate) {
    const au = actionResult.antagonistUpdate;
    let antagonistName = au.name;
    if (antagonistName === '[UNKNOWN]') {
      const roster = campaign.world_bible?.antagonistRoster;
      const unrevealed = roster?.find(a => !a.isRevealed);
      antagonistName = unrevealed?.name || campaign.world_bible?.primaryAntagonist?.name || antagonistName;
    }
    const progress = { ...(newWorldState.antagonistProgress || {}) };
    const existing = progress[antagonistName] || { stepIndex: 0, lastAction: '', knowsPlayers: false };
    progress[antagonistName] = {
      stepIndex: au.newStep ? existing.stepIndex + 1 : existing.stepIndex,
      lastAction: au.lastAction || existing.lastAction,
      knowsPlayers: au.nowKnowsPlayers ?? existing.knowsPlayers,
    };
    newWorldState.antagonistProgress = progress;
  }

  if (actionResult.isDeath) {
    newWorldState = appendFallenHero(newWorldState, currentCharacter, actionResult.deathDescription);
  }

  // Single atomic world state write — eliminates co-op race conditions.
  newWorldState.locationGraph = buildLocationGraphSnapshot(newWorldState, campaign.world_bible);
  newWorldState.campaignSpine = buildCampaignSpineSnapshot(newWorldState, campaign.world_bible, campaign.act ?? 1);
  // A macro-turn (this is the only path that reaches applyConsequences) always
  // resolves the current scene: refresh the free-roam interactable map for
  // wherever the party ended up, and close out the free-roam window that fed
  // this turn — the next micro-actions start a fresh log against the new scene.
  newWorldState.sceneInteractables = buildSceneInteractables(newWorldState);
  newWorldState.freeRoam = null;
  // A concluded scene's combat/tension bookkeeping is scene-scoped — the next
  // scene's micro-actions start clean rather than carrying over a stale
  // "still being hunted" state or a summary already folded into this turn.
  newWorldState.tensionMeter = null;
  newWorldState.lastCombatOutcome = null;
  newWorldState.lastContestOutcome = null;
  await supabaseAdmin.from('campaigns').update({ world_state: newWorldState }).eq('id', campaign.id);

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('characters').update(updates).eq('id', characterId);
  }

  return {
    updatedCharacter: { ...currentCharacter, ...updates },
    updatedWorldState: newWorldState,
  };
}

export async function getRecentHistory(campaignId: string, characterId: string, limit = 20): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('story_events')
    .select('event_type, content, created_at')
    .eq('campaign_id', campaignId)
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];
  return data
    .reverse()
    .map(e => `[${e.event_type.toUpperCase()}] ${e.content.slice(0, 200)}`);
}

export async function advanceActIfAllowed(
  campaignId: string,
  proposedAdvanceAct: boolean | undefined,
  worldState: WorldState,
  worldBible: WorldBible,
  currentAct: number,
): Promise<boolean> {
  if (!proposedAdvanceAct || !canAdvanceAct(worldState, worldBible, currentAct).allowed) {
    return false;
  }

  const newAct = currentAct + 1;
  await supabaseAdmin.from('campaigns').update({ act: newAct }).eq('id', campaignId);

  const { data: freshCamp } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', campaignId).single();
  if (freshCamp) {
    const postActWs = (freshCamp.world_state as WorldState) || {};
    const { worldStateUpdates } = activateBackstoryHooksForAct(postActWs, newAct);
    const advancedWorldState = { ...postActWs, ...worldStateUpdates };
    advancedWorldState.locationGraph = buildLocationGraphSnapshot(advancedWorldState, worldBible);
    advancedWorldState.campaignSpine = buildCampaignSpineSnapshot(advancedWorldState, worldBible, newAct);
    await supabaseAdmin.from('campaigns').update({ world_state: advancedWorldState }).eq('id', campaignId);

    // Closing an arc's climax opens the next arc's setup rather than ending the
    // campaign. If that new arc doesn't have its own mini roadmap yet, generate
    // a lightweight addendum in the background so the arc feels organic instead
    // of silently reusing arc 1's goals forever.
    if (actRoleFor(newAct) === 1 && needsNextArcRoadmap(worldBible, newAct)) {
      queueNextArcRoadmapGeneration(campaignId, worldBible, advancedWorldState, arcNumberFor(newAct));
    }
  }

  return true;
}

function queueNextArcRoadmapGeneration(
  campaignId: string,
  worldBible: WorldBible,
  worldState: WorldState,
  arcNumber: number,
): void {
  generateNextArcRoadmap(worldBible, worldState, arcNumber)
    .then(async segment => {
      const { data: freshCamp } = await supabaseAdmin.from('campaigns').select('world_bible').eq('id', campaignId).single();
      const latestWorldBible = (freshCamp?.world_bible as WorldBible) || worldBible;
      if (!needsNextArcRoadmap(latestWorldBible, (arcNumber - 1) * 3 + 1)) return; // another writer already generated it
      const baseRoadmap: NonNullable<WorldBible['dmRoadmap']> = latestWorldBible.dmRoadmap || {
        act1Goals: [], act1MustIntroduce: [], act1ClimaxEvent: '',
        act2Goals: [], act2VillainEscalation: '', act2ClimaxEvent: '',
        act3ConvergenceThreads: [], act3ClimaxEvent: '', act3ResolutionOptions: [],
      };
      const segments = baseRoadmap.arcSegments || [];
      const updatedSegments = [...segments];
      updatedSegments[arcNumber - 2] = segment;
      await supabaseAdmin.from('campaigns').update({
        world_bible: {
          ...latestWorldBible,
          dmRoadmap: { ...baseRoadmap, arcSegments: updatedSegments },
        },
      }).eq('id', campaignId);
    })
    .catch(() => {});
}

export function queueFutureHookExtraction(
  options: {
    shouldRun: boolean;
    actionSummary: string;
    narration: string;
    worldState: WorldState;
    actorName: string;
    campaignId: string;
  },
): void {
  if (!options.shouldRun) return;

  extractFutureHooks(options.actionSummary, options.narration, options.worldState, options.actorName)
    .then(async hooks => {
      if (hooks.length === 0) return;
      const { data: freshCamp } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', options.campaignId).single();
      const latestWorldState = (freshCamp?.world_state as WorldState) || options.worldState;
      const existing = latestWorldState.futureHooks || [];
      const merged = [...existing, ...hooks].slice(-30);
      await supabaseAdmin.from('campaigns').update({
        world_state: { ...latestWorldState, futureHooks: merged },
      }).eq('id', options.campaignId);
    })
    .catch(() => {});
}
