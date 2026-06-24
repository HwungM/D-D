import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { parseStoryDirectorBeat, runStoryDirector } from './storyDirectorService';

test('parseStoryDirectorBeat returns null when the campaign is healthy', () => {
  assert.equal(parseStoryDirectorBeat('{"healthy":true}'), null);
});

test('parseStoryDirectorBeat normalizes beat urgency and beat type', () => {
  assert.deepEqual(parseStoryDirectorBeat('{"beat":"Bring Mira back with the burned map.","urgency":"critical","beatType":"hook_payoff"}'), {
    beat: 'Bring Mira back with the burned map.',
    urgency: 'critical',
    beatType: 'hook_payoff',
  });

  assert.deepEqual(parseStoryDirectorBeat('{"beat":"Drop a concrete clue."}'), {
    beat: 'Drop a concrete clue.',
    urgency: 'low',
    beatType: 'pacing',
  });
});

test('parseStoryDirectorBeat rejects malformed or beatless output', () => {
  assert.equal(parseStoryDirectorBeat('not json'), null);
  assert.equal(parseStoryDirectorBeat('{"urgency":"high"}'), null);
});

test('runStoryDirector builds campaign health context and parses model response', async () => {
  let userPrompt = '';
  const fakeClient = {
    chat: {
      completions: {
        create: async (args: { messages: { role: string; content: string }[] }) => {
          userPrompt = args.messages.find(m => m.role === 'user')?.content || '';
          return {
            choices: [{
              message: {
                content: '{"beat":"Have Captain Orra demand payment for the broken oath.","urgency":"high","beatType":"backstory_escalation"}',
              },
            }],
          };
        },
      },
    },
  };

  const worldState = {
    actionsInCurrentAct: 9,
    actionCount: 21,
    lastPillarUsed: 'combat',
    spotlightBalance: { c1: 4, c2: 0 },
    sessionNotes: ['The party ignored Captain Orra.'],
    futureHooks: [{ id: 'h1', description: 'Captain Orra remembers the broken oath', resolved: false }],
    backstoryHooks: [{ characterId: 'c2', characterName: 'SunMasa', hook: 'A debt to Orra', status: 'active' }],
    actGoalsAchieved: ['Find the burned map'],
  } as unknown as WorldState;

  const worldBible = {
    centralConflict: 'Promises cost more than gold.',
    mysteryLayer: { centralQuestion: 'Who burned the treaty?', clues: [], redHerrings: [], revelation: 'Orra did it.' },
    dmRoadmap: {
      act1Goals: ['Find the burned map', 'Meet Orra'],
      act1MustIntroduce: [],
      act1ClimaxEvent: 'The oath breaks.',
      act2Goals: [],
      act2VillainEscalation: '',
      act2ClimaxEvent: '',
      act3ConvergenceThreads: [],
      act3ClimaxEvent: '',
      act3ResolutionOptions: [],
    },
  } as unknown as WorldBible;

  const characters = [
    { id: 'c1', name: 'Tortasa', race: 'Tortle', class: 'Fighter', level: 4 },
    { id: 'c2', name: 'SunMasa', race: 'Elf', class: 'Bard', level: 4 },
  ] as Character[];

  const result = await runStoryDirector(fakeClient, worldState, worldBible, characters, 1);

  assert.deepEqual(result, {
    beat: 'Have Captain Orra demand payment for the broken oath.',
    urgency: 'high',
    beatType: 'backstory_escalation',
  });
  assert.match(userPrompt, /Campaign health check for Act 1/);
  assert.match(userPrompt, /Captain Orra remembers the broken oath/);
  assert.match(userPrompt, /Tortasa \(Tortle Fighter, Lv4\), SunMasa \(Elf Bard, Lv4\)/);
});

test('runStoryDirector returns null when the client call fails', async () => {
  const fakeClient = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('network down');
        },
      },
    },
  };

  const result = await runStoryDirector(fakeClient, {} as WorldState, {} as WorldBible, [], 1);
  assert.equal(result, null);
});
