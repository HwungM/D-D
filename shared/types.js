"use strict";
// Shared types between client and server
Object.defineProperty(exports, "__esModule", { value: true });
exports.XP_THRESHOLDS = exports.CLASS_BASE_HP = exports.RACE_STAT_BONUSES = void 0;
exports.RACE_STAT_BONUSES = {
    Human: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    Elf: { dex: 2, int: 1 },
    Dwarf: { con: 2, wis: 1 },
    Halfling: { dex: 2, cha: 1 },
    Gnome: { int: 2, dex: 1 },
    'Half-Orc': { str: 2, con: 1 },
    Tiefling: { cha: 2, int: 1 },
    Dragonborn: { str: 2, cha: 1 },
};
exports.CLASS_BASE_HP = {
    Fighter: 10,
    Wizard: 6,
    Rogue: 8,
    Cleric: 8,
    Ranger: 10,
    Paladin: 10,
    Barbarian: 12,
    Bard: 8,
    Druid: 8,
    Monk: 8,
    Sorcerer: 6,
    Warlock: 8,
};
exports.XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
//# sourceMappingURL=types.js.map