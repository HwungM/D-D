import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character } from '../../../shared/types';
import {
  applyAbilityCooldowns,
  applyCharacterConsequences,
  applyStatusEffects,
  consumeInventoryItems,
} from './consequenceSystem';

const baseCharacter: Character = {
  id: 'c1',
  user_id: 'u1',
  campaign_id: 'camp1',
  name: 'King',
  race: 'Human',
  class: 'Fighter',
  level: 1,
  xp: 0,
  hp: 10,
  max_hp: 12,
  stats: { str: 15, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
  abilities: [{ name: 'Second Wind', description: 'Recover.', cooldown: 2, currentCooldown: 0 }],
  inventory: [{ id: 'p1', name: 'Potion', description: 'Heals.', quantity: 2, type: 'potion' }],
  gold: 5,
  reputation: {},
  is_alive: true,
  created_at: 'now',
  updated_at: 'now',
};

test('character consequences clamp HP and gold while stacking loot', () => {
  const updates = applyCharacterConsequences(baseCharacter, {
    hpChange: -4,
    goldChange: 10,
    loot: [{ id: 'p2', name: 'Potion', description: 'Another.', quantity: 1, type: 'potion' }],
  });

  assert.equal(updates.hp, 6);
  assert.equal(updates.gold, 15);
  assert.equal(updates.inventory?.find(item => item.name === 'Potion')?.quantity, 3);
});

test('character consequences apply level up and death deterministically', () => {
  const leveled = applyCharacterConsequences(baseCharacter, { xpGained: 300 });
  assert.equal(leveled.level, 2);
  assert.equal(leveled.max_hp, 20);
  assert.equal(leveled.hp, 18);

  const dead = applyCharacterConsequences(baseCharacter, { isDeath: true, deathDescription: 'Cut down.' });
  assert.equal(dead.hp, 0);
  assert.equal(dead.is_alive, false);
  assert.equal(dead.death_note, 'Cut down.');
});

test('status effects tick, remove, add, and normalize invalid types', () => {
  const effects = applyStatusEffects(
    [
      { name: 'Blessed', description: 'Bright.', type: 'buff', duration: 1 },
      { name: 'Poisoned', description: 'Sick.', type: 'debuff', duration: 2 },
    ],
    {
      remove: ['Poisoned'],
      add: [{ name: 'Inspired', description: 'Ready.', type: 'weird', duration: 3 }],
    },
  );

  assert.equal(effects.some(effect => effect.name === 'Blessed'), false);
  assert.equal(effects.some(effect => effect.name === 'Poisoned'), false);
  assert.equal(effects.find(effect => effect.name === 'Inspired')?.type, 'neutral');
});

test('ability cooldowns and consumed inventory are deterministic', () => {
  const abilities = applyAbilityCooldowns(baseCharacter.abilities, { abilityUsed: 'Second Wind' });
  assert.equal(abilities?.[0].currentCooldown, 2);

  const rested = applyAbilityCooldowns([{ ...baseCharacter.abilities[0], currentCooldown: 1 }], { isRest: true });
  assert.equal(rested?.[0].currentCooldown, 0);

  const inventory = consumeInventoryItems(baseCharacter.inventory, ['Potion']);
  assert.equal(inventory[0].quantity, 1);
});
