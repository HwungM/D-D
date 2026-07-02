import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldState } from '../../../shared/types';
import { buildCompanionEmergency, combatStateForEmergency, maybeBuildMacroEventFromMicroAction, rollMacroDifficulty } from './macroEventSystem';

test('macro difficulty is weighted but spans easy through deadly', () => {
  assert.equal(rollMacroDifficulty(() => 0.1), 'easy');
  assert.equal(rollMacroDifficulty(() => 0.5), 'moderate');
  assert.equal(rollMacroDifficulty(() => 0.8), 'hard');
  assert.equal(rollMacroDifficulty(() => 0.98), 'deadly');
});

test('large intent in a micro-action creates a structured macro event', () => {
  const event = maybeBuildMacroEventFromMicroAction('Rob the bank vault tonight', { currentLocation: 'Evermire' }, () => 0.2);
  assert.equal(event?.kind, 'heist');
  assert.equal(event?.choices[0].id, 'accept');
});

test('ordinary micro-actions do not randomly become unrelated macro events', () => {
  assert.equal(maybeBuildMacroEventFromMicroAction('Look closely at the desk', { currentLocation: 'Evermire' }, () => 0.5), undefined);
});

test('ordinary micro-actions can rarely trigger a context-aware major interruption', () => {
  const rolls = [0.01, 0.4];
  const event = maybeBuildMacroEventFromMicroAction('Search the sealed cellar', { currentLocation: 'Evermire' }, () => rolls.shift() ?? 0.5);
  assert.equal(event?.kind, 'crisis');
});

test('companion emergencies carry difficulty, location, and a live enemy', () => {
  const event = buildCompanionEmergency({ companionId: 'g', companionName: 'Garrow', kind: 'trouble', text: '', location: 'Evermire', subLocation: 'Library' }, () => 0.5);
  assert.equal(event.kind, 'companion_emergency');
  assert.equal(event.subLocation, 'Library');
  assert.equal(combatStateForEmergency(event).inCombat, true);
});
