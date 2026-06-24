import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import {
  buildBackstoryHooksPrompt,
  buildEpiloguePrompt,
  buildVillainMovePrompt,
  extractBackstoryHooksFromService,
  generateEpilogueFromService,
  generateVillainMoveFromService,
  parseBackstoryHooks,
  parseVillainMove,
} from './campaignSupportService';

function antagonist(name: string, revealed = false) {
  return {
    name,
    trueName: name,
    type: 'primary' as const,
    agenda: `${name} wants the moon-crown.`,
    currentStep: 'corrupting the harbor bells',
    planSteps: ['steal the first bell', 'corrupt the harbor bells', 'wake the drowned court'],
    whatTheyKnow: 'The heroes are meddling.',
    isRevealed: revealed,
    power: 'legendary' as const,
  };
}

function worldBible(overrides: Partial<WorldBible> = {}): WorldBible {
  return {
    era: 'Age of Tides',
    magicSystem: 'Names bend the sea.',
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [{ name: 'Pearl Knives', publicFace: 'Dock guards', secretAgenda: 'Smuggle cursed pearls', power: 'moderate' }],
    primaryAntagonist: antagonist('The Bell Drowned'),
    centralConflict: 'The tide wants its throne back.',
    antagonistRoster: [],
    openingHooks: [],
    ...overrides,
  };
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    user_id: 'user-1',
    campaign_id: 'camp-1',
    name: 'Sun Mi',
    race: 'Elf',
    class: 'Bard',
    level: 8,
    xp: 0,
    hp: 44,
    max_hp: 50,
    stats: { str: 9, dex: 14, con: 12, int: 13, wis: 11, cha: 18 },
    abilities: [],
    inventory: [],
    gold: 10,
    reputation: {},
    is_alive: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('buildBackstoryHooksPrompt ties character history to campaign context', () => {
  const prompt = buildBackstoryHooksPrompt(
    'Sun Mi lost a sister to a bell-shaped ghost.',
    'Sun Mi',
    'Elf',
    'Bard',
    worldBible(),
  );

  assert.match(prompt, /Sun Mi, Elf Bard/);
  assert.match(prompt, /bell-shaped ghost/);
  assert.match(prompt, /The tide wants its throne back/);
  assert.match(prompt, /Pearl Knives/);
});

test('parseBackstoryHooks keeps valid hooks and discards malformed entries', () => {
  const hooks = parseBackstoryHooks(JSON.stringify({
    hooks: [
      { hook: 'The sister is alive inside the drowned bell.' },
      { nope: 'missing hook' },
      'bad',
    ],
  }), 'char-1', 'Sun Mi');

  assert.deepEqual(hooks, [{
    characterId: 'char-1',
    characterName: 'Sun Mi',
    hook: 'The sister is alive inside the drowned bell.',
    status: 'dormant',
  }]);
});

test('generateVillainMoveFromService hides unrevealed villains and parses fallback-safe JSON', async () => {
  let userPrompt = '';
  const openai = {
    chat: {
      completions: {
        create: async (args: {
          model: string;
          messages: { role: 'system' | 'user'; content: string }[];
          temperature: number;
          response_format?: { type: 'json_object' };
        }) => {
          assert.equal(args.model, 'gpt-4o');
          assert.equal(args.temperature, 0.85);
          assert.deepEqual(args.response_format, { type: 'json_object' });
          userPrompt = args.messages.find(message => message.role === 'user')?.content || '';
          return { choices: [{ message: { content: '{"narration":"You hear the bells under the floor.","sessionNote":"Villain corrupted the harbor bells."}' } }] };
        },
      },
    },
  };

  const move = await generateVillainMoveFromService(openai, {
    currentLocation: 'Harbor',
    timeOfDay: 'night',
  }, worldBible(), 2);

  assert.match(userPrompt, /Antagonist: \[Unknown Force\]/);
  assert.equal(move.narration, 'You hear the bells under the floor.');
  assert.equal(move.sessionNote, 'Villain corrupted the harbor bells.');
  assert.deepEqual(parseVillainMove('bad json'), {
    narration: 'Something has changed in the world while you were away.',
    sessionNote: 'Villain advanced their plan.',
  });
});

test('buildVillainMovePrompt names revealed villains and uses plan progress', () => {
  const prompt = buildVillainMovePrompt({
    antagonistProgress: { 'The Bell Drowned': { stepIndex: 1, lastAction: 'stole a bell', knowsPlayers: true } },
  }, worldBible({ primaryAntagonist: antagonist('The Bell Drowned', true) }), 3);

  assert.match(prompt, /Antagonist: The Bell Drowned/);
  assert.match(prompt, /Current plan step: corrupt the harbor bells/);
});

test('buildEpiloguePrompt includes late campaign memory and victory state', () => {
  const prompt = buildEpiloguePrompt({
    campaignJournal: [
      { summary: 'Oldest beat', actNumber: 1, sessionNumber: 1, keyDecisions: [], majorNPCsIntroduced: [], createdAt: '2026-01-01T00:00:00.000Z' },
      { summary: 'Sun Mi broke the final bell.', actNumber: 3, sessionNumber: 9, keyDecisions: [], majorNPCsIntroduced: [], createdAt: '2026-01-02T00:00:00.000Z' },
    ],
    npcMemory: [{ name: 'Mira', disposition: 'friendly', notes: 'Held the door.' }],
    factionStandings: { 'Pearl Knives': -10 },
  } as WorldState, worldBible(), character(), true);

  assert.match(prompt, /OUTCOME: VICTORY/);
  assert.match(prompt, /Sun Mi broke the final bell/);
  assert.match(prompt, /Mira \[friendly\]: Held the door/);
  assert.match(prompt, /Pearl Knives: Hostile \(-10\)/);
});

test('extractBackstoryHooksFromService and generateEpilogueFromService call expected models', async () => {
  const calls: string[] = [];
  const openai = {
    chat: {
      completions: {
        create: async (args: {
          model: string;
          messages: { role: 'system' | 'user'; content: string }[];
          temperature: number;
          max_tokens?: number;
          response_format?: { type: 'json_object' };
        }) => {
          calls.push(args.model);
          if (args.model === 'gpt-4o-mini') {
            assert.equal(args.max_tokens, 400);
            return { choices: [{ message: { content: '{"hooks":[{"hook":"The Pearl Knives know her sister."}]}' } }] };
          }
          assert.equal(args.model, 'gpt-4o');
          assert.equal(args.max_tokens, 800);
          return { choices: [{ message: { content: '  You leave the last bell silent.  ' } }] };
        },
      },
    },
  };

  const hooks = await extractBackstoryHooksFromService(openai, 'A lost sister.', 'Sun Mi', 'Elf', 'Bard', worldBible(), 'char-1');
  const epilogue = await generateEpilogueFromService(openai, {}, worldBible(), character(), true);

  assert.equal(hooks[0].hook, 'The Pearl Knives know her sister.');
  assert.equal(epilogue, 'You leave the last bell silent.');
  assert.deepEqual(calls, ['gpt-4o-mini', 'gpt-4o']);
});
