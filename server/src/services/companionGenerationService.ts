import { randomUUID } from 'crypto';
import type { CharacterClass, CharacterStats, CompanionCharacter, PartyComposition, Race, WorldBible } from '../../../shared/types';
import { CLASS_BASE_HP, RACE_STAT_BONUSES, XP_THRESHOLDS } from '../../../shared/types';
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
 * Core companion sheet builder shared by starting-party generation and
 * mid-campaign recruitment. Rolls race/class/stats/HP the same way for both,
 * and scales HP/XP/ability grants up to an arbitrary starting level so a
 * companion recruited later in the campaign isn't a helpless level 1 next to
 * a leveled-up party.
 */
export function buildCompanion(params: {
  index?: number;
  level?: number;
  nameHint?: string;
  raceHint?: Race;
  classHint?: CharacterClass;
  bondLevel?: number;
  random?: () => number;
}): CompanionCharacter {
  const random = params.random || Math.random;
  const index = params.index ?? Math.floor(random() * 1000);
  const level = Math.max(1, Math.min(20, Math.round(params.level ?? 1)));

  const race = params.raceHint || pick(RACES, Math.floor(random() * RACES.length) || index);
  const characterClass = params.classHint || pick(CLASSES, Math.floor(random() * CLASSES.length) || index);
  const name = params.nameHint || pick(NAME_POOL, index + Math.floor(random() * NAME_POOL.length));

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
  let maxHp = Math.max(1, baseHp + conMod);
  // Scale HP up for each level beyond 1, using the same per-level gain formula
  // as a human character's level-up (see characterProgressionSystem.checkLevelUp),
  // so a companion recruited at, say, party level 6 isn't paper-thin.
  for (let lvl = 2; lvl <= level; lvl += 1) {
    maxHp += Math.max(1, Math.floor(baseHp / 2) + 1 + conMod);
  }

  const xp = XP_THRESHOLDS[level - 1] ?? 0;
  const ability = getAbilityForLevel(characterClass, level) || getAbilityForLevel(characterClass, 1);

  return {
    id: randomUUID(),
    name,
    race,
    class: characterClass,
    level,
    xp,
    hp: maxHp,
    max_hp: maxHp,
    stats,
    abilities: ability ? [ability] : [],
    inventory: [],
    bondLevel: params.bondLevel ?? 20,
    is_alive: true,
    recruitedAt: new Date().toISOString(),
  };
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

  return companionSlots.map((_slot, index) => buildCompanion({ index, level: 1, random }));
}

/**
 * Builds a brand-new companion who joins the party organically mid-campaign
 * (narration signals recruitment). Scaled to roughly the party's current
 * level so they can meaningfully participate right away, using an optional
 * name/race/class hint the narration already established.
 */
export function recruitCompanionCharacter(
  hint: { name?: string; race?: string; class?: string },
  partyLevel: number,
  existingCompanions: CompanionCharacter[] = [],
  random: () => number = Math.random,
): CompanionCharacter {
  const raceHint = RACES.find(r => r.toLowerCase() === (hint.race || '').toLowerCase());
  const classHint = CLASSES.find(c => c.toLowerCase() === (hint.class || '').toLowerCase());
  return buildCompanion({
    index: existingCompanions.length,
    level: Math.max(1, Math.round(partyLevel) || 1),
    nameHint: hint.name,
    raceHint,
    classHint,
    bondLevel: 10,
    random,
  });
}
