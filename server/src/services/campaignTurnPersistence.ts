import type { Character, CharacterHistoryEntry, DiceRollResult, WorldBible, WorldState } from '../../../shared/types';
import { activateBackstoryHooksForAct } from './actAdvancementState';
import { canAdvanceAct } from './actPacingSystem';
import {
  appendCharacterHistory,
  appendFallenHero,
  applyCharacterConsequences,
} from './consequenceSystem';
import { extractFutureHooks } from './openai';
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
  const updates: Partial<Character> = applyCharacterConsequences(currentCharacter, actionResult);

  // Re-fetch latest world state right before writing to minimize race window in co-op.
  const { data: freshCampaign } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', campaign.id).single();
  const latestWorldState = (freshCampaign?.world_state as WorldState) || campaign.world_state;
  let newWorldState = { ...latestWorldState };

  if (actionResult.worldStateChanges) {
    newWorldState = mergeWorldStateChanges(newWorldState, actionResult.worldStateChanges as Partial<WorldState>);
  }

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
  }

  return true;
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
