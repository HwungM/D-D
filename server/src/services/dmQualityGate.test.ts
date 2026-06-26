import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldBible, WorldState } from '../../../shared/types';
import { assessDmQuality, runDmQualityGate } from './dmQualityGate';
import type { BeatPlan, ChatClient } from './turnPipeline';

const basePlan: BeatPlan = {
  priorities: ['Answer the player action'],
  scenePurpose: 'social',
  pacingMode: 'tension',
  needsRoll: false,
  combatActive: false,
  combatStarting: false,
  isHighStakes: false,
  reason: 'test',
};

const worldState: WorldState = { currentLocation: 'Ash Gate' };
const worldBible: WorldBible = {
  era: 'The Long Dusk',
  magicSystem: 'Rare and costly.',
  centralConflict: 'A false envoy is turning allies against each other.',
  geography: [],
  pantheon: [],
  toneRules: [],
  forbiddenLoreHooks: [],
  factions: [],
  openingHooks: [],
  primaryAntagonist: {
    name: 'False Envoy',
    type: 'primary',
    agenda: 'Fracture the valley.',
    currentStep: 'Spread forged letters.',
    planSteps: [],
    whatTheyKnow: 'The party is suspicious.',
    isRevealed: true,
    power: 'moderate',
  },
  antagonistRoster: [],
  playerPreferences: {
    tone: 'Cozy romantic mystery with playful danger',
    favoritePillars: ['Roleplay', 'Mysteries'],
    playerCount: 2,
    characterConcepts: [],
    campaignLength: 'medium',
  },
};

test('quality assessment catches stiff co-op summary, missing character, and rushed pacing', () => {
  const issues = assessDmQuality({
    narration: 'Together, they proceed down the road. Hours pass, and before long the next act begins.',
    sceneImagePrompt: '',
    plan: basePlan,
    actionsBlock: 'CHARACTER 1 (King): ask Jarvis for the name\nCHARACTER 2 (Sun Mi): watch the crowd',
    worldState,
    worldBible,
    recentHistory: [],
    isCoop: true,
    coopNames: ['King', 'Sun Mi'],
  });

  const codes = issues.map(i => i.code);
  assert.ok(codes.includes('stiff_coop_summary'));
  assert.ok(codes.includes('coop_character_missing'));
  assert.ok(codes.includes('rushed_pacing'));
});

test('quality assessment blocks resolving a pending roll before the player rolls', () => {
  const issues = assessDmQuality({
    narration: 'You force the gate open and discover the guard ledger hidden behind it.',
    sceneImagePrompt: '',
    plan: { ...basePlan, needsRoll: true, rollReason: 'force the gate' },
    actionsBlock: 'King: force the gate',
    worldState,
    worldBible,
    recentHistory: [],
    isCoop: false,
  });

  assert.ok(issues.some(i => i.code === 'resolved_pending_roll'));
});

test('quality assessment flags overdramatic prose for cozy or romantic tone', () => {
  const issues = assessDmQuality({
    narration: 'Blood-soaked doom coils around the room as hopeless nightmare agony swallows every candle.',
    sceneImagePrompt: '',
    plan: basePlan,
    actionsBlock: 'King: ask whether the baker saw Jarvis',
    worldState,
    worldBible,
    recentHistory: [],
    isCoop: false,
  });

  assert.ok(issues.some(i => i.code === 'tone_overdramatic'));
});

test('quality gate uses critic revision when the draft fails', async () => {
  const client: ChatClient = {
    chat: {
      completions: {
        async create() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  pass: false,
                  issues: ['stiff summary'],
                  rationale: 'Too generic.',
                  revisedNarration: 'King leans across the table. Varric stops smiling when the diplomat seal hits the wood.',
                  revisedSceneImagePrompt: 'a tense tavern table with a broken wax seal',
                }),
              },
            }],
          };
        },
      },
    },
  };
  const logs: string[] = [];
  const result = await runDmQualityGate(client, (name) => logs.push(name), {
    narration: 'Together, they proceed to discuss matters.',
    sceneImagePrompt: 'generic table',
    plan: basePlan,
    actionsBlock: 'King: confront Varric with the seal',
    worldState,
    worldBible,
    recentHistory: [],
    isCoop: false,
  });

  assert.equal(result.revised, true);
  assert.equal(result.narration, 'King leans across the table. Varric stops smiling when the diplomat seal hits the wood.');
  assert.equal(result.sceneImagePrompt, 'a tense tavern table with a broken wax seal');
  assert.deepEqual(logs, ['pipeline.qualityGate']);
});
