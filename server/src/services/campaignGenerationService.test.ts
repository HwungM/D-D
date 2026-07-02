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

// ── Phase 14: the planted hidden-identity twist (WorldBible.plannedBetrayal) ──

test('normalizeGeneratedWorldBible preserves a well-formed AI-generated plannedBetrayal', () => {
  const normalized = normalizeGeneratedWorldBible(minimalWorldBible({
    plannedBetrayal: {
      npcRole: 'a battle-scarred general who fights beside the party',
      trueIdentity: 'secretly The First Shadow in disguise',
      setupHint: 'Introduce her early as a genuine ally who bleeds for the party.',
    },
  }));

  assert.deepEqual(normalized.plannedBetrayal, {
    npcRole: 'a battle-scarred general who fights beside the party',
    trueIdentity: 'secretly The First Shadow in disguise',
    setupHint: 'Introduce her early as a genuine ally who bleeds for the party.',
  });
});

test('normalizeGeneratedWorldBible falls back to a plannedBetrayal tied to the lieutenant/primary antagonist when the AI omits it', () => {
  const withLieutenant = normalizeGeneratedWorldBible(minimalWorldBible({ plannedBetrayal: undefined }));
  assert.ok(withLieutenant.plannedBetrayal);
  assert.match(withLieutenant.plannedBetrayal!.trueIdentity, /Glass Warden/);
  assert.ok(withLieutenant.plannedBetrayal!.npcRole.length > 0);
  assert.ok(withLieutenant.plannedBetrayal!.setupHint.length > 0);

  const withoutLieutenant = normalizeGeneratedWorldBible(minimalWorldBible({ plannedBetrayal: undefined, lieutenant: undefined }));
  assert.match(withoutLieutenant.plannedBetrayal!.trueIdentity, /The First Shadow/);
});

test('normalizeGeneratedWorldBible replaces a partially-filled AI plannedBetrayal with the coupled fallback', () => {
  const normalized = normalizeGeneratedWorldBible(minimalWorldBible({
    plannedBetrayal: { npcRole: 'a general', trueIdentity: '', setupHint: '' },
  }));
  assert.match(normalized.plannedBetrayal!.trueIdentity, /Glass Warden/);
});

// ── Phase 17: ambientEventSeeds (BitLife-style ambient world events) ──

test('normalizeGeneratedWorldBible preserves AI-authored ambientEventSeeds', () => {
  const normalized = normalizeGeneratedWorldBible(minimalWorldBible({
    ambientEventSeeds: [
      'A caravan of refugees passes through, exhausted and wary.',
      'The northern sky flickers with unnatural light for a moment.',
      'A merchant\'s cart loses a wheel nearby.',
    ],
  }));

  assert.deepEqual(normalized.ambientEventSeeds, [
    'A caravan of refugees passes through, exhausted and wary.',
    'The northern sky flickers with unnatural light for a moment.',
    'A merchant\'s cart loses a wheel nearby.',
  ]);
});

test('normalizeGeneratedWorldBible falls back to a default ambientEventSeeds pool when the AI omits it', () => {
  const normalized = normalizeGeneratedWorldBible(minimalWorldBible({ ambientEventSeeds: undefined }));
  assert.ok(normalized.ambientEventSeeds && normalized.ambientEventSeeds.length >= 5);
});

test('normalizeGeneratedWorldBible strips blank/empty ambientEventSeeds entries', () => {
  const normalized = normalizeGeneratedWorldBible(minimalWorldBible({
    ambientEventSeeds: ['A real seed.', '', '   '],
  }));
  assert.deepEqual(normalized.ambientEventSeeds, ['A real seed.']);
});
