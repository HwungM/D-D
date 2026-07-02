import type { NonCombatContestType, WorldState } from '../../../shared/types';
import { degreeOfSuccess } from './rulesEngine';

// Orchestrates non-combat structured contests (heists, gambling matches,
// extended social cons/stand-offs, chases) played out through repeated
// micro-actions — the non-combat counterpart to microActionCombat.ts. No AI
// call here: the dice were already rolled by the existing resolve-roll flow,
// and every consequence below is deterministic game logic (reusing
// rulesEngine.ts's degree-of-success math), not a model's invention.

export type SkillChallenge = NonNullable<NonNullable<WorldState['sceneState']>['skillChallenge']>;

// What a micro-action's reaction proposes when it recognizes a brand-new
// contest opening (see microActionService.ts's startContest field). Not yet a
// full SkillChallenge — targetSuccesses/maxFailures/participantIds/id are
// filled in by buildNewSkillChallenge once the seed is grounded and the first
// roll comes back.
export type ContestSeed = {
  objective: string;
  contestType: NonCombatContestType;
  stakesDescription: string;
  onSuccessHint: string;
  onFailureHint: string;
};

const DEFAULT_TARGET_SUCCESSES = 3;
const DEFAULT_MAX_FAILURES = 2;

export function buildNewSkillChallenge(args: ContestSeed & { participantIds: string[] }): SkillChallenge {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    objective: args.objective,
    successes: 0,
    failures: 0,
    targetSuccesses: DEFAULT_TARGET_SUCCESSES,
    maxFailures: DEFAULT_MAX_FAILURES,
    participantIds: args.participantIds,
    stakes: args.stakesDescription,
    updatedAt: now,
    contestType: args.contestType,
    stakesDescription: args.stakesDescription,
    onSuccessHint: args.onSuccessHint,
    onFailureHint: args.onFailureHint,
  };
}

// Code-side grounding check — a contest may only start when it's tied to
// something ACTUALLY present in the scene (a named NPC/object/exit already
// listed as a scene interactable, or the currently active NPC), never
// conjured from a bare wish. Mirrors the spirit of aiContractValidator's
// preventUngroundedFight: trust the model's classification only as far as it
// can be checked against real scene state, not blindly.
export function isContestGrounded(
  seed: Pick<ContestSeed, 'objective' | 'stakesDescription'>,
  sceneInteractables: { name: string }[],
  activeNPC?: string | null,
): boolean {
  const objective = (seed.objective || '').trim();
  const stakes = (seed.stakesDescription || '').trim();
  if (!objective) return false;
  const haystack = `${objective} ${stakes}`.toLowerCase();
  const names = [...sceneInteractables.map(i => i.name), activeNPC || ''].filter((name): name is string => !!name && name.trim().length > 0);
  return names.some(name => haystack.includes(name.toLowerCase()));
}

export type MicroContestOutcome = {
  updatedChallenge: SkillChallenge;
  status: 'ongoing' | 'won' | 'lost';
};

// One roll against an active (or brand-new, just-seeded) contest. Any degree
// of success short of a clear miss/near miss counts as a success toward the
// target — the same threshold convention microActionCombat.ts uses for
// escape attempts.
export function resolveMicroActionContestRoll(args: {
  skillChallenge: SkillChallenge;
  roll: number;
  total: number;
  dc: number;
}): MicroContestOutcome {
  const degree = degreeOfSuccess(args.roll, args.total, args.dc);
  const succeeded = degree !== 'critical_failure' && degree !== 'clear_failure' && degree !== 'near_miss';
  const successes = args.skillChallenge.successes + (succeeded ? 1 : 0);
  const failures = args.skillChallenge.failures + (succeeded ? 0 : 1);
  const updatedChallenge: SkillChallenge = { ...args.skillChallenge, successes, failures, updatedAt: new Date().toISOString() };
  const status: MicroContestOutcome['status'] =
    successes >= updatedChallenge.targetSuccesses ? 'won'
    : failures >= updatedChallenge.maxFailures ? 'lost'
    : 'ongoing';
  return { updatedChallenge, status };
}
