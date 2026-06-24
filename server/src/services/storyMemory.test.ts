import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldBible, WorldState } from '../../../shared/types';
import { formatStoryThreadsBlock, rankStoryThreads } from './storyMemory';

test('rankStoryThreads merges all sources, drops resolved, and ranks director beat first', () => {
  const worldState: WorldState = {
    pendingDirectorBeat: { beat: 'Bring the drowned bell into play', urgency: 'critical', expiresAfter: 99 },
    storyLedger: [
      { id: 'l1', kind: 'lead', title: 'The smuggler route', summary: 'Find where the ash road goods vanish.', status: 'pressing', urgency: 'high', createdAt: 'now' },
      { id: 'l2', kind: 'clue', title: 'Closed thread', summary: 'Already done.', status: 'resolved', urgency: 'low', createdAt: 'now' },
    ],
    backstoryHooks: [
      { characterId: 'c1', characterName: 'King', hook: 'The brother he left behind', status: 'active' },
      { characterId: 'c2', characterName: 'Sun Mi', hook: 'A debt to the fenced city', status: 'dormant' },
      { characterId: 'c3', characterName: 'Ghost', hook: 'Laid to rest', status: 'resolved' },
    ],
    foreshadowingLedger: [
      { id: 'f1', description: 'A hidden pact under the court', type: 'rumor', introducedInAct: 1, payoffStatus: 'developing', createdAt: 'now' },
      { id: 'f2', description: 'Paid already', type: 'event', introducedInAct: 1, payoffStatus: 'paid_off', createdAt: 'now' },
    ],
    futureHooks: [
      { id: 'h1', description: 'The spared bandit returns', source: 'test', createdAt: 'now', resolved: false },
      { id: 'h2', description: 'Resolved hook', source: 'test', createdAt: 'now', resolved: true },
    ],
    activeQuests: [{ title: 'Accept the ash road charge', description: 'Find what burned the road.', status: 'active' }],
  } as WorldState;

  const bible = { primaryAntagonist: { name: 'The Ashen Baron', agenda: 'unmake the gate', isRevealed: true } } as unknown as WorldBible;

  const threads = rankStoryThreads(worldState, bible, { limit: 8 });

  // Resolved/paid-off items are gone.
  assert.ok(!threads.some(t => /closed thread|paid already|resolved hook|laid to rest/i.test(t.text)));
  // The critical director beat ranks first.
  assert.equal(threads[0].kind, 'director_beat');
  // All live sources are represented.
  const kinds = new Set(threads.map(t => t.kind));
  for (const kind of ['director_beat', 'ledger', 'backstory', 'foreshadowing', 'future_hook', 'quest', 'antagonist']) {
    assert.ok(kinds.has(kind as never), `expected a ${kind} thread`);
  }
  // Active backstory outranks dormant backstory.
  const active = threads.findIndex(t => t.text.includes('brother he left behind'));
  const dormant = threads.findIndex(t => t.text.includes('debt to the fenced city'));
  assert.ok(active < dormant);
});

test('rankStoryThreads honors the limit and dedupes overlapping text', () => {
  const worldState: WorldState = {
    foreshadowingLedger: [{ id: 'f1', description: 'The hidden pact', type: 'rumor', introducedInAct: 1, payoffStatus: 'developing', createdAt: 'now' }],
    futureHooks: [{ id: 'h1', description: 'The hidden pact', source: 'test', createdAt: 'now', resolved: false }],
  } as WorldState;
  const threads = rankStoryThreads(worldState, undefined, { limit: 6 });
  assert.equal(threads.length, 1, 'overlapping threads collapse to one');

  const many: WorldState = {
    activeQuests: Array.from({ length: 10 }, (_, i) => ({ title: `Quest ${i}`, description: `do thing ${i}`, status: 'active' as const })),
  } as WorldState;
  assert.equal(rankStoryThreads(many, undefined, { limit: 4 }).length, 4);
});

test('formatStoryThreadsBlock returns empty string when nothing is open', () => {
  assert.equal(formatStoryThreadsBlock([]), '');
  const block = formatStoryThreadsBlock(rankStoryThreads({ activeQuests: [{ title: 'Q', description: 'd', status: 'active' }] } as WorldState, undefined));
  assert.match(block, /OPEN STORY THREADS/);
  assert.match(block, /\[Quest\] Q: d/);
});
