import type { Character, InventoryItem, RollContext, WorldState } from '../../../shared/types';

export type DegreeOfSuccess =
  | 'critical_failure'
  | 'clear_failure'
  | 'near_miss'
  | 'partial_success'
  | 'clean_success'
  | 'critical_success';

export function degreeOfSuccess(roll: number, total: number, dc: number): DegreeOfSuccess {
  if (roll === 1) return 'critical_failure';
  if (roll === 20) return 'critical_success';
  const margin = total - dc;
  if (margin <= -4) return 'clear_failure';
  if (margin < 0) return 'near_miss';
  if (margin <= 3) return 'partial_success';
  return 'clean_success';
}

export function calculateActionXp(
  level: number,
  degree: DegreeOfSuccess,
  options: { combat?: boolean; dramatic?: boolean; coop?: boolean } = {},
): number {
  const baseByDegree: Record<DegreeOfSuccess, number> = {
    critical_failure: 4,
    clear_failure: 5,
    near_miss: 7,
    partial_success: 10,
    clean_success: 14,
    critical_success: 20,
  };
  const levelScale = Math.max(1, Math.min(20, Math.floor(level)));
  const encounterBonus = (options.combat ? 3 : 0) + (options.dramatic ? 4 : 0) + (options.coop ? 2 : 0);
  return baseByDegree[degree] + Math.floor(levelScale / 2) + encounterBonus;
}

export function calculateNarrativeXp(level: number, options: { combat?: boolean; coop?: boolean } = {}): number {
  return calculateActionXp(level, 'clean_success', options);
}

export type MechanicalConsequences = {
  hpChange?: number;
  goldChange?: number;
  loot?: Array<{
    id: string;
    name: string;
    description: string;
    quantity: number;
    type: string;
    value?: number;
    setName?: string;
    setBonus?: string;
  }>;
};

export function normalizeMechanicalConsequences(
  character: Pick<Character, 'level' | 'max_hp'>,
  consequences: MechanicalConsequences,
  options: { isDeath?: boolean } = {},
): MechanicalConsequences {
  const normalized: MechanicalConsequences = {};

  if (typeof consequences.hpChange === 'number' && Number.isFinite(consequences.hpChange)) {
    if (options.isDeath) {
      normalized.hpChange = -character.max_hp;
    } else if (consequences.hpChange < 0) {
      const maxDamage = Math.max(6, 5 + character.level * 4);
      normalized.hpChange = Math.max(-maxDamage, Math.round(consequences.hpChange));
    } else {
      const maxHealing = Math.max(4, Math.ceil(character.max_hp * 0.5));
      normalized.hpChange = Math.min(maxHealing, Math.round(consequences.hpChange));
    }
  }

  if (typeof consequences.goldChange === 'number' && Number.isFinite(consequences.goldChange)) {
    const maxGoldSwing = Math.max(50, character.level * 100);
    normalized.goldChange = Math.max(-maxGoldSwing, Math.min(maxGoldSwing, Math.round(consequences.goldChange)));
  }

  if (Array.isArray(consequences.loot)) {
    normalized.loot = consequences.loot
      .filter(item => typeof item?.name === 'string' && item.name.trim().length > 0)
      .slice(0, 3)
      .map(item => ({
        ...item,
        name: item.name.trim().slice(0, 80),
        description: (item.description || '').trim().slice(0, 500),
        quantity: Math.max(1, Math.min(5, Math.round(item.quantity || 1))),
        value: typeof item.value === 'number' && Number.isFinite(item.value)
          ? Math.max(0, Math.min(character.level * 500, Math.round(item.value)))
          : undefined,
      }));
  }

  return normalized;
}

export function stackInventory(existing: InventoryItem[], incoming: InventoryItem[]): InventoryItem[] {
  const merged = existing.map(item => ({ ...item }));
  for (const item of incoming) {
    const match = merged.find(candidate => candidate.name.toLowerCase() === item.name.toLowerCase());
    if (match) match.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

const DAMAGE_DIE_BY_CLASS: Record<string, number> = {
  Barbarian: 12,
  Fighter: 10,
  Paladin: 10,
  Ranger: 8,
  Rogue: 8,
  Monk: 8,
  Cleric: 8,
  Druid: 8,
  Bard: 8,
  Wizard: 6,
  Sorcerer: 6,
  Warlock: 8,
};

export type CombatRollResolution = {
  combatState?: WorldState['combatState'];
  damage: number;
  target?: string;
  defeated: boolean;
  victory: boolean;
};

export function resolvePlayerCombatRoll(
  character: Pick<Character, 'class' | 'stats'>,
  combatState: WorldState['combatState'],
  rollContext: RollContext,
  roll: number,
  total: number,
  dc: number,
  random: () => number = Math.random,
): CombatRollResolution | null {
  if (!combatState?.inCombat) return null;
  if (!/\b(attack|strike|shoot|slash|stab|smite|hit|swing|fire|cast|blast)\b/i.test(rollContext.description)) return null;

  const degree = degreeOfSuccess(roll, total, dc);
  if (degree === 'critical_failure' || degree === 'clear_failure' || degree === 'near_miss') {
    return { combatState, damage: 0, defeated: false, victory: false };
  }

  const enemies = (combatState.enemies || []).map(enemy => ({
    ...enemy,
    currentHp: enemy.currentHp ?? enemy.maxHp,
  }));
  const targetIndex = enemies.findIndex(enemy => !enemy.isDefeated);
  if (targetIndex < 0) return { combatState: null, damage: 0, defeated: false, victory: true };

  const target = enemies[targetIndex];
  const sides = DAMAGE_DIE_BY_CLASS[character.class] || 8;
  const abilityModifier = Math.max(
    Math.floor((character.stats.str - 10) / 2),
    Math.floor((character.stats.dex - 10) / 2),
  );
  const diceCount = degree === 'critical_success' ? 2 : 1;
  let damage = Math.max(1, abilityModifier);
  for (let index = 0; index < diceCount; index += 1) {
    damage += Math.floor(random() * sides) + 1;
  }
  if (degree === 'clean_success') damage += 2;

  const currentHp = Math.max(0, (target.currentHp ?? target.maxHp) - damage);
  const ratio = target.maxHp > 0 ? currentHp / target.maxHp : 0;
  const condition = ratio <= 0.25 ? 'critical' : ratio <= 0.6 ? 'wounded' : 'healthy';
  const defeated = currentHp === 0;
  enemies[targetIndex] = { ...target, currentHp, condition, isDefeated: defeated };

  const living = enemies.filter(enemy => !enemy.isDefeated);
  const victory = living.length === 0;
  return {
    combatState: victory ? null : {
      ...combatState,
      enemyName: living[0]?.name || target.name,
      enemyCondition: living[0]?.condition || 'critical',
      enemies,
    },
    damage,
    target: target.name,
    defeated,
    victory,
  };
}
