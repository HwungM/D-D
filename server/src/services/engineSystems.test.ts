import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldState } from '../../../shared/types';
import { ensureCombatEncounterCompleteness, preventUngroundedFight } from './aiContractValidator';
import { advanceCombatState, newlyDefeatedCombatants } from './combatSystem';
import { actionSignals } from './npcMemorySystem';

test('combat system starts and normalizes multi-enemy combat', () => {
  const result = advanceCombatState(null, {
    isCombat: true,
    enemyName: 'Rusk',
    combatEnemies: [
      { name: 'Rusk', archetype: 'soldier', maxHp: 12, condition: 'healthy' },
      { name: 'Mara', archetype: 'mage', maxHp: 8, currentHp: 7, condition: 'healthy' },
    ],
  }, ['I attack Rusk']);

  assert.equal(result.forcedVictory, false);
  assert.equal(result.combatState?.inCombat, true);
  assert.equal(result.combatState?.enemies?.length, 2);
  assert.equal(result.combatState?.enemies?.[0].armorClass, 15);
  assert.equal(result.combatState?.enemies?.[1].armorClass, 12);
});

test('combat system forces victory when all tracked enemies fall', () => {
  const previous: NonNullable<WorldState['combatState']> = {
    inCombat: true,
    enemyName: 'Rusk',
    enemyCondition: 'wounded',
    roundNumber: 2,
    playerActionsAttempted: [],
    enemies: [
      { name: 'Rusk', archetype: 'soldier', maxHp: 12, currentHp: 4, condition: 'wounded' },
    ],
  };

  const result = advanceCombatState(previous, {
    isCombat: true,
    enemyName: 'Rusk',
    combatEnemies: [
      { name: 'Rusk', archetype: 'soldier', maxHp: 12, currentHp: 0, condition: 'critical', isDefeated: true },
    ],
  }, ['finish the fight']);

  assert.equal(result.combatState, null);
  assert.equal(result.forcedVictory, true);
});

test('newly defeated combatants and player action signals are deterministic', () => {
  const defeated = newlyDefeatedCombatants(
    [{ name: 'Rusk', archetype: 'soldier', maxHp: 12, currentHp: 3, condition: 'critical' }],
    [{ name: 'Rusk', archetype: 'soldier', maxHp: 12, currentHp: 0, condition: 'critical', isDefeated: true }],
  );
  assert.deepEqual(defeated, ['Rusk']);
  assert.deepEqual(actionSignals(['We corner them but accept their surrender']), {
    pursuedOrCornered: true,
    sparedOrAcceptedSurrender: true,
    rescued: false,
  });
});

test('AI contract validator blocks ungrounded fight spawns', () => {
  const response = {
    narration: 'Two bandits suddenly appear and draw knives.',
    isCombat: true,
    enemyName: 'Rusk',
    combatEnemies: [{ name: 'Rusk', archetype: 'soldier' as const, maxHp: 12, condition: 'healthy' as const }],
    hpChange: -3,
    worldStateChanges: {
      activeNPC: 'Rusk',
      npcMemory: [{ name: 'Rusk', disposition: 'hostile' as const, notes: 'Appeared from nowhere.' }],
    },
  };

  const changed = preventUngroundedFight(response, ['look for a fight'], 'Old Road', false);
  assert.equal(changed, true);
  assert.equal(response.isCombat, false);
  assert.equal(response.hpChange, undefined);
  assert.equal(response.worldStateChanges?.activeNPC, null);
  assert.deepEqual(response.worldStateChanges?.npcMemory, []);
  assert.match(response.narration, /no enemy is in reach yet/i);
});

test('AI contract validator expands under-specified group fights into tracked combatants', () => {
  const response = {
    narration: 'Following the boot tracks to a ruined tollhouse, you see two bandits counting stolen coin beside the road.',
    isCombat: true,
    enemyName: 'bandits',
    combatEnemies: [{ name: 'Rusk', archetype: 'soldier' as const, maxHp: 12, condition: 'healthy' as const }],
  };

  const changed = ensureCombatEncounterCompleteness(response);
  assert.equal(changed, true);
  assert.equal(response.combatEnemies.length, 2);
  assert.deepEqual(response.combatEnemies.map(enemy => enemy.name), ['Rusk', 'Bandit 2']);
});
