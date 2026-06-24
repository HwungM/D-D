import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldState } from '../../../shared/types';
import {
  buildRollOutcomePrompt,
  generateRollOutcomeFromService,
  getDegreeOfSuccess,
  getRollFlavorHint,
  parseRollOutcomeResponse,
  type RollOutcomeContext,
} from './rollNarrationService';

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    user_id: 'user-1',
    campaign_id: 'camp-1',
    name: 'Mira',
    race: 'Human',
    class: 'Rogue',
    level: 3,
    xp: 0,
    hp: 22,
    max_hp: 30,
    stats: { str: 10, dex: 16, con: 12, int: 11, wis: 13, cha: 14 },
    abilities: [{ name: 'Cunning Action', description: 'Move with impossible speed.' }],
    inventory: [{ id: 'knife', name: 'Silver Knife', description: 'Sharp.', quantity: 1, type: 'weapon', value: 15 }],
    gold: 7,
    reputation: {},
    is_alive: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function rollContext(overrides: Partial<RollOutcomeContext> = {}): RollOutcomeContext {
  return {
    stat: 'dex',
    description: 'Mira vaults over the altar before the bandit can grab the relic',
    successDescription: 'Mira clears the altar and keeps the relic out of reach.',
    failDescription: 'The bandit catches Mira by the cloak and the relic skitters away.',
    critSuccessDescription: 'Mira turns the vault into a stunning reversal.',
    critFailDescription: 'Mira lands badly and hands the bandit an opening.',
    ...overrides,
  };
}

const worldState: WorldState = {
  currentLocation: 'Candlecrypt Chapel',
  currentSceneSummary: 'A bandit lunges across a ruined chapel as Mira reaches for a relic.',
};

test('getDegreeOfSuccess distinguishes criticals, near misses, partials, and clean outcomes', () => {
  assert.equal(getDegreeOfSuccess(6, 15, false, true).degree, 'crit_fail');
  assert.equal(getDegreeOfSuccess(24, 15, true, false).degree, 'crit_success');
  assert.equal(getDegreeOfSuccess(11, 15, false, false).degree, 'clear_fail');
  assert.equal(getDegreeOfSuccess(13, 15, false, false).degree, 'near_miss');
  assert.equal(getDegreeOfSuccess(16, 15, false, false).degree, 'partial_success');
  assert.equal(getDegreeOfSuccess(20, 15, false, false).degree, 'clean_success');
});

test('getRollFlavorHint prefers critical-specific flavor when available', () => {
  const context = rollContext();

  assert.equal(getRollFlavorHint(context, true, true, false), context.critSuccessDescription);
  assert.equal(getRollFlavorHint(context, false, false, true), context.critFailDescription);
  assert.equal(getRollFlavorHint(context, true, false, false), context.successDescription);
  assert.equal(getRollFlavorHint(context, false, false, false), context.failDescription);
});

test('buildRollOutcomePrompt includes degree guidance and combat consequence contract', () => {
  const { prompt, degree } = buildRollOutcomePrompt({
    rollResult: 9,
    rollTotal: 13,
    dc: 15,
    success: false,
    isCritSuccess: false,
    isCritFail: false,
    rollContext: rollContext(),
    worldState: {
      ...worldState,
      combatState: {
        inCombat: true,
        enemyName: 'Bandit Cutter',
        enemyCondition: 'wounded',
        roundNumber: 2,
        playerActionsAttempted: [],
        enemies: [
          { name: 'Bandit Cutter', archetype: 'soldier', maxHp: 18, condition: 'wounded' },
          { name: 'Bandit Archer', archetype: 'soldier', maxHp: 12, condition: 'healthy' },
        ],
      },
    },
    character: character(),
    recentHistory: ['Mira spotted the relic.', 'The bandits closed in.'],
  });

  assert.equal(degree, 'near_miss');
  assert.match(prompt, /NEAR MISS/);
  assert.match(prompt, /ACTIVE COMBAT - Round 2/);
  assert.match(prompt, /Never narrate a wound without setting hpChange/);
  assert.match(prompt, /Bandit Cutter \(wounded\), Bandit Archer \(healthy\)/);
});

test('parseRollOutcomeResponse normalizes unsafe or missing AI fields', () => {
  const parsed = parseRollOutcomeResponse(JSON.stringify({
    narration: 'Mira lands hard but keeps moving.',
    hpChange: -3.6,
    goldChange: 100000,
    suggestedActions: ['Grab the relic', 'Use Cunning Action', '{"bad":"json"}', 'Call to Sun Mi', 'Too many'],
    isCombat: true,
    loot: [
      { name: 'Cracked Relic', quantity: 2, type: 'quest', value: 25 },
      { description: 'missing name' },
    ],
  }));

  assert.equal(parsed.narration, 'Mira lands hard but keeps moving.');
  assert.equal(parsed.hpChange, -4);
  assert.equal(parsed.goldChange, 10000);
  assert.deepEqual(parsed.suggestedActions, ['Grab the relic', 'Use Cunning Action', 'Call to Sun Mi', 'Too many']);
  assert.equal(parsed.isCombat, true);
  assert.equal(parsed.loot?.length, 1);
  assert.equal((parsed.loot?.[0] as { type: string }).type, 'misc');
});

test('generateRollOutcomeFromService calls the model with the roll contract and parses the response', async () => {
  let capturedPrompt = '';
  const calls: Record<string, unknown>[] = [];
  const openai = {
    chat: {
      completions: {
        create: async (args: {
          model: string;
          messages: { role: 'system' | 'user'; content: string }[];
          temperature: number;
          response_format: { type: 'json_object' };
        }) => {
          assert.equal(args.model, 'gpt-4o');
          assert.deepEqual(args.response_format, { type: 'json_object' });
          capturedPrompt = args.messages.find(message => message.role === 'user')?.content || '';
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  narration: 'Mira clips the altar, recovers, and sends the relic spinning toward cover.',
                  suggestedActions: ['Dive after the relic', 'Trip the bandit with the altar cloth'],
                  sceneImagePrompt: 'Rogue and bandit in a candlelit chapel',
                  isCombat: true,
                }),
              },
            }],
          };
        },
      },
    },
  };

  const result = await generateRollOutcomeFromService({
    rollResult: 9,
    rollTotal: 13,
    dc: 15,
    success: false,
    isCritSuccess: false,
    isCritFail: false,
    rollContext: rollContext(),
    worldState,
    character: character(),
    recentHistory: ['The bandit drew steel.'],
    openai,
    logAiCall: (_fn, data) => calls.push(data),
  });

  assert.match(capturedPrompt, /NEAR MISS/);
  assert.match(capturedPrompt, /Mira vaults over the altar/);
  assert.equal(result.narration, 'Mira clips the altar, recovers, and sends the relic spinning toward cover.');
  assert.equal(result.isCombat, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].character, 'char-1');
});
