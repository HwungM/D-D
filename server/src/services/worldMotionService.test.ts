import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { extractFutureHooks, generateProactiveEvent, parseFutureHooks, parseProactiveEvent } from './worldMotionService';

test('parseFutureHooks normalizes hooks, caps at two, and truncates source', () => {
  let id = 0;
  const hooks = parseFutureHooks(
    '{"hooks":[{"description":"  Orra remembers the insult. "},{"description":"The guild saw the theft."},{"description":"ignored third"}]}',
    'x'.repeat(140),
    () => '2026-06-24T12:00:00.000Z',
    () => `hook-${++id}`,
  );

  assert.deepEqual(hooks, [
    {
      id: 'hook-1',
      description: 'Orra remembers the insult.',
      source: 'x'.repeat(100),
      createdAt: '2026-06-24T12:00:00.000Z',
      resolved: false,
    },
    {
      id: 'hook-2',
      description: 'The guild saw the theft.',
      source: 'x'.repeat(100),
      createdAt: '2026-06-24T12:00:00.000Z',
      resolved: false,
    },
  ]);
});

test('parseFutureHooks returns empty list for malformed or empty outputs', () => {
  assert.deepEqual(parseFutureHooks('not json', 'look around'), []);
  assert.deepEqual(parseFutureHooks('{"hooks":[]}', 'look around'), []);
});

test('parseProactiveEvent applies safe defaults', () => {
  assert.deepEqual(parseProactiveEvent('not json'), {
    narration: 'Something stirs in the distance...',
    sceneImagePrompt: '',
    suggestedActions: [],
  });
});

test('extractFutureHooks sends scene context and parses returned hooks', async () => {
  let userPrompt = '';
  const fakeClient = {
    chat: {
      completions: {
        create: async (args: { messages: { role: string; content: string }[] }) => {
          userPrompt = args.messages.find(m => m.role === 'user')?.content || '';
          return {
            choices: [{ message: { content: '{"hooks":[{"description":"The ferryman remembers being spared."}]}' } }],
          };
        },
      },
    },
  };

  const hooks = await extractFutureHooks(
    fakeClient,
    'spare the ferryman',
    'The ferryman drops his knife and flees into the fog.',
    { currentLocation: 'Grey Dock' } as WorldState,
    'Tortasa',
  );

  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].description, 'The ferryman remembers being spared.');
  assert.match(userPrompt, /Character: Tortasa/);
  assert.match(userPrompt, /Current location: Grey Dock/);
  assert.match(userPrompt, /spare the ferryman/);
});

test('generateProactiveEvent sends antagonist context and parses event', async () => {
  let userPrompt = '';
  const fakeClient = {
    chat: {
      completions: {
        create: async (args: { messages: { role: string; content: string }[] }) => {
          userPrompt = args.messages.find(m => m.role === 'user')?.content || '';
          return {
            choices: [{
              message: {
                content: '{"narration":"A bell rings from beneath the river.","sceneImagePrompt":"moonlit river bell","suggestedActions":["Ask who heard it","Follow the sound"]}',
              },
            }],
          };
        },
      },
    },
  };

  const event = await generateProactiveEvent(
    fakeClient,
    { currentLocation: 'River Gate', timeOfDay: 'night' } as WorldState,
    {
      centralConflict: 'The river remembers every betrayal.',
      antagonistRoster: [{ name: 'The Silt King', isRevealed: false, currentStep: 'poisoning wells' }],
    } as WorldBible,
    { name: 'SunMasa', race: 'Elf', class: 'Bard', level: 3 } as Character,
  );

  assert.deepEqual(event, {
    narration: 'A bell rings from beneath the river.',
    sceneImagePrompt: 'moonlit river bell',
    suggestedActions: ['Ask who heard it', 'Follow the sound'],
  });
  assert.match(userPrompt, /River Gate/);
  assert.match(userPrompt, /The river remembers every betrayal/);
  assert.match(userPrompt, /\[Unknown Force\] - poisoning wells/);
});
