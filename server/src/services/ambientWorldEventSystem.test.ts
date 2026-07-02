import assert from 'node:assert/strict';
import test from 'node:test';
import type { RandomWorldEvent, WorldBible, WorldState } from '../../../shared/types';
import {
  AMBIENT_EVENT_MIN_SPACING,
  appendWorldEvent,
  buildAmbientWorldEvent,
  classifyAmbientEventCategory,
  pickAmbientEventSeed,
  shouldFireAmbientEvent,
  weaveAmbientEventIntoReaction,
} from './ambientWorldEventSystem';

function worldBibleWithSeeds(seeds: string[] = ['A caravan passes through, exhausted and wary.', 'The sky flickers strangely.']): WorldBible {
  return {
    geography: [], pantheon: [], toneRules: [], forbiddenLoreHooks: [], factions: [],
    era: 'Age of Test', magicSystem: 'test',
    primaryAntagonist: { name: 'X', type: 'primary', agenda: '', currentStep: '', planSteps: [], whatTheyKnow: '', isRevealed: false, power: 'minor' },
    centralConflict: '', antagonistRoster: [], openingHooks: [],
    ambientEventSeeds: seeds,
  };
}

function freeRoamWithActions(count: number): WorldState['freeRoam'] {
  const now = Date.now();
  return {
    startedAt: new Date(now - count * 1000).toISOString(),
    location: 'Ash Gate',
    actions: Array.from({ length: count }, (_, i) => ({
      action: `action ${i}`,
      reaction: `reaction ${i}`,
      createdAt: new Date(now - (count - i) * 1000).toISOString(),
    })),
  };
}

test('shouldFireAmbientEvent never fires with no authored seed pool', () => {
  const wb = worldBibleWithSeeds([]);
  const ws: WorldState = { freeRoam: freeRoamWithActions(20) };
  // random() always returns 0, which would otherwise guarantee a fire.
  assert.equal(shouldFireAmbientEvent(ws, wb, () => 0), false);
});

test('shouldFireAmbientEvent respects the minimum-spacing cooldown', () => {
  const wb = worldBibleWithSeeds();
  const tooSoon: WorldState = { freeRoam: freeRoamWithActions(AMBIENT_EVENT_MIN_SPACING - 1) };
  assert.equal(shouldFireAmbientEvent(tooSoon, wb, () => 0), false);

  const eligible: WorldState = { freeRoam: freeRoamWithActions(AMBIENT_EVENT_MIN_SPACING) };
  assert.equal(shouldFireAmbientEvent(eligible, wb, () => 0), true);
});

test('shouldFireAmbientEvent respects the roll against AMBIENT_EVENT_CHANCE once eligible', () => {
  const wb = worldBibleWithSeeds();
  const eligible: WorldState = { freeRoam: freeRoamWithActions(AMBIENT_EVENT_MIN_SPACING) };
  // random() returns just under the chance threshold vs. just at/over it.
  assert.equal(shouldFireAmbientEvent(eligible, wb, () => 0.001), true);
  assert.equal(shouldFireAmbientEvent(eligible, wb, () => 0.99), false);
});

test('shouldFireAmbientEvent counts spacing from the last recorded event, not scene start', () => {
  const wb = worldBibleWithSeeds();
  const freeRoam = freeRoamWithActions(20);
  // Last event fired right after the 15th free-roam action — only 5 actions since.
  const lastEvent: RandomWorldEvent = {
    id: 'evt-1',
    description: 'seed',
    triggeredAt: freeRoam!.actions[14].createdAt,
    category: 'other',
  };
  const ws: WorldState = { freeRoam, recentWorldEvents: [lastEvent] };
  assert.equal(shouldFireAmbientEvent(ws, wb, () => 0), false);
});

test('pickAmbientEventSeed prefers seeds unused in recentWorldEvents', () => {
  const wb = worldBibleWithSeeds(['seed A', 'seed B']);
  const recent: RandomWorldEvent[] = [{ id: '1', description: 'seed A', triggeredAt: new Date().toISOString(), category: 'other' }];
  const picked = pickAmbientEventSeed(wb, recent, () => 0);
  assert.equal(picked, 'seed B');
});

test('pickAmbientEventSeed falls back to the full pool once all seeds are used', () => {
  const wb = worldBibleWithSeeds(['seed A', 'seed B']);
  const recent: RandomWorldEvent[] = [
    { id: '1', description: 'seed A', triggeredAt: new Date().toISOString(), category: 'other' },
    { id: '2', description: 'seed B', triggeredAt: new Date().toISOString(), category: 'other' },
  ];
  const picked = pickAmbientEventSeed(wb, recent, () => 0);
  assert.equal(picked, 'seed A');
});

test('buildAmbientWorldEvent produces a resolved, categorized event', () => {
  const event = buildAmbientWorldEvent('A caravan of refugees passes through, exhausted and wary.', 'Ash Gate');
  assert.equal(event.description, 'A caravan of refugees passes through, exhausted and wary.');
  assert.equal(event.locationName, 'Ash Gate');
  assert.equal(event.resolved, true);
  assert.ok(event.id);
  assert.ok(event.triggeredAt);
});

test('classifyAmbientEventCategory recognizes common flavor patterns', () => {
  assert.equal(classifyAmbientEventCategory('A cold wind rolls in from the north.'), 'other');
  assert.equal(classifyAmbientEventCategory('A weary traveler passes through the gate.'), 'stranger');
  assert.equal(classifyAmbientEventCategory('You spot a small pouch of gold coin left behind.'), 'windfall');
  assert.equal(classifyAmbientEventCategory('A cart loses a wheel nearby, causing a commotion.'), 'complication');
  assert.equal(classifyAmbientEventCategory('The stars flicker in an unnatural pattern.'), 'omen');
  assert.equal(classifyAmbientEventCategory('Word arrives of unrest in a distant province.'), 'news');
  assert.equal(classifyAmbientEventCategory('Something entirely unremarkable happens.'), 'other');
});

test('appendWorldEvent bounds recentWorldEvents to the last 10, dropping oldest first', () => {
  const existing: RandomWorldEvent[] = Array.from({ length: 10 }, (_, i) => ({
    id: `evt-${i}`,
    description: `event ${i}`,
    triggeredAt: new Date(2024, 0, i + 1).toISOString(),
    category: 'other',
  }));
  const newEvent: RandomWorldEvent = { id: 'evt-new', description: 'newest', triggeredAt: new Date(2024, 1, 1).toISOString(), category: 'other' };
  const result = appendWorldEvent(existing, newEvent);
  assert.equal(result.length, 10);
  assert.equal(result[0].id, 'evt-1'); // evt-0 dropped
  assert.equal(result[result.length - 1].id, 'evt-new');
});

test('appendWorldEvent works from an empty/undefined list', () => {
  const event: RandomWorldEvent = { id: 'evt-1', description: 'first', triggeredAt: new Date().toISOString(), category: 'other' };
  assert.deepEqual(appendWorldEvent(undefined, event), [event]);
});

test('weaveAmbientEventIntoReaction folds the event into the reaction as a brief aside, not a new turn', () => {
  const event = buildAmbientWorldEvent('A caravan of refugees passes through, exhausted and wary.');
  const woven = weaveAmbientEventIntoReaction('The merchant nods and takes your coin.', event);
  assert.ok(woven.startsWith('The merchant nods and takes your coin.'));
  assert.match(woven, /Meanwhile: A caravan of refugees passes through, exhausted and wary\./);
});
