import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import {
  buildCampaignContextBlock,
  buildNarrationMessages,
  buildNpcQuestMapBlock,
  buildStatHints,
  characterGenderLine,
  DM_SYSTEM_PROMPT,
  type NarrationCampaignContext,
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
  assert.match(joined, /PLAYER AUTHORSHIP/);
});

test('NPC prompt context carries binding gender and pronouns', () => {
  const block = buildNpcQuestMapBlock({
    currentLocation: 'Whimsical Knick-Knack Shop',
    npcMemory: [{
      name: 'Ryliss',
      disposition: 'friendly',
      notes: 'Nervous gnome shopkeeper who knows the toy kingdom.',
      role: 'merchant',
      gender: 'male',
    }],
  });

  assert.match(block, /Ryliss/);
  assert.match(block, /male, he\/him/);
});

test('DM system prompt treats roadmap beats as adaptive pressure, not a forced script', () => {
  assert.match(DM_SYSTEM_PROMPT, /not a predetermined scene/);
  assert.match(DM_SYSTEM_PROMPT, /Do not teleport the party/);
  assert.doesNotMatch(DM_SYSTEM_PROMPT, /DM ROADMAP shows exactly what the act climax is/);
});

test('buildCampaignContextBlock surfaces seeded signature item quests and existing party assets for the DM', () => {
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

  const campaignContext: NarrationCampaignContext = {
    journal: [],
    characterHistory: [],
    antagonists: [],
    centralConflict: 'Promises bind the river.',
    act: 1,
    sessionCount: 1,
    signatureItemQuests: [{
      id: 'quest-1',
      characterId: 'char-1',
      characterName: 'Vex',
      itemName: "Whisperwind, the Hunter's Longbow",
      itemFlavor: "Her sister's bow.",
      questHook: 'Recover it from the ruins of House Thal.',
      status: 'seeded',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    partyAssets: [{
      id: 'asset-1',
      kind: 'property',
      name: 'Greyhawk Keep',
      description: 'A fortress won from the dragon lord.',
      grantedAt: '2026-01-01T00:00:00.000Z',
      grantedBy: 'defeating the dragon lord',
    }],
  };

  const block = buildCampaignContextBlock(campaignContext, worldBible, 3);

  assert.match(block, /SIGNATURE ITEM QUESTS/);
  assert.match(block, /Whisperwind, the Hunter's Longbow/);
  assert.match(block, /quest-1/);
  assert.match(block, /PARTY ASSETS/);
  assert.match(block, /Greyhawk Keep/);
  assert.match(block, /A fortress won from the dragon lord/);
});

test('race and class awareness changes world reactions without assigning hero personality', () => {
  assert.match(DM_SYSTEM_PROMPT, /NEVER automatic personality traits/);
  assert.match(DM_SYSTEM_PROMPT, /Do not automatically make the character hedonistic/);
  assert.match(DM_SYSTEM_PROMPT, /The player decides how the warlock interprets or answers that pressure/);
  assert.match(DM_SYSTEM_PROMPT, /Do not assume urban discomfort/);
});
