import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSceneSummaryPrompt, generateSceneSummaryFromService } from './sceneSummaryService';

test('buildSceneSummaryPrompt focuses on the last eight events and current scene facts', () => {
  const recentHistory = Array.from({ length: 10 }, (_, index) => `event ${index + 1}`);

  const prompt = buildSceneSummaryPrompt({
    recentHistory,
    currentLocation: 'Moonlit Causeway',
    characterName: 'Mira',
    combatState: null,
  });

  assert.doesNotMatch(prompt, /^event 1$/m);
  assert.doesNotMatch(prompt, /^event 2$/m);
  assert.match(prompt, /event 3/);
  assert.match(prompt, /event 10/);
  assert.match(prompt, /Location: Moonlit Causeway/);
  assert.match(prompt, /Character: Mira/);
  assert.match(prompt, /Write ONLY the summary, no preamble/);
});

test('buildSceneSummaryPrompt includes active combat context', () => {
  const prompt = buildSceneSummaryPrompt({
    recentHistory: ['Mira drew steel.', 'The ghoul climbed from the well.'],
    currentLocation: 'Old Well',
    characterName: 'Mira & Sun Mi',
    combatState: {
      inCombat: true,
      enemyName: 'Well Ghoul',
      enemyCondition: 'critical',
      roundNumber: 3,
      playerActionsAttempted: [],
    },
  });

  assert.match(prompt, /Currently in combat with Well Ghoul \(critical, round 3\)/);
  assert.match(prompt, /Mira & Sun Mi/);
});

test('generateSceneSummaryFromService calls gpt-4o-mini and trims the summary', async () => {
  let capturedArgs: {
    model: string;
    messages: { role: 'user'; content: string }[];
    max_tokens: number;
    temperature: number;
  } | undefined;

  const openai = {
    chat: {
      completions: {
        create: async (args: {
          model: string;
          messages: { role: 'user'; content: string }[];
          max_tokens: number;
          temperature: number;
        }) => {
          capturedArgs = args;
          return {
            choices: [{
              message: {
                content: '  Mira and Sun Mi corner the injured ghoul beside the old well.  ',
              },
            }],
          };
        },
      },
    },
  };

  const summary = await generateSceneSummaryFromService(openai, {
    recentHistory: ['The ghoul fled.', 'Sun Mi blocked the path.'],
    currentLocation: 'Old Well',
    characterName: 'Mira & Sun Mi',
    combatState: null,
  });

  assert.equal(summary, 'Mira and Sun Mi corner the injured ghoul beside the old well.');
  assert.equal(capturedArgs?.model, 'gpt-4o-mini');
  assert.equal(capturedArgs?.max_tokens, 150);
  assert.equal(capturedArgs?.temperature, 0.3);
  assert.match(capturedArgs?.messages[0].content || '', /Sun Mi blocked the path/);
});
