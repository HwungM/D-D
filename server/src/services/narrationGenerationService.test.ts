import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import {
  generateNarrationFromService,
  generateNarrationStreamingFromService,
} from './narrationGenerationService';

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    user_id: 'user-1',
    campaign_id: 'camp-1',
    name: 'Mira',
    race: 'Human',
    class: 'Rogue',
    level: 4,
    xp: 0,
    hp: 28,
    max_hp: 32,
    stats: { str: 10, dex: 17, con: 12, int: 13, wis: 11, cha: 14 },
    abilities: [{ name: 'Cunning Action', description: 'Move quickly.' }],
    inventory: [{ id: 'knife', name: 'Silver Knife', description: 'Sharp.', quantity: 1, type: 'weapon', value: 15 }],
    gold: 12,
    reputation: {},
    is_alive: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function worldBible(overrides: Partial<WorldBible> = {}): WorldBible {
  return {
    era: 'Age of Tests',
    magicSystem: 'Promises bind magic.',
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [],
    primaryAntagonist: {
      name: 'Glass Warden',
      trueName: 'Glass Warden',
      type: 'primary',
      agenda: 'Seal every door.',
      currentStep: 'locking the old city',
      planSteps: ['mark the doors'],
      whatTheyKnow: 'The rogue is close.',
      isRevealed: true,
      power: 'major',
    },
    centralConflict: 'The city is closing itself.',
    antagonistRoster: [],
    openingHooks: [],
    ...overrides,
  };
}

const worldState: WorldState = {
  currentLocation: 'Old City Gate',
  timeOfDay: 'night',
  sceneState: { purpose: 'explore', exchangeCount: 1, stalledCount: 0, pacingMode: 'tension' },
};

function narrationPayload(narration = 'Mira finds a brass key beneath the cracked threshold.') {
  return {
    narration,
    turnOutcome: {
      playerIntent: 'Search the gate',
      concreteResult: 'Mira found a brass key beneath the cracked threshold.',
      informationRevealed: ['The key is stamped with the Glass Warden mark.'],
      situationChanged: true,
      unresolvedQuestion: null,
      whyNoRoll: 'The key was visible after a careful look.',
      whyRollNeeded: null,
    },
    suggestedActions: ['Try the brass key on the gate', 'Inspect the Glass Warden mark'],
    sceneImagePrompt: 'A rogue at a moonlit old city gate',
    isCombat: false,
    isVictory: false,
    diceRequired: false,
  };
}

test('generateNarrationFromService calls gpt-4o through the injected client and logs the parsed result', async () => {
  const logs: Record<string, unknown>[] = [];
  let callCount = 0;
  const openai = {
    chat: {
      completions: {
        create: async (args: {
          model: string;
          messages: { role: string; content: string }[];
          temperature: number;
          response_format: { type: 'json_object' };
        }) => {
          callCount += 1;
          assert.equal(args.model, 'gpt-4o');
          assert.equal(args.temperature, 0.7);
          assert.deepEqual(args.response_format, { type: 'json_object' });
          assert.ok(args.messages.some(message => message.content.includes('Old City Gate')));
          return { choices: [{ message: { content: JSON.stringify(narrationPayload()) } }] };
        },
      },
    },
  };

  const result = await generateNarrationFromService(
    openai,
    (_fn, data) => logs.push(data),
    'search the gate',
    worldState,
    worldBible(),
    character(),
    ['Mira reached the locked gate.'],
  );

  assert.equal(callCount, 1);
  assert.equal(result.narration, 'Mira finds a brass key beneath the cracked threshold.');
  assert.deepEqual(result.suggestedActions, ['Try the brass key on the gate', 'Inspect the Glass Warden mark']);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].character, 'char-1');
});

test('generateNarrationStreamingFromService streams narration tokens and returns parsed final JSON', async () => {
  async function* chunks() {
    yield { choices: [{ delta: { content: '{"narration":"Mira lifts' } }] };
    yield { choices: [{ delta: { content: ' the lantern.","suggestedActions":["Open the gate"],"turnOutcome":{"playerIntent":"lift lantern","concreteResult":"The lantern revealed the gate lock.","informationRevealed":["The lock bears a fresh scratch."],"situationChanged":true,"unresolvedQuestion":null,"whyNoRoll":"No opposition.","whyRollNeeded":null}}' } }] };
  }

  const openai = {
    chat: {
      completions: {
        create: async (args: { stream?: boolean; temperature: number }) => {
          assert.equal(args.stream, true);
          assert.equal(args.temperature, 0.85);
          return chunks();
        },
      },
    },
  };

  const events = [];
  for await (const event of generateNarrationStreamingFromService(
    openai,
    'lift the lantern',
    worldState,
    worldBible(),
    character(),
    [],
  )) {
    events.push(event);
  }

  assert.equal(events[0].type, 'token');
  assert.equal(events.at(-1)?.type, 'done');
  const done = events.at(-1);
  assert.equal(done?.type === 'done' ? done.result.narration : '', 'Mira lifts the lantern.');
});
