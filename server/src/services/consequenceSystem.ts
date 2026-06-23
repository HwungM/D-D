import type { Character, CharacterHistoryEntry, InventoryItem, StatusEffect, WorldState } from '../../../shared/types';
import { getAbilityForLevel } from '../../../shared/classAbilities';
import { checkLevelUp } from './characterProgressionSystem';
import { normalizeMechanicalConsequences, stackInventory } from './rulesEngine';

export type ConsequenceInput = {
  isDeath?: boolean;
  deathDescription?: string;
  xpGained?: number;
  hpChange?: number;
  goldChange?: number;
  loot?: { id: string; name: string; description: string; quantity: number; type: string; value?: number; setName?: string; setBonus?: string }[];
  statusEffectChanges?: { add?: { name: string; description: string; type: string; duration?: number }[]; remove?: string[] };
  characterHistoryNote?: CharacterHistoryEntry;
  isRest?: boolean;
  abilityUsed?: string;
  consumedItems?: string[];
};

export function applyCharacterConsequences(
  currentCharacter: Character,
  actionResult: ConsequenceInput,
): Partial<Character> {
  const validItemTypes = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);
  const updates: Partial<Character> = {};
  const mechanical = normalizeMechanicalConsequences(currentCharacter, {
    hpChange: actionResult.hpChange,
    goldChange: actionResult.goldChange,
    loot: actionResult.loot,
  }, { isDeath: actionResult.isDeath });

  if (mechanical.hpChange !== undefined) {
    updates.hp = Math.max(0, Math.min(currentCharacter.max_hp, currentCharacter.hp + mechanical.hpChange));
  }

  if (mechanical.goldChange !== undefined) {
    updates.gold = Math.max(0, currentCharacter.gold + mechanical.goldChange);
  }

  if (mechanical.loot && mechanical.loot.length > 0) {
    const existingInventory = currentCharacter.inventory || [];
    const newItems = mechanical.loot
      .filter(item => item.name && typeof item.name === 'string')
      .map(item => ({
        id: item.id || crypto.randomUUID(),
        name: item.name,
        description: item.description || '',
        quantity: Math.max(1, Math.round(item.quantity || 1)),
        type: (validItemTypes.has(item.type) ? item.type : 'misc') as InventoryItem['type'],
        value: typeof item.value === 'number' && !isNaN(item.value) ? item.value : undefined,
        setName: item.setName,
        setBonus: item.setBonus,
      }));
    updates.inventory = stackInventory(existingInventory, newItems);
  }

  if (actionResult.xpGained && actionResult.xpGained > 0) {
    updates.xp = currentCharacter.xp + actionResult.xpGained;
    const levelCheck = checkLevelUp({ ...currentCharacter, xp: updates.xp });
    if (levelCheck.leveledUp && levelCheck.newLevel) {
      updates.level = levelCheck.newLevel;
      updates.max_hp = currentCharacter.max_hp + (levelCheck.hpGain ?? 0);
      updates.hp = Math.min(currentCharacter.hp + (levelCheck.hpGain ?? 0), updates.max_hp);
      const newAbility = getAbilityForLevel(currentCharacter.class, levelCheck.newLevel);
      if (newAbility) {
        const existingAbilities = currentCharacter.abilities || [];
        const alreadyHas = existingAbilities.some(ability => ability.name === newAbility.name);
        if (!alreadyHas) updates.abilities = [...existingAbilities, newAbility];
      }
    }
  }

  updates.status_effects = applyStatusEffects(currentCharacter.status_effects || [], actionResult.statusEffectChanges);

  const abilityUpdates = applyAbilityCooldowns(currentCharacter.abilities || [], actionResult);
  if (abilityUpdates) updates.abilities = abilityUpdates;

  if (actionResult.consumedItems && actionResult.consumedItems.length > 0) {
    updates.inventory = consumeInventoryItems(updates.inventory ?? currentCharacter.inventory ?? [], actionResult.consumedItems);
  }

  if (actionResult.isDeath) {
    updates.hp = 0;
    updates.is_alive = false;
    updates.death_note = actionResult.deathDescription || 'Fell in battle.';
  }

  return updates;
}

export function applyStatusEffects(
  currentEffects: StatusEffect[],
  changes: ConsequenceInput['statusEffectChanges'],
): StatusEffect[] {
  let effects: StatusEffect[] = [...currentEffects]
    .map(effect => effect.duration != null ? { ...effect, duration: effect.duration - 1 } : effect)
    .filter(effect => effect.duration == null || effect.duration > 0);

  if (changes?.remove) {
    const toRemove = new Set(changes.remove.map(name => name.toLowerCase()));
    effects = effects.filter(effect => !toRemove.has(effect.name.toLowerCase()));
  }

  if (changes?.add) {
    for (const incoming of changes.add) {
      if (!incoming.name || typeof incoming.name !== 'string') continue;
      const validEffectTypes = new Set(['buff', 'debuff', 'neutral']);
      const effectType = validEffectTypes.has(incoming.type) ? incoming.type : 'neutral';
      const existing = effects.findIndex(effect => effect.name.toLowerCase() === incoming.name.toLowerCase());
      const effect: StatusEffect = {
        name: incoming.name,
        description: incoming.description || '',
        type: effectType as StatusEffect['type'],
        duration: incoming.duration,
      };
      if (existing >= 0) effects[existing] = effect;
      else effects.push(effect);
    }
  }

  return effects;
}

export function applyAbilityCooldowns(
  abilities: Character['abilities'],
  actionResult: Pick<ConsequenceInput, 'abilityUsed' | 'isRest'>,
): Character['abilities'] | undefined {
  if (!abilities || abilities.length === 0) return undefined;
  const updated = abilities.map(ability => {
    if (actionResult.isRest) return { ...ability, currentCooldown: 0 };
    if (actionResult.abilityUsed && ability.name === actionResult.abilityUsed && ability.cooldown) return { ...ability, currentCooldown: ability.cooldown };
    if (ability.currentCooldown && ability.currentCooldown > 0) return { ...ability, currentCooldown: ability.currentCooldown - 1 };
    return ability;
  });
  return JSON.stringify(updated) !== JSON.stringify(abilities) ? updated : undefined;
}

export function consumeInventoryItems(inventory: InventoryItem[], consumedItems: string[]): InventoryItem[] {
  const consumed = new Set(consumedItems.map(item => item.toLowerCase()));
  return inventory
    .map(item => consumed.has(item.name.toLowerCase()) ? { ...item, quantity: item.quantity - 1 } : item)
    .filter(item => item.quantity > 0);
}

export function appendCharacterHistory(worldState: WorldState, note: CharacterHistoryEntry | undefined): WorldState {
  if (!note) return worldState;
  const history = [...(worldState.characterHistory || []), {
    ...note,
    createdAt: new Date().toISOString(),
  }];
  return { ...worldState, characterHistory: history.slice(-50) };
}

export function appendFallenHero(worldState: WorldState, character: Character, deathDescription?: string): WorldState {
  const fallen = Array.isArray(worldState.fallenHeroes) ? [...worldState.fallenHeroes] : [];
  fallen.push({
    name: character.name,
    race: character.race,
    class: character.class,
    level: character.level,
    cause: deathDescription || 'Fell in battle.',
    diedAt: new Date().toISOString(),
    location: worldState.currentLocation || 'Unknown',
  });
  return { ...worldState, fallenHeroes: fallen };
}
