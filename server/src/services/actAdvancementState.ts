import type { WorldState } from '../../../shared/types';
import { actRoleFor } from './actPacingSystem';

export function activateBackstoryHooksForAct(
  worldState: WorldState,
  newAct: number,
): { worldStateUpdates: Partial<WorldState>; hooksChanged: boolean } {
  const hooks = worldState.backstoryHooks || [];
  const role = actRoleFor(newAct);
  const actLabel = role === 2 ? 'act2' : role === 3 ? 'act3' : 'act1';
  let hooksChanged = false;
  const updatedHooks = hooks.map(h => {
    if (h.status === 'dormant' && (h as unknown as Record<string, string>).seedTiming === actLabel) {
      hooksChanged = true;
      return { ...h, status: 'active' as const, seededAt: new Date().toISOString() };
    }
    return h;
  });

  // Entering a new arc's setup act (role 1) means the previous arc's climax
  // just closed. endgamePhase tracks proximity to the *current arc's* climax,
  // not "the campaign is ending" — so it must not leak into the new arc and
  // silently skip that arc's own setup/escalation pacing.
  const enteringNewArcSetup = role === 1 && worldState.endgamePhase && worldState.endgamePhase !== 'none';

  return {
    worldStateUpdates: {
      actionsInCurrentAct: 0,
      ...(hooksChanged ? { backstoryHooks: updatedHooks } : {}),
      ...(enteringNewArcSetup ? { endgamePhase: 'none' as const } : {}),
    },
    hooksChanged,
  };
}
