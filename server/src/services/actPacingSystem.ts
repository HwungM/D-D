import type { WorldBible, WorldState } from '../../../shared/types';

export type ActRole = 1 | 2 | 3;

export function actRoleFor(act: number): ActRole {
  const normalized = Math.max(1, Math.floor(act || 1));
  return (((normalized - 1) % 3) + 1) as ActRole;
}

export function arcNumberFor(act: number): number {
  return Math.floor((Math.max(1, Math.floor(act || 1)) - 1) / 3) + 1;
}

// Every campaign is now one continuous, open-ended, multi-arc saga (no more
// length tiers) — arcs chain forever the way 'open_ended' used to work, so a
// "finale" act only ends the campaign once endgamePhase actually calls for it.
export function isFinaleAct(worldState: WorldState, _worldBible: WorldBible, act: number): boolean {
  const role = actRoleFor(act);
  if (role !== 3) return false;
  return worldState.endgamePhase === 'approaching' || worldState.endgamePhase === 'confrontation';
}

// Pacing minimums always use the old "open_ended" numbers now that every
// campaign chains arcs forever instead of scaling to a length tier.
export function minimumActActions(act: number): number {
  const base = 24;
  const role = actRoleFor(act);
  if (role === 2) return Math.max(base + 2, Math.ceil(base * 1.3));
  return role === 3 ? Math.max(2, Math.floor(base * 0.7)) : base;
}

function actRoadmapGoals(worldBible: WorldBible, act: number): string[] {
  const roadmap = worldBible.dmRoadmap;
  if (!roadmap) return [];
  const role = actRoleFor(act);
  if (role === 1) return roadmap.act1Goals || [];
  if (role === 2) return roadmap.act2Goals || [];
  return roadmap.act3ConvergenceThreads || [];
}

function requiredGoalCount(total: number, act: number): number {
  const role = actRoleFor(act);
  if (total <= 0) return 0;
  if (role === 1) return Math.min(1, total);
  if (role === 2) return Math.min(total, Math.max(2, Math.ceil(total * 0.6)));
  return Math.min(total, Math.max(1, Math.ceil(total * 0.75)));
}

function hasResolvedCampaignThread(worldState: WorldState, phrase: string): boolean {
  const lower = phrase.toLowerCase();
  return [
    ...(worldState.completedEvents || []),
    ...(worldState.actGoalsAchieved || []),
    ...(worldState.sessionNotes || []),
    ...(worldState.campaignJournal || []).flatMap(entry => [entry.summary, ...(entry.keyDecisions || [])]),
    ...(worldState.storyLedger || [])
      .filter(entry => entry.status === 'resolved')
      .flatMap(entry => [entry.title, entry.summary]),
  ]
    .map(value => value.trim().toLowerCase())
    .filter(value => value.length >= 3)
    .some(value => value.includes(lower) || lower.includes(value));
}

export function canAdvanceAct(
  worldState: WorldState,
  worldBible: WorldBible,
  act: number,
): { allowed: boolean; reason?: string } {
  const minimum = minimumActActions(act);
  const actions = worldState.actionsInCurrentAct || 0;
  if (actions < minimum) {
    return { allowed: false, reason: `Act ${act} needs at least ${minimum} meaningful actions; only ${actions} are complete.` };
  }

  const role = actRoleFor(act);
  const arc = arcNumberFor(act);
  const finale = isFinaleAct(worldState, worldBible, act);

  if (role === 1) {
    const required = worldBible.dmRoadmap?.act1MustIntroduce || [];
    const knownText = [
      ...(worldState.npcMemory || []).map(npc => npc.name),
      ...(worldState.discoveredLocations || []),
      ...(worldState.completedEvents || []),
    ].join(' ').toLowerCase();
    const missing = required.filter(item => !knownText.includes(item.toLowerCase()));
    if (act === 1 && missing.length > 0) {
      return { allowed: false, reason: `Act 1 still needs: ${missing.join(', ')}.` };
    }

    const hasHook = worldState.activeQuests?.some(quest => quest.status === 'active' || quest.status === 'completed')
      || (worldState.actGoalsAchieved || []).length > 0
      || (act > 1 && (worldState.futureHooks || []).some(hook => !hook.resolved));
    if (!hasHook) {
      return {
        allowed: false,
        reason: act === 1
          ? 'Act 1 needs the central hook to become an active quest, completed beat, or roadmap goal before advancing.'
          : `Arc ${arc} setup needs a fresh hook, active quest, or unresolved future thread before advancing.`,
      };
    }
  }

  const roadmapGoals = actRoadmapGoals(worldBible, act);
  const neededGoals = requiredGoalCount(roadmapGoals.length, act);
  if (neededGoals > 0) {
    const achieved = new Set(worldState.actGoalsAchieved || []);
    const completed = roadmapGoals.filter(goal => achieved.has(goal) || (role === 3 && hasResolvedCampaignThread(worldState, goal)));
    if (completed.length < neededGoals) {
      const missing = roadmapGoals
        .filter(goal => !achieved.has(goal) && !(role === 3 && hasResolvedCampaignThread(worldState, goal)))
        .slice(0, Math.max(1, neededGoals - completed.length));
      return {
        allowed: false,
        reason: `Act ${act} needs ${neededGoals} roadmap goal${neededGoals === 1 ? '' : 's'} completed before advancing; still needs: ${missing.join(', ')}.`,
      };
    }
  }

  if (role === 2 && !worldState.lastHighStakesAction) {
    return { allowed: false, reason: `Act ${act} needs a real high-stakes reversal, danger, or decisive choice before it can advance.` };
  }

  if (role === 3) {
    const convergenceThreads = worldBible.dmRoadmap?.act3ConvergenceThreads || [];
    const unresolved = convergenceThreads.filter(thread => !hasResolvedCampaignThread(worldState, thread));
    if (unresolved.length > Math.max(0, convergenceThreads.length - neededGoals)) {
      return {
        allowed: false,
        reason: `Act ${act} needs its arc convergence threads resolved before advancing; still unresolved: ${unresolved.slice(0, 3).join(', ')}.`,
      };
    }

    if (worldState.combatState?.inCombat) {
      return { allowed: false, reason: `Act ${act} cannot resolve while combat is still active.` };
    }

    const finalResolutionText = [
      ...(worldState.completedEvents || []),
      ...(worldState.sessionNotes || []),
      ...(worldState.campaignJournal || []).map(entry => entry.summary),
    ].join(' ').toLowerCase();
    const hasResolution = /\b(defeated|redeemed|resolved|saved|destroyed|sealed|freed|ended|confronted|victory|epilogue)\b/.test(finalResolutionText);
    if (!hasResolution) {
      return { allowed: false, reason: `Act ${act} needs a concrete arc resolution recorded before it can advance.` };
    }

    if (finale && worldState.endgamePhase === 'approaching') {
      return { allowed: false, reason: `Act ${act} is the campaign finale and needs the final confrontation to actually happen before it can close.` };
    }
  }

  return { allowed: true };
}
