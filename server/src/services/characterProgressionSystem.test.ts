import assert from 'node:assert/strict';
import test from 'node:test';
import { checkLevelUp, getStatModifier, rollDice } from './characterProgressionSystem';

test('dice rolling is deterministic when supplied a random source', () => {
  const rolls = [0, 0.5, 0.99];
  const result = rollDice(6, 2, 3, () => rolls.shift() ?? 0);
  assert.deepEqual(result.rolls, [1, 4, 6]);
  assert.equal(result.total, 13);
});

test('stat modifiers follow standard d20 math', () => {
  assert.equal(getStatModifier(8), -1);
  assert.equal(getStatModifier(10), 0);
  assert.equal(getStatModifier(15), 2);
  assert.equal(getStatModifier(20), 5);
});

test('level-up calculation grants level and constitution-scaled HP', () => {
  const result = checkLevelUp({
    level: 1,
    class: 'Fighter',
    xp: 300,
    stats: { str: 12, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
  });
  assert.equal(result.leveledUp, true);
  assert.equal(result.newLevel, 2);
  assert.equal(result.hpGain, 8);
});

test('level-up calculation does not advance below threshold or beyond cap', () => {
  assert.equal(checkLevelUp({
    level: 1,
    class: 'Wizard',
    xp: 299,
    stats: { str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 },
  }).leveledUp, false);

  assert.equal(checkLevelUp({
    level: 20,
    class: 'Fighter',
    xp: 999999,
    stats: { str: 20, dex: 10, con: 20, int: 10, wis: 10, cha: 10 },
  }).leveledUp, false);
});
