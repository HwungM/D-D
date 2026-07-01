import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldBible } from '../../../shared/types';
import { normalizeGeneratedWorldBible, parseStorySeeds } from './campaignGenerationService';
import { EVERREALM_ART_BIBLE } from './everrealmArtPrompt';

function antagonist(name: string, type: 'primary' | 'secondary' = 'primary') {
  return {
    name,
    trueName: name,
    type,
    agenda: `${name} agenda`,
    currentStep: `${name} step`,
    planSteps: ['begin', 'finish'],
    whatTheyKnow: 'Nothing yet',
    isRevealed: false,
    power: type === 'primary' ? 'legendary' as const : 'major' as const,
  };
}

function minimalWorldBible(overrides: Partial<WorldBible> = {}): WorldBible {
  return {
    era: 'Age of Tests',
    magicSystem: 'Magic has a cost.',
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [],
    primaryAntagonist: antagonist('The First Shadow'),
    lieutenant: antagonist('Glass Warden', 'secondary'),
    centralConflict: 'Choice against inevitability.',
    antagonistRoster: [],
    openingHooks: [],
    ...overrides,
  };
}

test('parseStorySeeds accepts both wrapped and raw seed arrays', () => {
  assert.deepEqual(parseStorySeeds('{"seeds":[{"id":"seed-1","title":"Ash Orchard","premise":"Trees remember.","tone":"Eerie wonder","startingLocation":"Greenward"}]}'), [
    { id: 'seed-1', title: 'Ash Orchard', premise: 'Trees remember.', tone: 'Eerie wonder', startingLocation: 'Greenward' },
  ]);

  assert.deepEqual(parseStorySeeds('[{"id":"seed-2","title":"Clockwork Moon","premise":"The moon ticks.","tone":"Mythic intrigue","startingLocation":"Bellport"}]'), [
    { id: 'seed-2', title: 'Clockwork Moon', premise: 'The moon ticks.', tone: 'Mythic intrigue', startingLocation: 'Bellport' },
  ]);
});

test('parseStorySeeds falls back to an empty list for malformed output', () => {
  assert.deepEqual(parseStorySeeds('not json'), []);
});

test('normalizeGeneratedWorldBible ensures roster, defaults, art bible, and preferences', () => {
  const normalized = normalizeGeneratedWorldBible(minimalWorldBible(), {
    tone: 'Warm mystery',
    favoritePillars: ['Roleplay', 'Exploration'],
    playerCount: 2,
    characterConcepts: ['A bard who fears silence'],
  });

  assert.deepEqual(normalized.antagonistRoster.map(a => a.name), ['The First Shadow', 'Glass Warden']);
  assert.equal(normalized.geography[0].name, 'The Starting Town');
  assert.equal(normalized.openingHooks.length, 3);
  assert.equal(normalized.artBible?.masterPrompt, EVERREALM_ART_BIBLE.masterPrompt);
  assert.equal(normalized.playerPreferences?.tone, 'Warm mystery');
  assert.equal(normalized.playerPreferences?.playerCount, 2);
  assert.deepEqual(normalized.playerPreferences?.characterConcepts, ['A bard who fears silence']);
});

test('normalizeGeneratedWorldBible preserves existing roster entries while adding missing antagonists', () => {
  const existing = antagonist('Existing Rival', 'secondary');
  const normalized = normalizeGeneratedWorldBible(minimalWorldBible({
    antagonistRoster: [existing],
    geography: [{ name: 'Real City', description: 'Already generated.', type: 'city' }],
    openingHooks: ['Generated omen'],
    toneRules: ['Generated tone'],
  }));

  assert.deepEqual(normalized.antagonistRoster.map(a => a.name), ['The First Shadow', 'Existing Rival', 'Glass Warden']);
  assert.equal(normalized.geography[0].name, 'Real City');
  assert.equal(normalized.openingHooks[0], 'Generated omen');
  assert.equal(normalized.openingHooks.length, 3);
  assert.deepEqual(normalized.toneRules, ['Generated tone']);
});
