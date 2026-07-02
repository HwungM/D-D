import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldState } from '../../../shared/types';
import { appendFreeRoamEntry, buildAdvanceActionText, buildAdvanceDisplayText, buildCombatConclusionSummary, buildContestConclusionSummary, buildPartySplitSummary } from './advanceTurnService';

test('appendFreeRoamEntry starts a fresh log for a new scene and accumulates within one scene', () => {
  const first = appendFreeRoamEntry(undefined, 'The Docks', 'ask the dockhand about the ship', 'He shrugs — "Ask the harbormaster."');
  assert.equal(first.location, 'The Docks');
  assert.equal(first.actions.length, 1);

  const second = appendFreeRoamEntry(first, 'The Docks', 'examine the crates', 'Stamped with a merchant sigil you don\'t recognize.');
  assert.equal(second.actions.length, 2);

  // Moving to a new location starts a fresh window rather than carrying stale context forward.
  const thirdSceneReset = appendFreeRoamEntry(second, 'The Market', 'browse the stalls', 'A vendor waves you over.');
  assert.equal(thirdSceneReset.location, 'The Market');
  assert.equal(thirdSceneReset.actions.length, 1);
});

test('buildAdvanceActionText always returns usable text regardless of state — Advance is never gated', () => {
  // No free-roam log at all, no framing action.
  assert.equal(buildAdvanceActionText(undefined, undefined), 'Move the story forward.');

  // Empty free-roam log with a framing action.
  const emptyLog: WorldState['freeRoam'] = { startedAt: new Date().toISOString(), actions: [] };
  assert.equal(buildAdvanceActionText(emptyLog, 'Head to the harbor.'), 'Head to the harbor.');

  // A populated log gets folded in as context alongside the framing action.
  const populated: WorldState['freeRoam'] = {
    startedAt: new Date().toISOString(),
    location: 'The Docks',
    actions: [
      { action: 'ask the dockhand about the ship', reaction: 'He points you toward the harbormaster.', createdAt: new Date().toISOString() },
      { action: 'examine the crates', reaction: 'A merchant sigil you don\'t recognize.', createdAt: new Date().toISOString() },
    ],
  };
  const text = buildAdvanceActionText(populated, 'Go find the harbormaster.');
  assert.match(text, /Go find the harbormaster\./);
  assert.match(text, /ask the dockhand about the ship/);
  assert.match(text, /examine the crates/);

  // A huge log (beyond the cap) still returns without throwing, capped to the most recent entries.
  const huge: WorldState['freeRoam'] = {
    startedAt: new Date().toISOString(),
    actions: Array.from({ length: 50 }, (_, i) => ({ action: `micro action ${i}`, reaction: `reaction ${i}`, createdAt: new Date().toISOString() })),
  };
  assert.doesNotThrow(() => buildAdvanceActionText(huge));
  const hugeText = buildAdvanceActionText(huge);
  assert.match(hugeText, /micro action 49/);
  assert.doesNotMatch(hugeText, /micro action 0 /);
});

test('buildAdvanceDisplayText never exposes private free-roam context in the story feed', () => {
  assert.equal(buildAdvanceDisplayText(), 'Move the story forward.');
  assert.equal(buildAdvanceDisplayText('  Head for the harbor.  '), 'Head for the harbor.');
});

test('buildCombatConclusionSummary is undefined when no combat/tension happened this scene', () => {
  assert.equal(buildCombatConclusionSummary({} as WorldState), undefined);
});

test('buildCombatConclusionSummary is undefined while combat is still actively ongoing — the macro-turn pipeline already handles that itself', () => {
  const ws = {
    combatState: {
      inCombat: true, enemyName: 'Ashwing', enemyCondition: 'wounded' as const, roundNumber: 3, playerActionsAttempted: [],
    },
    lastCombatOutcome: { outcome: 'victory' as const, enemyName: 'Ashwing', concludedAt: new Date().toISOString() },
  } as WorldState;
  assert.equal(buildCombatConclusionSummary(ws), undefined);
});

test('buildCombatConclusionSummary reports a victory resolved through micro-action combat', () => {
  const ws = {
    lastCombatOutcome: { outcome: 'victory' as const, enemyName: 'Ashwing the Dragon', concludedAt: new Date().toISOString() },
  } as WorldState;
  const summary = buildCombatConclusionSummary(ws);
  assert.match(summary || '', /defeated Ashwing the Dragon/);
});

test('buildCombatConclusionSummary reports a successful flee/negotiation outcome', () => {
  const fled = buildCombatConclusionSummary({
    lastCombatOutcome: { outcome: 'fled', enemyName: 'the raiders', concludedAt: new Date().toISOString() },
  } as WorldState);
  assert.match(fled || '', /broke away from the raiders/);

  const negotiated = buildCombatConclusionSummary({
    lastCombatOutcome: { outcome: 'negotiated', enemyName: 'the cult leader', concludedAt: new Date().toISOString() },
  } as WorldState);
  assert.match(negotiated || '', /talked the cult leader down/);
});

test('buildCombatConclusionSummary reports staying hidden through to the end of the scene', () => {
  const ws = {
    tensionMeter: { active: true, heat: 65, hunterName: 'Ashwing the Dragon', actionsHidden: 3 },
  } as WorldState;
  const summary = buildCombatConclusionSummary(ws);
  assert.match(summary || '', /stayed hidden from Ashwing the Dragon/);
});

test('buildAdvanceActionText folds a combat conclusion summary in alongside the free-roam log', () => {
  const text = buildAdvanceActionText(undefined, 'Move on.', 'The party defeated the ogre during live combat this scene.');
  assert.match(text, /Move on\./);
  assert.match(text, /defeated the ogre during live combat/);
});

test('buildContestConclusionSummary is undefined when no contest happened this scene', () => {
  assert.equal(buildContestConclusionSummary({} as WorldState), undefined);
});

test('buildContestConclusionSummary is undefined while the contest is still live — nothing new to fold in yet', () => {
  const ws = {
    sceneState: {
      purpose: 'social', exchangeCount: 2, stalledCount: 0, pacingMode: 'tension',
      skillChallenge: {
        id: 'sc-1', objective: 'Win the hand', successes: 1, failures: 0,
        targetSuccesses: 3, maxFailures: 2, participantIds: ['char-1'], stakes: 'the deed',
        updatedAt: new Date().toISOString(),
      },
    },
    lastContestOutcome: { outcome: 'won' as const, objective: 'Win the hand', concludedAt: new Date().toISOString() },
  } as WorldState;
  assert.equal(buildContestConclusionSummary(ws), undefined);
});

test('buildContestConclusionSummary reports a won contest resolved through micro-actions', () => {
  const ws = {
    lastContestOutcome: { outcome: 'won' as const, objective: 'Win the hand against the Card Sharp', contestType: 'gambling' as const, concludedAt: new Date().toISOString() },
  } as WorldState;
  const summary = buildContestConclusionSummary(ws);
  assert.match(summary || '', /succeeded at "Win the hand against the Card Sharp"/);
});

test('buildContestConclusionSummary reports a lost and an abandoned contest', () => {
  const lost = buildContestConclusionSummary({
    lastContestOutcome: { outcome: 'lost', objective: 'Break into the archive', concludedAt: new Date().toISOString() },
  } as WorldState);
  assert.match(lost || '', /failed "Break into the archive"/);

  const abandoned = buildContestConclusionSummary({
    lastContestOutcome: { outcome: 'abandoned', objective: 'Win the hand', concludedAt: new Date().toISOString() },
  } as WorldState);
  assert.match(abandoned || '', /abandoned "Win the hand"/);
});

test('buildPartySplitSummary is undefined when nothing is split', () => {
  assert.equal(buildPartySplitSummary(undefined, {}), undefined);
  assert.equal(buildPartySplitSummary({}, { 'char-1': 'Alice', 'char-2': 'Bob' }), undefined);
});

test('buildPartySplitSummary reports two characters in different sub-locations', () => {
  const summary = buildPartySplitSummary(
    { 'char-1': 'The Rusty Anchor Tavern', 'char-2': 'Kellhaven Smithy' },
    { 'char-1': 'Alice', 'char-2': 'Bob' },
    'Kellhaven',
  );
  assert.match(summary || '', /split up/);
  assert.match(summary || '', /Alice was in The Rusty Anchor Tavern/);
  assert.match(summary || '', /Bob was in Kellhaven Smithy/);
});

test('buildPartySplitSummary reports one character in a sub-location while the other stayed at the general location', () => {
  const summary = buildPartySplitSummary(
    { 'char-1': 'The Rusty Anchor Tavern' },
    { 'char-1': 'Alice', 'char-2': 'Bob' },
    'Kellhaven',
  );
  assert.match(summary || '', /Alice was in The Rusty Anchor Tavern/);
  assert.match(summary || '', /Bob was at Kellhaven/);
});

test('buildAdvanceActionText folds a party split summary in as regroup context', () => {
  const text = buildAdvanceActionText(undefined, 'Move on.', undefined, undefined, 'The party was split up: Alice was in the Tavern; Bob was in the Smithy.');
  assert.match(text, /Move on\./);
  assert.match(text, /split up/);
  assert.match(text, /bring the party back together/);
});

test('buildAdvanceActionText folds a contest conclusion summary in alongside the combat one and the free-roam log', () => {
  const text = buildAdvanceActionText(
    undefined,
    'Move on.',
    'The party defeated the ogre during live combat this scene.',
    'The party succeeded at "Win the hand" during this scene\'s contest.',
  );
  assert.match(text, /Move on\./);
  assert.match(text, /defeated the ogre during live combat/);
  assert.match(text, /succeeded at "Win the hand"/);
});
