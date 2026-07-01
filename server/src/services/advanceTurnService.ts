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

// Builds the single action-text string handed to the existing macro-turn
// pipeline (processAction/processCoopAction) so "what happened during
// free-roam" becomes context for the turn, without touching that pipeline's
// internals. Never throws and always returns usable text regardless of state
// (no free-roam log, an empty log, a very long one, or no framing action) —
// this is what makes Advance "always callable, no gate".
export function buildAdvanceActionText(
  freeRoam: WorldState['freeRoam'] | undefined,
  framingAction?: string,
): string {
  const framing = (framingAction || '').trim() || 'Move the story forward.';
  const entries = freeRoam?.actions || [];
  if (entries.length === 0) return framing;

  const summary = entries
    .slice(-10)
    .map(entry => `- ${entry.action.trim()} -> ${entry.reaction.trim()}`)
    .join('\n');

  return `${framing}\n\n(During free-roam since the last turn, the party also did the following — treat this as established context, not a new request to resolve again:\n${summary})`;
}

export function clearFreeRoam(): WorldState['freeRoam'] {
  return null;
}
