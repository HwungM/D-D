import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import {
  buildNarrationMessages,
  buildStatHints,
  characterGenderLine,
  DM_SYSTEM_PROMPT,
} from './narrationPromptBuilder';

test('buildStatHints turns extreme stats into usable suggestion guidance', () => {
  assert.match(buildStatHints({ str: 16, dex: 10, con: 12, int: 7, wis: 15, cha: 8 }), /STR 16/);
  assert.match(buildStatHints({ str: 16, dex: 10, con: 12, int: 7, wis: 15, cha: 8 }), /avoid complex lore/);
  assert.match(buildStatHints({ str: 16, dex: 10, con: 12, int: 7, wis: 15, cha: 8 }), /avoid diplomacy/);
});

test('characterGenderLine emits stable pronoun guidance when gender exists', () => {
  assert.match(characterGenderLine({ name: 'SunMasa', gender: 'female' } as Character), /she\/her/);
  assert.equal(characterGenderLine({ name: 'Tortasa' } as Character), '');
});

test('buildNarrationMessages includes system prompt, character facts, and hard contracts', () => {
  const character = {
    id: 'c1',
    name: 'Tortasa',
    race: 'Tortle',
    class: 'Fighter',
    level: 3,
    hp: 20,
    max_hp: 24,
    gold: 12,
    stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 9 },
    abilities: [{ name: 'Shell Bash', description: 'Hit hard.', mechanic: 'Deal 1d6 damage.' }],
    inventory: [],
    status_effects: [],
    backstory: 'A loyal wanderer.',
  } as unknown as Character;

  const worldState = {
    currentLocation: 'Moon Dock',
    timeOfDay: 'night',
    weather: 'fog',
    actionCount: 4,
    activeQuests: [{ title: 'Find the Bell', description: 'Recover the river bell.', status: 'active' }],
  } as WorldState;

  const worldBible = {
    era: 'Age of Bells',
    magicSystem: 'Names echo in water.',
    centralConflict: 'Promises bind the river.',
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [],
    primaryAntagonist: {} as WorldBible['primaryAntagonist'],
    antagonistRoster: [],
    openingHooks: [],
  } as WorldBible;

  const messages = buildNarrationMessages('inspect the bell', worldState, worldBible, character, ['The fog rolled in.']);
  const joined = messages.map(m => m.content).join('\n');

  assert.equal(messages[0].role, 'system');
  assert.equal(messages[0].content, DM_SYSTEM_PROMPT);
  assert.match(joined, /Tortasa/);
  assert.match(joined, /Moon Dock/);
  assert.match(joined, /Find the Bell/);
  assert.match(joined, /ABSOLUTE TURN RESOLUTION CONTRACT/);
});
