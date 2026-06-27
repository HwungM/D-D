import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldState } from '../../../shared/types';
import {
  assessRollOutcomeQuality,
  cleanRollSuggestedActions,
  runRollOutcomeQualityGate,
  type RollOutcomeQualityArgs,
} from './rollOutcomeQualityGate';

const worldState: WorldState = {
  currentLocation: 'Verdant Valley',
  currentSceneSummary: 'Foliza and Skirmy are trying to draw Jarvis into revealing a secret.',
};

function baseArgs(overrides: Partial<RollOutcomeQualityArgs> = {}): RollOutcomeQualityArgs {
  return {
    result: {
      narration: 'Foliza finishes the song and the crowd turns toward Jarvis, whose guarded expression cracks just enough to matter.',
      suggestedActions: ['Ask Jarvis what he knows', 'Watch the crowd', 'Signal Skirmy'],
      sceneImagePrompt: 'Two performers in a green valley before a wary old informant',
    },
    rollResult: 16,
    rollTotal: 19,
    dc: 15,
    success: true,
    isCritSuccess: false,
    isCritFail: false,
    rollContext: {
      stat: 'cha',
      description: 'Foliza and Skirmy perform to draw Jarvis into revealing what he knows',
      successDescription: 'Jarvis shares valuable information.',
      failDescription: 'Jarvis remains guarded.',
    },
    worldState,
    isCoop: true,
    actorNames: ['Foliza', 'Skirmy'],
    rolls: [
      { characterName: 'Foliza', description: 'perform the melody', rollResult: 16, rollTotal: 19, dc: 15, success: true },
      { characterName: 'Skirmy', description: 'watch Jarvis for tells', rollResult: 12, rollTotal: 14, dc: 15, success: false },
    ],
    ...overrides,
  };
}

test('assessRollOutcomeQuality catches co-op roll outcomes that drop a player', () => {
  const issues = assessRollOutcomeQuality(baseArgs());

  assert.ok(issues.some(issue => issue.code === 'coop_character_missing'));
  assert.ok(issues.some(issue => issue.message.includes('Skirmy')));
});

test('assessRollOutcomeQuality catches success/failure contradiction', () => {
  const issues = assessRollOutcomeQuality(baseArgs({
    success: false,
    result: {
      narration: 'Foliza succeeds and cleanly gets exactly what she wanted from Jarvis with ease.',
      suggestedActions: ['Continue', 'Look around'],
      sceneImagePrompt: '',
    },
    actorNames: ['Foliza'],
    isCoop: false,
    rolls: undefined,
  }));

  assert.ok(issues.some(issue => issue.code === 'failure_reads_as_success'));
});

test('roll quality catches invented hero speech, unchosen travel, and NPC pronoun drift', () => {
  const issues = assessRollOutcomeQuality(baseArgs({
    result: {
      narration: '"We should leave now," Foliza says. Ryliss adjusts her cap. They set off toward the Gilded Glade.',
      suggestedActions: ['Inspect the letter', 'Ask Ryliss about the seal', 'Watch the alley door'],
      sceneImagePrompt: '',
    },
    rollContext: {
      stat: 'cha',
      description: 'Foliza asks Ryliss to reveal who delivered the letter',
      successDescription: 'Ryliss reveals the courier.',
      failDescription: 'Ryliss stays guarded.',
    },
    worldState: {
      ...worldState,
      npcMemory: [{ name: 'Ryliss', disposition: 'friendly', notes: 'Nervous shopkeeper.', gender: 'male' }],
    },
    actorNames: ['Foliza'],
    isCoop: false,
    rolls: undefined,
  }));

  const codes = issues.map(issue => issue.code);
  assert.ok(codes.includes('invented_player_dialogue'));
  assert.ok(codes.includes('unauthorized_scene_transition'));
  assert.ok(codes.includes('npc_identity_violation'));
});

test('cleanRollSuggestedActions replaces generic suggestions with grounded fallbacks', () => {
  const actions = cleanRollSuggestedActions(['Continue', 'Look around', 'Ask Jarvis about the diplomat'], baseArgs());

  assert.equal(actions[0], 'Ask Jarvis about the diplomat');
  assert.ok(actions.length >= 3);
  assert.ok(actions.some(action => /Foliza and Skirmy perform/.test(action)));
});

test('runRollOutcomeQualityGate applies critic revision while preserving mechanics', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                pass: false,
                issues: ['co-op partner missing'],
                rationale: 'Skirmy is absent.',
                revised: {
                  narration: 'Foliza lets the final note hang while Skirmy catches Jarvis glancing toward the sealed courier pouch. The crowd gives them cover; Jarvis does not confess everything, but his silence now points somewhere useful.',
                  suggestedActions: ['Have Skirmy follow Jarvis’s glance', 'Ask Foliza to keep the crowd engaged', 'Press Jarvis about the courier pouch'],
                  sceneImagePrompt: 'Foliza singing as Skirmy spots Jarvis watching a courier pouch',
                  isCombat: false,
                },
              }),
            },
          }],
        }),
      },
    },
  };

  const result = await runRollOutcomeQualityGate(openai, undefined, baseArgs());

  assert.match(result.narration, /Skirmy/);
  assert.equal(result.qualityRevised, true);
  assert.equal(result.isCombat, false);
  assert.deepEqual(result.suggestedActions.slice(0, 2), ['Have Skirmy follow Jarvis’s glance', 'Ask Foliza to keep the crowd engaged']);
});
