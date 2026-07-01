import { randomUUID } from 'crypto';
import type { CharacterClass, CharacterStats, CompanionCharacter, PartyComposition, Race, WorldBible } from '../../../shared/types';
import { CLASS_BASE_HP, RACE_STAT_BONUSES } from '../../../shared/types';
import { rollDice } from './characterProgressionSystem';
import { getAbilityForLevel } from '../../../shared/classAbilities';

const RACES: Race[] = [
  'Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn',
  'Aasimar', 'Fire Genasi', 'Water Genasi', 'Earth Genasi', 'Air Genasi',
  'Warforged', 'Tabaxi', 'Goliath', 'Firbolg', 'Changeling', 'Kenku', 'Dhampir', 'Owlin',
  'Lizardfolk', 'Satyr', 'Harengon', 'Yuan-Ti', 'Triton', 'Leonin',
  'Minotaur', 'Bugbear', 'Hobgoblin', 'Goblin', 'Tortle',
];

const CLASSES: CharacterClass[] = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Ranger', 'Paladin', 'Barbarian', 'Bard', 'Druid', 'Monk', 'Sorcerer', 'Warlock'];

// A broad, tone-agnostic name pool. Names are picked deterministically-ish per
// slot (seeded by index) so repeated generation for the same world doesn't
// collide, while still feeling varied across companions.
const NAME_POOL = [
  'Aldric', 'Bryn', 'Caelum', 'Dessa', 'Eyren', 'Fennah', 'Garrow', 'Hesper',
  'Ithel', 'Jorunn', 'Kessa', 'Lorin', 'Maren', 'Norwyn', 'Orin', 'Pryssa',
  'Quill', 'Ravenna', 'Soren', 'Tavi', 'Ulric', 'Vessa', 'Wren', 'Xanthe',
  'Yorick', 'Zeph',
];

function rollStat(random: () => number): number {
  const rolls = [1, 2, 3, 4].map(() => rollDice(6, 0, 1, random).total);
  rolls.sort((a, b) => a - b);
  return rolls.slice(1).reduce((a, b) => a + b, 0);
}

function rollStats(random: () => number): CharacterStats {
  return {
    str: rollStat(random),
    dex: rollStat(random),
    con: rollStat(random),
    int: rollStat(random),
    wis: rollStat(random),
    cha: rollStat(random),
  };
}

function pick<T>(pool: T[], index: number): T {
  return pool[index % pool.length];
}

/**
 * Generates the campaign's starting AI companions, sized to the number of
 * ai_companion slots in the given PartyComposition. Generated once at world
 * creation (not re-rolled per turn) — the DM authors their micro-choices and
 * reactions turn to turn, but their sheet, name, and stats are fixed here.
 */
export function generateStartingCompanions(
  worldBible: Pick<WorldBible, 'era' | 'centralConflict' | 'toneRules'>,
  composition: PartyComposition | undefined,
  random: () => number = Math.random,
): CompanionCharacter[] {
  const companionSlots = composition?.slots?.filter(slot => slot.kind === 'ai_companion') || [];
  if (companionSlots.length === 0) return [];

  const now = new Date().toISOString();

  return companionSlots.map((_slot, index) => {
    const race = pick(RACES, Math.floor(random() * RACES.length) || index);
    const characterClass = pick(CLASSES, Math.floor(random() * CLASSES.length) || index);
    const name = pick(NAME_POOL, index + Math.floor(random() * NAME_POOL.length));

    const baseStats = rollStats(random);
    const racialBonuses = RACE_STAT_BONUSES[race] || {};
    const stats: CharacterStats = {
      str: baseStats.str + (racialBonuses.str || 0),
      dex: baseStats.dex + (racialBonuses.dex || 0),
      con: baseStats.con + (racialBonuses.con || 0),
      int: baseStats.int + (racialBonuses.int || 0),
      wis: baseStats.wis + (racialBonuses.wis || 0),
      cha: baseStats.cha + (racialBonuses.cha || 0),
    };

    const baseHp = CLASS_BASE_HP[characterClass] || 8;
    const conMod = Math.floor((stats.con - 10) / 2);
    const maxHp = Math.max(1, baseHp + conMod);

    const level1Ability = getAbilityForLevel(characterClass, 1);

    const companion: CompanionCharacter = {
      id: randomUUID(),
      name,
      race,
      class: characterClass,
      level: 1,
      xp: 0,
      hp: maxHp,
      max_hp: maxHp,
      stats,
      abilities: level1Ability ? [level1Ability] : [],
      inventory: [],
      bondLevel: 20,
      is_alive: true,
      recruitedAt: now,
    };
    return companion;
  });
}
