import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewSkillChallenge, isContestGrounded, resolveMicroActionContestRoll, type SkillChallenge } from './microActionContest';

function fakeChallenge(overrides: Partial<SkillChallenge> = {}): SkillChallenge {
  return {
    id: 'sc-1',
    objective: 'Win the hand against the Card Sharp',
    successes: 0,
    failures: 0,
    targetSuccesses: 3,
    maxFailures: 2,
    participantIds: ['char-1'],
    stakes: 'the deed to the old mill',
    updatedAt: new Date().toISOString(),
    contestType: 'gambling',
    stakesDescription: 'the deed to the old mill',
    onSuccessHint: 'The Card Sharp slides the deed across the table, sour-faced.',
    onFailureHint: 'The Card Sharp sweeps the pot — and your coin purse looks thin now.',
    ...overrides,
  };
}

test('buildNewSkillChallenge seeds a fresh challenge with sane defaults', () => {
  const challenge = buildNewSkillChallenge({
    objective: 'Sneak past the guards into the archive',
    contestType: 'heist',
    stakesDescription: 'the stolen ledger everyone is after',
    onSuccessHint: 'You slip inside unseen.',
    onFailureHint: 'An alarm bell rings out.',
    participantIds: ['char-1'],
  });
  assert.equal(challenge.successes, 0);
  assert.equal(challenge.failures, 0);
  assert.equal(challenge.targetSuccesses, 3);
  assert.equal(challenge.maxFailures, 2);
  assert.equal(challenge.contestType, 'heist');
  assert.ok(challenge.id);
  assert.deepEqual(challenge.participantIds, ['char-1']);
});

test('isContestGrounded requires the objective/stakes to reference something actually present in the scene', () => {
  const seed = { objective: 'Win the hand against the Card Sharp', stakesDescription: 'the deed to the old mill' };
  assert.equal(isContestGrounded(seed, [{ name: 'Card Sharp' }], null), true);
  assert.equal(isContestGrounded(seed, [{ name: 'Barkeep' }], null), false, 'no present NPC/object matches the proposed contest — must be rejected');
  assert.equal(isContestGrounded(seed, [{ name: 'Barkeep' }], 'Card Sharp'), true, 'the currently active NPC also counts as grounding');
});

test('isContestGrounded rejects an empty objective outright', () => {
  assert.equal(isContestGrounded({ objective: '', stakesDescription: 'anything' }, [{ name: 'anything' }], null), false);
});

test('resolveMicroActionContestRoll increments successes on a clean success and stays ongoing below target', () => {
  const outcome = resolveMicroActionContestRoll({
    skillChallenge: fakeChallenge(),
    roll: 15,
    total: 18,
    dc: 12, // clean success
  });
  assert.equal(outcome.updatedChallenge.successes, 1);
  assert.equal(outcome.updatedChallenge.failures, 0);
  assert.equal(outcome.status, 'ongoing');
});

test('resolveMicroActionContestRoll increments failures on a clear failure', () => {
  const outcome = resolveMicroActionContestRoll({
    skillChallenge: fakeChallenge(),
    roll: 3,
    total: 5,
    dc: 14, // margin -9 -> clear_failure
  });
  assert.equal(outcome.updatedChallenge.successes, 0);
  assert.equal(outcome.updatedChallenge.failures, 1);
  assert.equal(outcome.status, 'ongoing');
});

test('resolveMicroActionContestRoll resolves a win once successes reach the target', () => {
  const outcome = resolveMicroActionContestRoll({
    skillChallenge: fakeChallenge({ successes: 2 }),
    roll: 16,
    total: 19,
    dc: 12,
  });
  assert.equal(outcome.updatedChallenge.successes, 3);
  assert.equal(outcome.status, 'won');
});

test('resolveMicroActionContestRoll resolves a loss once failures reach the cap', () => {
  const outcome = resolveMicroActionContestRoll({
    skillChallenge: fakeChallenge({ failures: 1 }),
    roll: 2,
    total: 4,
    dc: 14,
  });
  assert.equal(outcome.updatedChallenge.failures, 2);
  assert.equal(outcome.status, 'lost');
});

test('resolveMicroActionContestRoll treats a partial success as a success toward the target (same threshold as combat escape attempts)', () => {
  const outcome = resolveMicroActionContestRoll({
    skillChallenge: fakeChallenge(),
    roll: 10,
    total: 13,
    dc: 12, // margin +1 -> partial_success
  });
  assert.equal(outcome.updatedChallenge.successes, 1);
  assert.equal(outcome.status, 'ongoing');
});
