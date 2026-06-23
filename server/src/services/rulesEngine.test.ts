import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, RollContext, WorldState } from '../../../shared/types';
import {
  calculateActionXp,
  degreeOfSuccess,
  normalizeMechanicalConsequences,
  resolvePlayerCombatRoll,
} from './rulesEngine';

test('degreeOfSuccess handles criticals and margins consistently', () => {
  assert.equal(degreeOfSuccess(1, 20, 10), 'critical_failure');
  assert.equal(degreeOfSuccess(20, 20, 25), 'critical_success');
  assert.equal(degreeOfSuccess(8, 8, 12), 'clear_failure');
  assert.equal(degreeOfSuccess(11, 11, 12), 'near_miss');
  assert.equal(degreeOfSuccess(12, 12, 12), 'partial_success');
  assert.equal(degreeOfSuccess(16, 16, 12), 'clean_success');
});

test('XP is deterministic and rewards dramatic cooperative combat', () => {
  const ordinary = calculateActionXp(3, 'clean_success');
  assert.equal(ordinary, calculateActionXp(3, 'clean_success'));
  assert.ok(calculateActionXp(3, 'clean_success', { combat: true, dramatic: true, coop: true }) > ordinary);
  assert.ok(calculateActionXp(3, 'near_miss') > calculateActionXp(3, 'clear_failure'));
});

test('AI-proposed mechanical consequences are bounded', () => {
  const normalized = normalizeMechanicalConsequences(
    { level: 2, max_hp: 18 },
    {
      hpChange: -999,
      goldChange: 999999,
      loot: Array.from({ length: 6 }, (_, index) => ({
        id: String(index),
        name: `Item ${index}`,
        description: 'x'.repeat(1000),
        quantity: 999,
        type: 'misc',
        value: 999999,
      })),
    },
  );
  assert.equal(normalized.hpChange, -13);
  assert.equal(normalized.goldChange, 200);
  assert.equal(normalized.loot?.length, 3);
  assert.equal(normalized.loot?.[0].quantity, 5);
  assert.equal(normalized.loot?.[0].description.length, 500);
});

test('successful attack rolls reduce exact enemy HP using class damage', () => {
  const character = {
    class: 'Fighter',
    stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
  } as Pick<Character, 'class' | 'stats'>;
  const combatState: NonNullable<WorldState['combatState']> = {
    inCombat: true,
    enemyName: 'Ogre',
    enemyCondition: 'healthy',
    roundNumber: 1,
    playerActionsAttempted: [],
    enemies: [{ name: 'Ogre', archetype: 'soldier', maxHp: 20, currentHp: 20, condition: 'healthy' }],
  };
  const context: RollContext = {
    stat: 'str',
    dc: 12,
    diceType: 'd20',
    description: 'Attack the ogre with my sword',
    successDescription: 'The blade lands.',
    failDescription: 'The ogre turns it aside.',
    isDramatic: false,
    modifier: 3,
  };
  const result = resolvePlayerCombatRoll(character, combatState, context, 16, 19, 12, () => 0);
  assert.equal(result?.damage, 6);
  assert.equal(result?.combatState?.enemies?.[0].currentHp, 14);
  assert.equal(result?.victory, false);
});

test('non-attack checks do not mutate combat HP', () => {
  const result = resolvePlayerCombatRoll(
    { class: 'Wizard', stats: { str: 8, dex: 14, con: 12, int: 18, wis: 12, cha: 10 } },
    {
      inCombat: true,
      enemyName: 'Cultist',
      enemyCondition: 'healthy',
      roundNumber: 1,
      playerActionsAttempted: [],
      enemies: [{ name: 'Cultist', archetype: 'mage', maxHp: 12, currentHp: 12, condition: 'healthy' }],
    },
    {
      stat: 'int',
      dc: 12,
      diceType: 'd20',
      description: 'Recall the sigil carved into the wall',
      successDescription: 'You remember.',
      failDescription: 'The memory slips away.',
      isDramatic: false,
      modifier: 4,
    },
    15,
    19,
    12,
  );
  assert.equal(result, null);
});
