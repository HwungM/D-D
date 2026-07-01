import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { narrateMicroActionRollOutcome, parseMicroActionResponse, runMicroAction } from './microActionService';

function fakeCharacter(): Character {
  return {
    id: 'char-1',
    user_id: 'user-1',
    campaign_id: 'campaign-1',
    name: 'Tessa',
    race: 'Human',
    class: 'Rogue',
    level: 3,
    xp: 100,
    hp: 20,
    max_hp: 20,
    stats: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 12 },
    abilities: [],
    inventory: [],
    gold: 50,
    reputation: {},
    is_alive: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fakeWorldBible(): WorldBible {
  return {
    geography: [], pantheon: [], toneRules: [], forbiddenLoreHooks: [], factions: [],
    era: 'test', magicSystem: 'test',
    primaryAntagonist: { name: 'X', type: 'primary', agenda: '', currentStep: '', planSteps: [], whatTheyKnow: '', isRevealed: false, power: 'minor' },
    centralConflict: '', antagonistRoster: [], openingHooks: [],
  };
}

function chatClientReturning(payload: Record<string, unknown>) {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
      },
    },
  };
}

test('parseMicroActionResponse never emits act-advancement or major-consequence fields', () => {
  const result = parseMicroActionResponse({
    reaction: 'The merchant nods.',
    awaitingRoll: false,
    minorHpChange: 2,
    minorGoldChange: 5,
    // Even if the model tried to sneak these in, they must not appear on the result.
    advanceAct: true,
    actionsInCurrentAct: 999,
    xpGained: 500,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'advanceAct'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'actionsInCurrentAct'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'xpGained'), false);
  assert.equal(result.reaction, 'The merchant nods.');
});

test('parseMicroActionResponse clamps minor consequences to small flavor ranges', () => {
  const result = parseMicroActionResponse({
    reaction: 'A scrape, nothing serious.',
    awaitingRoll: false,
    minorHpChange: -500,
    minorGoldChange: 100000,
  });
  assert.ok(result.minorHpChange! >= -5 && result.minorHpChange! <= 5);
  assert.ok(result.minorGoldChange! >= -10 && result.minorGoldChange! <= 25);
});

test('parseMicroActionResponse suppresses flavor consequences while a roll is pending', () => {
  const result = parseMicroActionResponse({
    reaction: 'You reach for the coin purse.',
    awaitingRoll: true,
    rollContext: {
      stat: 'dex', dc: 14, diceType: 'd20',
      description: 'lift the coin purse', successDescription: 'It slips free.', failDescription: 'He notices.',
      isDramatic: false, modifier: 0,
    },
    minorGoldChange: 10,
    discoveredObject: 'a hidden compartment',
    revealedClueIds: ['mystery-clue-0'],
  });
  assert.equal(result.awaitingRoll, true);
  assert.ok(result.rollContext);
  assert.equal(result.minorGoldChange, undefined);
  assert.equal(result.discoveredObject, undefined);
  assert.deepEqual(result.revealedClueIds, []);
});

test('runMicroAction never starts combat/act-progress from a fast-path reaction (grounded by construction)', async () => {
  const chat = chatClientReturning({
    reaction: 'The old woman shrugs. "Ask the harbormaster."',
    awaitingRoll: false,
    revealedClueIds: [],
  });
  const result = await runMicroAction(chat, () => {}, {
    action: 'ask the old woman about the ship',
    character: fakeCharacter(),
    worldState: {} as WorldState,
    worldBible: fakeWorldBible(),
    sceneInteractables: [],
  });
  assert.equal(result.awaitingRoll, false);
  assert.equal(result.reaction, 'The old woman shrugs. "Ask the harbormaster."');
  // The MicroActionResult type has no isCombat/advanceAct field at all —
  // structurally impossible for a micro-action to trigger either.
  assert.equal((result as Record<string, unknown>).isCombat, undefined);
  assert.equal((result as Record<string, unknown>).advanceAct, undefined);
});

test('parseMicroActionResponse classifies a combat intent and forces awaitingRoll even if the model forgot', () => {
  const result = parseMicroActionResponse({
    reaction: 'You lunge at the bandit with your blade.',
    combatIntent: 'attack',
    targetEnemy: 'Bandit',
    awaitingRoll: false, // deliberately wrong — combat must never be optional
  });
  assert.equal(result.combatIntent, 'attack');
  assert.equal(result.targetEnemy, 'Bandit');
  assert.equal(result.awaitingRoll, true);
  assert.ok(result.rollContext, 'a fallback rollContext must be built when the model omits one for a combat intent');
});

test('parseMicroActionResponse ignores an invalid combatIntent value', () => {
  const result = parseMicroActionResponse({
    reaction: 'You glance around the room.',
    combatIntent: 'flirt',
    awaitingRoll: false,
  });
  assert.equal(result.combatIntent, undefined);
  assert.equal(result.awaitingRoll, false);
});

test('runMicroAction takes the combat-aware path and always returns awaitingRoll:true while combat is active', async () => {
  const chat = chatClientReturning({
    reaction: 'You duck behind the overturned cart.',
    combatIntent: 'hide',
    targetEnemy: null,
    awaitingRoll: true,
    rollContext: {
      stat: 'dex', dc: 14, diceType: 'd20',
      description: 'duck out of sight', successDescription: 'You vanish from view.', failDescription: 'It spots you instantly.',
      isDramatic: true, modifier: 0,
    },
  });
  const worldState: WorldState = {
    combatState: {
      inCombat: true,
      enemyName: 'Ashwing the Dragon',
      enemyCondition: 'wounded',
      roundNumber: 3,
      playerActionsAttempted: [],
      enemies: [{ name: 'Ashwing the Dragon', archetype: 'boss', maxHp: 120, currentHp: 55, condition: 'wounded' }],
    },
  };
  const result = await runMicroAction(chat, () => {}, {
    action: 'duck behind the cart',
    character: fakeCharacter(),
    worldState,
    worldBible: fakeWorldBible(),
    sceneInteractables: [],
  });
  assert.equal(result.combatIntent, 'hide');
  assert.equal(result.awaitingRoll, true);
  assert.ok(result.rollContext);
});

test('runMicroAction forces a combat intent even if the model response omits one entirely', async () => {
  const chat = chatClientReturning({
    reaction: 'You swing wildly.',
    awaitingRoll: false,
  });
  const worldState: WorldState = {
    combatState: {
      inCombat: true,
      enemyName: 'Bandit',
      enemyCondition: 'healthy',
      roundNumber: 1,
      playerActionsAttempted: [],
      enemies: [{ name: 'Bandit', archetype: 'soldier', maxHp: 12, currentHp: 12, condition: 'healthy' }],
    },
  };
  const result = await runMicroAction(chat, () => {}, {
    action: 'swing my sword',
    character: fakeCharacter(),
    worldState,
    worldBible: fakeWorldBible(),
    sceneInteractables: [],
  });
  assert.equal(result.combatIntent, 'attack');
  assert.equal(result.awaitingRoll, true);
  assert.ok(result.rollContext);
});

test('narrateMicroActionRollOutcome templates success/fail/crit text without a second AI call', () => {
  const rollContext = {
    stat: 'dex' as const, dc: 14, diceType: 'd20',
    description: 'pick the lock', successDescription: 'The lock clicks open.', failDescription: 'The pick snaps.',
    critSuccessDescription: 'It opens instantly, silent as a whisper.',
    critFailDescription: 'The pick breaks off inside, jamming it for good.',
    isDramatic: false, modifier: 2,
  };
  assert.equal(narrateMicroActionRollOutcome(rollContext, true, false, false), 'The lock clicks open.');
  assert.equal(narrateMicroActionRollOutcome(rollContext, false, false, false), 'The pick snaps.');
  assert.equal(narrateMicroActionRollOutcome(rollContext, true, true, false), 'It opens instantly, silent as a whisper.');
  assert.equal(narrateMicroActionRollOutcome(rollContext, false, false, true), 'The pick breaks off inside, jamming it for good.');
});
