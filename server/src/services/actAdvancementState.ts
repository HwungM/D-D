import type { WorldState } from '../../../shared/types';

export function activateBackstoryHooksForAct(
  worldState: WorldState,
  newAct: number,
): { worldStateUpdates: Partial<WorldState>; hooksChanged: boolean } {
  const hooks = worldState.backstoryHooks || [];
  const actLabel = newAct === 2 ? 'act2' : newAct === 3 ? 'act3' : 'act1';
  let hooksChanged = false;
  const updatedHooks = hooks.map(h => {
    if (h.status === 'dormant' && (h as unknown as Record<string, string>).seedTiming === actLabel) {
      hooksChanged = true;
      return { ...h, status: 'active' as const, seededAt: new Date().toISOString() };
    }
    return h;
  });

  return {
    worldStateUpdates: {
      actionsInCurrentAct: 0,
      ...(hooksChanged ? { backstoryHooks: updatedHooks } : {}),
    },
    hooksChanged,
  };
}
