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
): string {
  const framing = (framingAction || '').trim() || 'Move the story forward.';
  const entries = freeRoam?.actions || [];

  const combatBlock = combatConclusionSummary
    ? `\n\n(How this scene's danger concluded — respond to this outcome, don't re-resolve the fight itself: ${combatConclusionSummary})`
    : '';

  if (entries.length === 0) return `${framing}${combatBlock}`;

  const summary = entries
    .slice(-10)
    .map(entry => `- ${entry.action.trim()} -> ${entry.reaction.trim()}`)
    .join('\n');

  return `${framing}\n\n(During free-roam since the last turn, the party also did the following — treat this as established context, not a new request to resolve again:\n${summary})${combatBlock}`;
}

export function clearFreeRoam(): WorldState['freeRoam'] {
  return null;
}
