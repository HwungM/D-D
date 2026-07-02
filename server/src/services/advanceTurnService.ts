import type { WorldState } from '../../../shared/types';

// Pure helpers behind POST /api/game/advance. Kept dependency-free (no
// supabase/AI calls) so the "always callable, never gated" behavior and the
// free-roam-to-macro-turn handoff are simple to unit test in isolation.

export type FreeRoamState = NonNullable<WorldState['freeRoam']>;

// Appends one micro-action + its reaction to the free-roam log for the
// current location. If the location changed since the log started, the old
// log is discarded — a new scene starts a fresh free-roam window.
export function appendFreeRoamEntry(
  freeRoam: WorldState['freeRoam'] | undefined,
  location: string | undefined,
  action: string,
  reaction: string,
): FreeRoamState {
  const now = new Date().toISOString();
  const sameScene = !!freeRoam && freeRoam.location === location;
  const base: FreeRoamState = sameScene ? freeRoam! : { startedAt: now, location, actions: [] };
  return {
    ...base,
    location,
    actions: [...base.actions, { action, reaction, createdAt: now }].slice(-20),
  };
}

// Summarizes how a live combat/tension sequence that played out through
// micro-actions actually concluded, so Advance's macro-turn narration
// responds to that outcome instead of re-litigating a fight the player
// already fought (and possibly fled, hid from, and survived) turn-by-turn.
// Returns undefined when nothing needs summarizing: no combat happened this
// scene, or the fight is STILL live (combatState.inCombat) — that case is
// already handled by the macro-turn pipeline's own combat-continuation logic,
// nothing new to fold in here.
export function buildCombatConclusionSummary(worldState: WorldState): string | undefined {
  if (worldState.combatState?.inCombat) return undefined;

  if (worldState.lastCombatOutcome) {
    const { outcome, enemyName } = worldState.lastCombatOutcome;
    const foe = enemyName || 'the threat';
    if (outcome === 'victory') return `The party defeated ${foe} during live combat this scene (resolved turn-by-turn, not summarized).`;
    if (outcome === 'negotiated') return `The party talked ${foe} down/reached terms during this scene's confrontation, rather than fighting to the finish.`;
    if (outcome === 'fled') return `The party broke away from ${foe} and got clear during this scene.`;
  }

  // Still actively hiding when Advance is called — from the party's
  // perspective, staying hidden through to the scene's end IS how it
  // concluded: they evaded the threat for good (for now).
  if (worldState.tensionMeter?.active) {
    const foe = worldState.tensionMeter.hunterName || 'the threat';
    return `The party stayed hidden from ${foe} for the rest of the scene without being caught again.`;
  }

  return undefined;
}

// Same idea as buildCombatConclusionSummary, for a non-combat structured
// contest (heist/gambling/social con/chase — see NonCombatContestType and
// sceneState.skillChallenge) that played out through micro-actions. Returns
// undefined when nothing needs summarizing: no contest happened this scene,
// or the contest is STILL live (sceneState.skillChallenge) — that case is
// already surfaced to the macro-turn pipeline via the SKILL CHALLENGE STATE
// block (see dndTableSystem.ts), nothing new to fold in here.
export function buildContestConclusionSummary(worldState: WorldState): string | undefined {
  if (worldState.sceneState?.skillChallenge) return undefined;
  if (!worldState.lastContestOutcome) return undefined;

  const { outcome, objective } = worldState.lastContestOutcome;
  if (outcome === 'won') return `The party succeeded at "${objective}" during this scene's contest (resolved turn-by-turn, not summarized).`;
  if (outcome === 'lost') return `The party failed "${objective}" during this scene's contest.`;
  return `The party abandoned "${objective}" partway through this scene's contest.`;
}

// Summarizes a co-op party split across sub-locations at the moment Advance
// is called — e.g. one player free-roaming the tavern while the other is at
// the blacksmith, both within the same top-level location. Returns undefined
// when there's nothing to note (no split, or fewer than 2 characters with a
// tracked sub-location that actually differs). Folded into Advance's context
// so the DM's shared narrated beat can meaningfully bring the party back
// together instead of silently ignoring where everyone was standing.
export function buildPartySplitSummary(
  characterSubLocations: WorldState['characterSubLocations'] | undefined,
  characterIdToName: Record<string, string>,
  parentLocation?: string,
): string | undefined {
  const entries = Object.entries(characterSubLocations || {})
    .filter(([id]) => characterIdToName[id])
    .map(([id, subLocation]) => ({ name: characterIdToName[id], subLocation }));
  if (entries.length === 0) return undefined;

  const distinctSubLocations = new Set(entries.map(e => e.subLocation));
  // Only worth calling out when there's an actual split — two-plus characters
  // in genuinely different sub-locations (or one of them still at the
  // top-level location while another is off in a sub-location).
  const namesWithoutSubLocation = Object.keys(characterIdToName).filter(id => !characterSubLocations?.[id]);
  const hasSplit = distinctSubLocations.size > 1 || (entries.length > 0 && namesWithoutSubLocation.length > 0);
  if (!hasSplit) return undefined;

  const parts = [
    ...entries.map(e => `${e.name} was in ${e.subLocation}`),
    ...namesWithoutSubLocation.map(id => `${characterIdToName[id]} was at ${parentLocation || 'the general area'}`),
  ];
  return `The party was split up: ${parts.join('; ')}.`;
}

// Builds the single action-text string handed to the existing macro-turn
// pipeline (processAction/processCoopAction) so "what happened during
// free-roam" becomes context for the turn, without touching that pipeline's
// internals. Never throws and always returns usable text regardless of state
// (no free-roam log, an empty log, a very long one, or no framing action) —
// this is what makes Advance "always callable, no gate".
export function buildAdvanceActionText(
  freeRoam: WorldState['freeRoam'] | undefined,
  framingAction?: string,
  combatConclusionSummary?: string,
  contestConclusionSummary?: string,
  partySplitSummary?: string,
): string {
  const framing = (framingAction || '').trim() || 'Move the story forward.';
  const entries = freeRoam?.actions || [];

  const combatBlock = combatConclusionSummary
    ? `\n\n(How this scene's danger concluded — respond to this outcome, don't re-resolve the fight itself: ${combatConclusionSummary})`
    : '';
  const contestBlock = contestConclusionSummary
    ? `\n\n(How this scene's contest concluded — respond to this outcome, don't re-resolve the contest itself: ${contestConclusionSummary})`
    : '';
  const splitBlock = partySplitSummary
    ? `\n\n(${partySplitSummary} Have this shared beat meaningfully bring the party back together — don't silently ignore that they were apart.)`
    : '';

  if (entries.length === 0) return `${framing}${combatBlock}${contestBlock}${splitBlock}`;

  const summary = entries
    .slice(-10)
    .map(entry => `- ${entry.action.trim()} -> ${entry.reaction.trim()}`)
    .join('\n');

  return `${framing}\n\n(During free-roam since the last turn, the party also did the following — treat this as established context, not a new request to resolve again:\n${summary})${combatBlock}${contestBlock}${splitBlock}`;
}

export function clearFreeRoam(): WorldState['freeRoam'] {
  return null;
}
