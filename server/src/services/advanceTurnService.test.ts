import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldState } from '../../../shared/types';
import { appendFreeRoamEntry, buildAdvanceActionText, buildCombatConclusionSummary } from './advanceTurnService';

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
