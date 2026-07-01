import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldState } from '../../../shared/types';
import { beginTensionFromCombat, escalateTension, resumeCombatFromTension, tensionFindChance } from './tensionSystem';

function fakeCombatState(): NonNullable<WorldState['combatState']> {
  return {
    inCombat: true,
    enemyName: 'Ashwing the Dragon',
    enemyCondition: 'wounded',
    roundNumber: 4,
    playerActionsAttempted: ['attack', 'attack'],
    enemies: [{ name: 'Ashwing the Dragon', archetype: 'boss', maxHp: 120, currentHp: 60, condition: 'wounded' }],
    isBossFight: true,
    bossPhase: 2,
  };
}

test('tensionFindChance escalates by action count, not time, and caps at 75%', () => {
  assert.equal(tensionFindChance(0), 0.15);
  assert.equal(Math.round(tensionFindChance(1) * 100), 27);
  assert.equal(Math.round(tensionFindChance(2) * 100), 39);
  assert.equal(Math.round(tensionFindChance(10) * 100), 75);
  // Never exceeds the cap no matter how many actions pass.
  assert.equal(tensionFindChance(1000), 0.75);
});

test('beginTensionFromCombat snapshots the paused encounter so it can resume exactly', () => {
  const combatState = fakeCombatState();
  const meter = beginTensionFromCombat(combatState);
  assert.equal(meter.active, true);
  assert.equal(meter.hunterName, 'Ashwing the Dragon');
  assert.equal(meter.huntingEnemies?.[0].currentHp, 60);
  assert.equal(meter.isBossFight, true);
  assert.equal(meter.bossPhase, 2);
  assert.equal(meter.actionsHidden, 0);
});

test('escalateTension is deterministic given a fixed random source', () => {
  const meter = beginTensionFromCombat(fakeCombatState());
  // Below the threshold -> stays hidden.
  const stillHidden = escalateTension(meter, () => 0.99);
  assert.equal(stillHidden.foundAgain, false);
  assert.equal(stillHidden.tensionMeter.active, true);
  assert.equal(stillHidden.tensionMeter.actionsHidden, 1);

  // Above the threshold -> found.
  const found = escalateTension(meter, () => 0.01);
  assert.equal(found.foundAgain, true);
  assert.equal(found.tensionMeter.active, false);
});

test('escalateTension raises the find-chance as more hidden actions accumulate', () => {
  let meter = beginTensionFromCombat(fakeCombatState());
  // A fixed random draw of 0.45 is a miss while the chance is still below it
  // (27% on action 1, 39% on action 2) but becomes a hit once the chance
  // climbs past it (51% on action 3) — proving the odds genuinely rise with
  // each additional hidden action rather than staying flat.
  const first = escalateTension(meter, () => 0.45);
  assert.equal(first.foundAgain, false);
  meter = first.tensionMeter;
  const second = escalateTension(meter, () => 0.45);
  assert.equal(second.foundAgain, false);
  meter = second.tensionMeter;
  const third = escalateTension(meter, () => 0.45);
  assert.equal(third.foundAgain, true);
});

test('resumeCombatFromTension rebuilds combat from the snapshot rather than starting fresh', () => {
  const combatState = fakeCombatState();
  const meter = beginTensionFromCombat(combatState);
  const resumed = resumeCombatFromTension(meter);
  assert.equal(resumed.inCombat, true);
  assert.equal(resumed.enemyName, 'Ashwing the Dragon');
  assert.equal(resumed.enemies?.[0].currentHp, 60);
  assert.equal(resumed.roundNumber, combatState.roundNumber + 1);
  assert.equal(resumed.isBossFight, true);
  assert.equal(resumed.bossPhase, 2);
});
