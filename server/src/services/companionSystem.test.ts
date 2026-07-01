import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanionCharacter } from '../../../shared/types';
import {
  applyCompanionChanges,
  buildCompanionsPromptBlock,
  departCompanion,
  guardCompanionDeaths,
  recruitCompanion,
} from './companionSystem';

function makeCompanion(overrides: Partial<CompanionCharacter> = {}): CompanionCharacter {
  return {
    id: 'comp-1',
    name: 'Brynn',
    race: 'Dwarf',
    class: 'Fighter',
    level: 2,
    xp: 0,
    hp: 18,
    max_hp: 20,
    stats: { str: 14, dex: 10, con: 14, int: 8, wis: 10, cha: 8 },
    abilities: [],
    inventory: [],
    bondLevel: 20,
    is_alive: true,
    recruitedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('buildCompanionsPromptBlock lists only living companions with id/name/stats for the prompt context', () => {
  const alive = makeCompanion();
  const dead = makeCompanion({ id: 'comp-2', name: 'Fenn', is_alive: false });
  const block = buildCompanionsPromptBlock([alive, dead]);
  assert.ok(block.includes('comp-1'));
  assert.ok(block.includes('Brynn'));
  assert.ok(!block.includes('Fenn'));
  assert.equal(buildCompanionsPromptBlock([]), '');
  assert.equal(buildCompanionsPromptBlock(undefined), '');
});

test('applyCompanionChanges applies combat damage and reports the delta', () => {
  const companion = makeCompanion({ hp: 18, max_hp: 20 });
  const result = applyCompanionChanges([companion], { 'comp-1': { hpChange: -6 } });
  assert.equal(result.companions[0].hp, 12);
  assert.equal(result.appliedChanges['comp-1'].hp, 12);
  assert.deepEqual(result.deaths, []);
});

test('applyCompanionChanges grants XP, levels up, and grants a new ability using the same primitives as PCs', () => {
  const companion = makeCompanion({ level: 1, xp: 290, max_hp: 12, hp: 12 });
  // XP threshold for level 2 is 300 (shared/types XP_THRESHOLDS[1]).
  const result = applyCompanionChanges([companion], { 'comp-1': { xpGained: 20 } });
  assert.equal(result.companions[0].level, 2);
  assert.ok(result.companions[0].max_hp > 12, 'max HP should grow on level-up');
  assert.equal(result.levelUps.length, 1);
  assert.equal(result.levelUps[0].newLevel, 2);
});

test('applyCompanionChanges marks a companion dead and sets a death note when isDeath is set', () => {
  const companion = makeCompanion();
  const result = applyCompanionChanges([companion], { 'comp-1': { isDeath: true, deathDescription: 'Struck down by the ogre.' } });
  assert.equal(result.companions[0].is_alive, false);
  assert.equal(result.companions[0].hp, 0);
  assert.equal(result.companions[0].deathNote, 'Struck down by the ogre.');
  assert.equal(result.deaths.length, 1);
  assert.equal(result.deaths[0].id, 'comp-1');
});

test('applyCompanionChanges also treats HP dropping to 0 as death even without an explicit isDeath flag', () => {
  const companion = makeCompanion({ hp: 5, max_hp: 20 });
  const result = applyCompanionChanges([companion], { 'comp-1': { hpChange: -10 } });
  assert.equal(result.companions[0].is_alive, false);
  assert.equal(result.companions[0].hp, 0);
});

test('guardCompanionDeaths blocks an unearned death on a routine, low-stakes turn and keeps the companion battered but alive', () => {
  const { changes, blockedIds } = guardCompanionDeaths(
    { 'comp-1': { isDeath: true, deathDescription: 'A stray splinter finishes them.', hpChange: -2 } },
    { inCombat: false, isHighStakes: false, isCriticalFailure: false },
  );
  assert.deepEqual(blockedIds, ['comp-1']);
  assert.equal(changes?.['comp-1'].isDeath, false);
  assert.equal(changes?.['comp-1'].deathDescription, undefined);
  assert.ok((changes?.['comp-1'].hpChange ?? 0) < 0, 'should stay damaged, just not dead');
});

test('guardCompanionDeaths allows a death when combat is live', () => {
  const { changes, blockedIds } = guardCompanionDeaths(
    { 'comp-1': { isDeath: true, deathDescription: 'Overwhelmed by the ambush.' } },
    { inCombat: true, isHighStakes: false, isCriticalFailure: false },
  );
  assert.deepEqual(blockedIds, []);
  assert.equal(changes?.['comp-1'].isDeath, true);
});

test('guardCompanionDeaths allows a death when the beat is high-stakes', () => {
  const { blockedIds } = guardCompanionDeaths(
    { 'comp-1': { isDeath: true } },
    { inCombat: false, isHighStakes: true, isCriticalFailure: false },
  );
  assert.deepEqual(blockedIds, []);
});

test('guardCompanionDeaths allows a death after a critical failure', () => {
  const { blockedIds } = guardCompanionDeaths(
    { 'comp-1': { isDeath: true } },
    { inCombat: false, isHighStakes: false, isCriticalFailure: true },
  );
  assert.deepEqual(blockedIds, []);
});

test('recruitCompanion adds a new full companion sheet scaled to the party level', () => {
  const { companions, recruited } = recruitCompanion([], { name: 'Torin', race: 'Human', class: 'Cleric' }, 5);
  assert.equal(companions.length, 1);
  assert.equal(recruited?.name, 'Torin');
  assert.equal(recruited?.race, 'Human');
  assert.equal(recruited?.class, 'Cleric');
  assert.equal(recruited?.level, 5);
  assert.ok(recruited && recruited.max_hp > 0);
  assert.equal(recruited?.is_alive, true);
});

test('recruitCompanion is a no-op when no recruit is signaled', () => {
  const existing = [makeCompanion()];
  const { companions, recruited } = recruitCompanion(existing, undefined, 3);
  assert.equal(companions.length, 1);
  assert.equal(recruited, undefined);
});

test('departCompanion removes the companion from the roster without marking them dead', () => {
  const companion = makeCompanion();
  const { companions, departed } = departCompanion([companion], { id: 'comp-1', reason: 'Chose to stay behind and rebuild the village.' });
  assert.equal(companions.length, 0);
  assert.equal(departed?.name, 'Brynn');
  assert.equal(departed?.reason, 'Chose to stay behind and rebuild the village.');
});

test('departCompanion is a no-op when the id does not match any companion', () => {
  const companion = makeCompanion();
  const { companions, departed } = departCompanion([companion], { id: 'unknown-id' });
  assert.equal(companions.length, 1);
  assert.equal(departed, undefined);
});
