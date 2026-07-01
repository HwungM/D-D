import type { DmRoadmapArcSegment, WorldBible, WorldState } from '../../../shared/types';

export type ActRole = 1 | 2 | 3;

export function actRoleFor(act: number): ActRole {
  const normalized = Math.max(1, Math.floor(act || 1));
  return (((normalized - 1) % 3) + 1) as ActRole;
}

export function arcNumberFor(act: number): number {
  return Math.floor((Math.max(1, Math.floor(act || 1)) - 1) / 3) + 1;
}

// Despite the name, this does NOT mean "the whole campaign is ending" — every
// campaign is one continuous, open-ended, multi-arc saga (Critical Role style)
// where arcs chain forever. It means "this arc's climax act is at/near its
// final confrontation." endgamePhase tracks proximity to the *current arc's*
// climax and is reset to 'none' whenever a new arc's setup act begins (see
// campaignTurnPersistence.advanceActIfAllowed), so closing an arc's climax
// simply opens the next arc's setup instead of forcing the campaign to end.
// The only way a campaign actually ends is a player choosing the epilogue
// path (POST /api/game/epilogue) — pacing never forces it.
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

// Each arc gets its own mini roadmap (fresh act1/act2/act3 shape) rather than
// every later arc silently reusing arc 1's goals forever. Arc 1 reads straight
// off the base dmRoadmap fields (as before); arc 2+ reads its own generated
// segment (worldBible.dmRoadmap.arcSegments) when one exists, and only falls
// back to the base fields if that arc's segment hasn't been generated yet
// (see needsNextArcRoadmap / campaignGenerationService.generateNextArcRoadmapSegment).
export function roadmapSegmentForArc(worldBible: WorldBible, act: number): Pick<DmRoadmapArcSegment, 'act1Goals' | 'act1MustIntroduce' | 'act1ClimaxEvent' | 'act2Goals' | 'act2VillainEscalation' | 'act2ClimaxEvent' | 'act3ConvergenceThreads' | 'act3ClimaxEvent' | 'act3ResolutionOptions'> {
  const roadmap = worldBible.dmRoadmap;
  const arc = arcNumberFor(act);
  const segment = arc > 1 ? roadmap?.arcSegments?.[arc - 2] : undefined;
  if (segment) {
    return {
      act1Goals: segment.act1Goals || [],
      act1MustIntroduce: segment.act1MustIntroduce || [],
      act1ClimaxEvent: segment.act1ClimaxEvent || '',
      act2Goals: segment.act2Goals || [],
      act2VillainEscalation: segment.act2VillainEscalation || '',
      act2ClimaxEvent: segment.act2ClimaxEvent || '',
      act3ConvergenceThreads: segment.act3ConvergenceThreads || [],
      act3ClimaxEvent: segment.act3ClimaxEvent || '',
      act3ResolutionOptions: segment.act3ResolutionOptions || [],
    };
  }
  return {
    act1Goals: roadmap?.act1Goals || [],
    act1MustIntroduce: roadmap?.act1MustIntroduce || [],
    act1ClimaxEvent: roadmap?.act1ClimaxEvent || '',
    act2Goals: roadmap?.act2Goals || [],
    act2VillainEscalation: roadmap?.act2VillainEscalation || '',
    act2ClimaxEvent: roadmap?.act2ClimaxEvent || '',
    act3ConvergenceThreads: roadmap?.act3ConvergenceThreads || [],
    act3ClimaxEvent: roadmap?.act3ClimaxEvent || '',
    act3ResolutionOptions: roadmap?.act3ResolutionOptions || [],
  };
}

// True once an arc has closed its climax and the next arc's own roadmap
// segment has not been generated yet — callers (campaignTurnPersistence) use
// this to know when to kick off a lightweight AI addendum for the new arc.
export function needsNextArcRoadmap(worldBible: WorldBible, act: number): boolean {
  const arc = arcNumberFor(act);
  if (arc <= 1) return false;
  const segments = worldBible.dmRoadmap?.arcSegments || [];
  return !segments[arc - 2];
}

function actRoadmapGoals(worldBible: WorldBible, act: number): string[] {
  if (!worldBible.dmRoadmap) return [];
  const role = actRoleFor(act);
  const segment = roadmapSegmentForArc(worldBible, act);
  if (role === 1) return segment.act1Goals;
  if (role === 2) return segment.act2Goals;
  return segment.act3ConvergenceThreads;
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
    // Arc 1 reads the base act1MustIntroduce; a later arc's setup act uses its
    // own generated segment's must-introduce list (empty/no-op until that
    // segment exists, so nothing blocks an arc whose roadmap hasn't been
    // generated yet).
    const required = roadmapSegmentForArc(worldBible, act).act1MustIntroduce;
    const knownText = [
      ...(worldState.npcMemory || []).map(npc => npc.name),
      ...(worldState.discoveredLocations || []),
      ...(worldState.completedEvents || []),
    ].join(' ').toLowerCase();
    const missing = required.filter(item => !knownText.includes(item.toLowerCase()));
    if (missing.length > 0) {
      return {
        allowed: false,
        reason: act === 1
          ? `Act 1 still needs: ${missing.join(', ')}.`
          : `Arc ${arc} setup still needs: ${missing.join(', ')}.`,
      };
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
    const convergenceThreads = roadmapGoals;
    const unresolved = convergenceThreads.filter(thread => !hasResolvedCampaignThread(worldState, thread));
    if (unresolved.length > Math.max(0, convergenceThreads.length - neededGoals)) {
      return {
        allowed: false,
        reason: `Act ${act} needs its arc convergence threads resolved before advancing; still unresolved: ${unresolved.slice(0, 3).join(', ')}.`,
      };
    }

    // An arc's climax shouldn't close while it left pressing danger behind —
    // gate on unresolved high-urgency storyLedger threads the same way we
    // gate on unresolved convergence threads.
    const unresolvedHighUrgency = (worldState.storyLedger || [])
      .filter(entry => entry.urgency === 'high' && entry.status !== 'resolved');
    if (unresolvedHighUrgency.length > 0) {
      return {
        allowed: false,
        reason: `Act ${act} cannot close while high-urgency threads remain open: ${unresolvedHighUrgency.slice(0, 3).map(entry => entry.title).join(', ')}.`,
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
      return { allowed: false, reason: `Act ${act} is this arc's climax and needs its final confrontation to actually happen before it can close.` };
    }
  }

  return { allowed: true };
}
