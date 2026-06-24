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
  if (act === 2) return Math.max(base + 2, Math.ceil(base * 1.3));
  return act >= 3 ? Math.max(2, Math.floor(base * 0.7)) : base;
}

function actRoadmapGoals(worldBible: WorldBible, act: number): string[] {
  const roadmap = worldBible.dmRoadmap;
  if (!roadmap) return [];
  if (act === 1) return roadmap.act1Goals || [];
  if (act === 2) return roadmap.act2Goals || [];
  return roadmap.act3ConvergenceThreads || [];
}

function requiredGoalCount(total: number, length: CampaignLength | undefined, act: number): number {
  if (total <= 0) return 0;
  if (length === 'one_shot') return Math.min(1, total);
  if (act === 1) return Math.min(1, total);
  if (act === 2) return Math.min(total, Math.max(2, Math.ceil(total * 0.6)));
  return Math.min(total, Math.max(1, Math.ceil(total * 0.5)));
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

  const roadmapGoals = actRoadmapGoals(worldBible, act);
  const neededGoals = requiredGoalCount(roadmapGoals.length, worldBible.playerPreferences?.campaignLength, act);
  if (neededGoals > 0) {
    const achieved = new Set(worldState.actGoalsAchieved || []);
    const completed = roadmapGoals.filter(goal => achieved.has(goal));
    if (completed.length < neededGoals) {
      const missing = roadmapGoals.filter(goal => !achieved.has(goal)).slice(0, Math.max(1, neededGoals - completed.length));
      return {
        allowed: false,
        reason: `Act ${act} needs ${neededGoals} roadmap goal${neededGoals === 1 ? '' : 's'} completed before advancing; still needs: ${missing.join(', ')}.`,
      };
    }
  }

  if (act === 2 && worldBible.playerPreferences?.campaignLength !== 'one_shot' && !worldState.lastHighStakesAction) {
    return { allowed: false, reason: 'Act 2 needs a real high-stakes reversal, danger, or decisive choice before it can advance.' };
  }

  return { allowed: true };
}
