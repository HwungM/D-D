import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldState } from '../../../shared/types';
import { appendFreeRoamEntry, buildAdvanceActionText } from './advanceTurnService';

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
