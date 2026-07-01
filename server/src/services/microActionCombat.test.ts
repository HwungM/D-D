import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldState } from '../../../shared/types';
import { resolveMicroActionCombatRoll } from './microActionCombat';

function fakeCharacter() {
  return {
    class: 'Fighter',
    stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
    level: 3,
    max_hp: 30,
  };
}

function fakeCombatState(): NonNullable<WorldState['combatState']> {
  return {
    inCombat: true,
    enemyName: 'Ogre',
    enemyCondition: 'healthy',
    roundNumber: 1,
    playerActionsAttempted: [],
    enemies: [{ name: 'Ogre', archetype: 'soldier', maxHp: 20, currentHp: 20, condition: 'healthy' }],
  };
}

function attackRollContext() {
  return {
    stat: 'str' as const,
    dc: 12,
    diceType: 'd20',
    description: 'Attack the ogre with my sword',
    successDescription: 'The blade lands.',
    failDescription: 'The ogre turns it aside.',
    isDramatic: false,
    modifier: 3,
  };
}

test('a successful combat micro-action attack applies real enemy HP damage and defeats it when HP hits 0', () => {
  const outcome = resolveMicroActionCombatRoll({
    intent: 'attack',
    character: fakeCharacter(),
    combatState: { ...fakeCombatState(), enemies: [{ name: 'Ogre', archetype: 'soldier', maxHp: 20, currentHp: 5, condition: 'critical' }] },
    rollContext: attackRollContext(),
    roll: 16,
    total: 19,
    dc: 12,
    random: () => 0, // minimum damage roll, still enough to finish a 5 hp target
  });

  assert.equal(outcome.defeatedEnemies.length, 1);
  assert.equal(outcome.defeatedEnemies[0], 'Ogre');
  assert.equal(outcome.victory, true);
  assert.equal(outcome.combatState, null);
  // A clean success (margin +7) means no counterattack lands.
  assert.equal(outcome.characterHpChange, 0);
});

test('a missed combat micro-action attack triggers a real counterattack against the character', () => {
  const outcome = resolveMicroActionCombatRoll({
    intent: 'attack',
    character: fakeCharacter(),
    combatState: fakeCombatState(),
    rollContext: attackRollContext(),
    roll: 2,
    total: 5,
    dc: 12, // clear failure — misses entirely
    random: () => 0.5, // no companion present, so the hit always lands on the character
  });

  assert.equal(outcome.victory, false);
  assert.ok(outcome.characterHpChange < 0, 'a missed attack should let the enemy retaliate for real damage');
  assert.equal(outcome.combatState?.enemies?.[0].currentHp, 20, 'a miss never damages the enemy');
});

test('a partial-success attack lands but the character eats a reduced counterattack', () => {
  const missOutcome = resolveMicroActionCombatRoll({
    intent: 'attack',
    character: fakeCharacter(),
    combatState: fakeCombatState(),
    rollContext: attackRollContext(),
    roll: 6,
    total: 8,
    dc: 12,
    random: () => 0.5,
  });
  const partialOutcome = resolveMicroActionCombatRoll({
    intent: 'attack',
    character: fakeCharacter(),
    combatState: fakeCombatState(),
    rollContext: attackRollContext(),
    roll: 10,
    total: 13,
    dc: 12, // margin +1 -> partial_success
    random: () => 0.5,
  });
  assert.ok((partialOutcome.combatState!.enemies![0]!.currentHp as number) < 20, 'a partial success should still land damage');
  assert.ok(partialOutcome.characterHpChange < 0, 'a partial success still costs a reduced hit');
  assert.ok(Math.abs(partialOutcome.characterHpChange) < Math.abs(missOutcome.characterHpChange), 'partial success counterattack should be reduced vs a clean miss');
});

test('a successful hide/flee roll pauses combat and begins a tension meter instead of resolving the fight', () => {
  const outcome = resolveMicroActionCombatRoll({
    intent: 'hide',
    character: fakeCharacter(),
    combatState: fakeCombatState(),
    rollContext: { stat: 'dex', dc: 14, diceType: 'd20', description: 'slip behind the rubble', successDescription: 'You vanish from sight.', failDescription: 'It spots you.', isDramatic: true, modifier: 2 },
    roll: 15,
    total: 17,
    dc: 14,
    random: () => 0.9,
  });

  assert.equal(outcome.paused, true);
  assert.equal(outcome.combatState, null);
  assert.equal(outcome.tensionMeter?.active, true);
  assert.equal(outcome.tensionMeter?.hunterName, 'Ogre');
  assert.equal(outcome.characterHpChange, 0);
});

test('a failed flee attempt leaves combat active and the character takes a hit for exposing themselves', () => {
  const outcome = resolveMicroActionCombatRoll({
    intent: 'flee',
    character: fakeCharacter(),
    combatState: fakeCombatState(),
    rollContext: { stat: 'dex', dc: 16, diceType: 'd20', description: 'bolt for the door', successDescription: 'You break away.', failDescription: 'It cuts you off.', isDramatic: true, modifier: 0 },
    roll: 3,
    total: 3,
    dc: 16,
    random: () => 0.9,
  });

  assert.equal(outcome.paused, false);
  assert.equal(outcome.combatState?.inCombat, true);
  assert.ok(outcome.characterHpChange < 0);
});

test('companions can absorb a counterattack instead of the character on a missed attack', () => {
  const companions = [
    { id: 'comp-1', is_alive: true, name: 'Kira', hp: 20, max_hp: 20 } as never,
  ];
  const outcome = resolveMicroActionCombatRoll({
    intent: 'attack',
    character: fakeCharacter(),
    combatState: fakeCombatState(),
    rollContext: attackRollContext(),
    roll: 6,
    total: 8,
    dc: 12, // margin -4 -> clear_failure, a miss that lets the enemy counterattack
    companions,
    random: () => 0.1, // < 0.4 threshold -> counterattack hits the companion instead
  });

  assert.ok(outcome.companionChanges?.['comp-1']);
  assert.ok((outcome.companionChanges!['comp-1'].hpChange || 0) < 0);
  assert.equal(outcome.characterHpChange, 0);
});

test('companions gain XP when they assist a successful attack and again on victory', () => {
  const companions = [
    { id: 'comp-1', is_alive: true, name: 'Kira', hp: 20, max_hp: 20 } as never,
  ];
  const outcome = resolveMicroActionCombatRoll({
    intent: 'attack',
    character: fakeCharacter(),
    combatState: { ...fakeCombatState(), enemies: [{ name: 'Ogre', archetype: 'soldier', maxHp: 20, currentHp: 3, condition: 'critical' }] },
    rollContext: attackRollContext(),
    roll: 16,
    total: 19,
    dc: 12, // clean success -> lands, finishes a 3 hp target -> victory
    companions,
    random: () => 0.1, // below both the 0.3 assist threshold and picks the companion assist path
  });

  assert.equal(outcome.victory, true);
  assert.ok((outcome.companionChanges?.['comp-1']?.xpGained || 0) > 0, 'a living companion should gain XP from a victory resolved via micro-action combat');
});
