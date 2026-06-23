import type { Character, DiceRollResult } from '../../../shared/types';
import { CLASS_BASE_HP, XP_THRESHOLDS } from '../../../shared/types';

export function rollDice(
  sides: number,
  modifier: number = 0,
  count: number = 1,
  random: () => number = Math.random,
): DiceRollResult {
  const rolls: number[] = [];
  for (let index = 0; index < count; index += 1) {
    rolls.push(Math.floor(random() * sides) + 1);
  }
  const rawTotal = rolls.reduce((total, roll) => total + roll, 0);
  return {
    sides,
    rolls,
    modifier,
    total: Math.max(1, rawTotal + modifier),
  };
}

export function getStatModifier(statValue: number): number {
  return Math.floor((statValue - 10) / 2);
}

export function checkLevelUp(
  character: Pick<Character, 'level' | 'class' | 'stats' | 'xp'>,
): { leveledUp: boolean; newLevel?: number; hpGain?: number } {
  const currentLevelThreshold = XP_THRESHOLDS[character.level] ?? Infinity;
  if (character.xp >= currentLevelThreshold && character.level < 20) {
    const newLevel = character.level + 1;
    const baseHp = CLASS_BASE_HP[character.class as keyof typeof CLASS_BASE_HP] ?? 8;
    const hpGain = Math.floor(baseHp / 2) + 1 + getStatModifier(character.stats.con);
    return { leveledUp: true, newLevel, hpGain: Math.max(1, hpGain) };
  }
  return { leveledUp: false };
}
