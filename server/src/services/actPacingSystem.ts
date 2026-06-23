import type { WorldBible, WorldState } from '../../../shared/types';

type CampaignLength = NonNullable<WorldBible['playerPreferences']>['campaignLength'];

export function minimumActActions(length: CampaignLength | undefined, act: number): number {
  const minimumByLength: Record<string, number> = {
    one_shot: 2,
    short: 5,
    medium: 10,
    long: 20,
    open_ended: 24,
  };
  const base = minimumByLength[length || 'medium'] || 10;
  return act >= 3 ? Math.max(2, Math.floor(base * 0.7)) : base;
}

export function canAdvanceAct(
  worldState: WorldState,
  worldBible: WorldBible,
  act: number,
): { allowed: boolean; reason?: string } {
  const minimum = minimumActActions(worldBible.playerPreferences?.campaignLength, act);
  const actions = worldState.actionsInCurrentAct || 0;
  if (actions < minimum) {
    return { allowed: false, reason: `Act ${act} needs at least ${minimum} meaningful actions; only ${actions} are complete.` };
  }

  if (act === 1) {
    const required = worldBible.dmRoadmap?.act1MustIntroduce || [];
    const knownText = [
      ...(worldState.npcMemory || []).map(npc => npc.name),
      ...(worldState.discoveredLocations || []),
      ...(worldState.completedEvents || []),
    ].join(' ').toLowerCase();
    const missing = required.filter(item => !knownText.includes(item.toLowerCase()));
    if (missing.length > 0) {
      return { allowed: false, reason: `Act 1 still needs: ${missing.join(', ')}.` };
    }
  }

  return { allowed: true };
}
