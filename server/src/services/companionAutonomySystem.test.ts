import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanionCharacter, WorldState } from '../../../shared/types';
import { createCompanionActivity, shouldTriggerCompanionActivity } from './companionAutonomySystem';

const companion: CompanionCharacter = {
  id: 'garrow', name: 'Garrow', race: 'Human', class: 'Ranger', level: 1, xp: 0,
  hp: 10, max_hp: 10, stats: { str: 10, dex: 12, con: 10, int: 10, wis: 12, cha: 8 },
  abilities: [], inventory: [], bondLevel: 10, is_alive: true, recruitedAt: '2026-01-01T00:00:00.000Z',
};

const worldState: WorldState = {
  currentLocation: 'Evermire', companions: [companion],
  locationGraph: {
    currentLocation: 'Evermire', updatedAt: '2026-01-01T00:00:00.000Z', nearby: [], regions: [],
    nodes: [{ name: 'Evermire', region: 'Mire', visits: 1, connectedTo: [], npcsPresent: [], questHooks: [], partyHere: [], tags: [], subLocations: [
      { id: 'library', name: 'Library', parentLocationName: 'Evermire', description: '', npcsPresent: [], objectsOfInterest: ['old records'], type: 'civic' },
    ] }],
  },
  freeRoam: { startedAt: '2026-01-01T00:00:00.000Z', actions: [
    { action: 'a', reaction: 'r', createdAt: '2026-01-01T00:00:01.000Z' },
    { action: 'b', reaction: 'r', createdAt: '2026-01-01T00:00:02.000Z' },
  ] },
};

test('companion autonomy waits for spacing and then honors its activity chance', () => {
  assert.equal(shouldTriggerCompanionActivity(worldState, () => 0.1), true);
  assert.equal(shouldTriggerCompanionActivity(worldState, () => 0.9), false);
});

test('companions can independently move into a real sublocation', () => {
  const rolls = [0, 0.1, 0];
  const result = createCompanionActivity(worldState, () => rolls.shift() ?? 0);
  assert.equal(result?.activity.kind, 'move');
  assert.equal(result?.activity.subLocation, 'Library');
  assert.equal(result?.worldState.companionLocations?.garrow.subLocation, 'Library');
});

test('companions can reveal a seeded clue and report it as their own activity', () => {
  const withClue: WorldState = { ...worldState, mysteryClues: [{ id: 'c1', status: 'undiscovered', clue: 'The bell was moved.', pointsToward: 'Who moved it?', possibleSources: [] }] };
  const rolls = [0, 0.7];
  const result = createCompanionActivity(withClue, () => rolls.shift() ?? 0);
  assert.equal(result?.activity.kind, 'clue');
  assert.equal(result?.worldState.mysteryClues?.[0].status, 'revealed');
});
