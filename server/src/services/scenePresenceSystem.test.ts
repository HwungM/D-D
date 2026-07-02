import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldState } from '../../../shared/types';
import { validateNamedParticipantsPresent } from './scenePresenceSystem';

const king = { id: 'king', name: 'King' };
const sunMi = { id: 'sunmi', name: 'Sun Mi' };

test('blocks an action that involves a player in another sub-location', () => {
  const ws: WorldState = { characterSubLocations: { king: 'The Tavern', sunmi: 'The Library' } };
  const result = validateNamedParticipantsPresent('Give Sun Mi the sealed letter', king, [king, sunMi], ws);
  assert.equal(result?.absentName, 'Sun Mi');
  assert.match(result?.message || '', /Library/);
});

test('allows characters in the same sub-location to act together', () => {
  const ws: WorldState = { characterSubLocations: { king: 'The Library', sunmi: 'The Library' } };
  assert.equal(validateNamedParticipantsPresent('Ask Sun Mi to inspect the book with me', king, [king, sunMi], ws), undefined);
});

test('allows talking about an absent character without treating them as present', () => {
  const ws: WorldState = { characterSubLocations: { king: 'The Tavern', sunmi: 'The Library' } };
  assert.equal(validateNamedParticipantsPresent('Ask the barkeep about Sun Mi', king, [king, sunMi], ws), undefined);
});

test('blocks involving an AI companion after the player splits into a personal sub-location', () => {
  const ws: WorldState = {
    characterSubLocations: { king: 'The Library' },
    companions: [{ id: 'c1', name: 'Faelan', race: 'Elf', class: 'Ranger', level: 1, xp: 0, hp: 10, max_hp: 10, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, abilities: [], inventory: [], bondLevel: 0, is_alive: true, recruitedAt: 'now' }],
  };
  assert.equal(validateNamedParticipantsPresent('Have Faelan search the shelves', king, [king], ws)?.absentName, 'Faelan');
});
