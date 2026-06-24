import assert from 'node:assert/strict';
import test from 'node:test';
import { repairNarrationDraftIfNeeded, type AiTurnRepairMessage } from './aiTurnRepairSystem';

const baseMessages: AiTurnRepairMessage[] = [
  { role: 'system', content: 'DM system prompt' },
  { role: 'user', content: 'Scene context' },
];

test('repairNarrationDraftIfNeeded skips retry when the draft passes validation', async () => {
  let calls = 0;
  const result = await repairNarrationDraftIfNeeded({
    parsed: {
      narration: 'Mira gives you the password: ash under glass.',
      turnOutcome: {
        informationRevealed: ['The password is ash under glass.'],
        situationChanged: true,
      },
    },
    rawContent: '{"narration":"Mira gives you the password: ash under glass."}',
    isCoop: false,
    action: 'ask Mira for the password',
    messages: baseMessages,
    buildRepairInstruction: issues => issues.join('\n'),
    requestRepair: async () => {
      calls += 1;
      return '{"narration":"should not happen"}';
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.retried, false);
  assert.deepEqual(result.issues, []);
  assert.equal(result.parsed.narration, 'Mira gives you the password: ash under glass.');
});

test('repairNarrationDraftIfNeeded retries and replaces a bad draft with repaired narration', async () => {
  let repairMessages: AiTurnRepairMessage[] = [];
  const result = await repairNarrationDraftIfNeeded({
    parsed: {
      narration: 'The discovery feels like a crucial step toward understanding.',
      turnOutcome: {
        informationRevealed: [],
        situationChanged: false,
      },
    },
    rawContent: '{"narration":"The discovery feels like a crucial step toward understanding."}',
    isCoop: false,
    action: 'ask the sapling what it remembers',
    messages: baseMessages,
    buildRepairInstruction: issues => `Fix:\n- ${issues.join('\n- ')}`,
    requestRepair: async messages => {
      repairMessages = messages;
      return '{"narration":"The bark spells one name in green light: Adrian.","turnOutcome":{"informationRevealed":["The sapling remembers Adrian."],"situationChanged":true}}';
    },
  });

  assert.equal(result.retried, true);
  assert.match(result.issues.join('\n'), /sought information|vague mystery filler/i);
  assert.equal(result.parsed.narration, 'The bark spells one name in green light: Adrian.');
  assert.equal(repairMessages.at(-2)?.role, 'assistant');
  assert.equal(repairMessages.at(-1)?.role, 'user');
  assert.match(repairMessages.at(-1)?.content || '', /Fix:/);
});

test('repairNarrationDraftIfNeeded keeps original draft when retry fails', async () => {
  const result = await repairNarrationDraftIfNeeded({
    parsed: {
      narration: 'The mystery deepens.',
      turnOutcome: {
        informationRevealed: [],
        situationChanged: false,
      },
    },
    rawContent: '{"narration":"The mystery deepens."}',
    isCoop: false,
    action: 'inspect the old map',
    messages: baseMessages,
    buildRepairInstruction: issues => issues.join('\n'),
    requestRepair: async () => {
      throw new Error('model unavailable');
    },
  });

  assert.equal(result.retried, true);
  assert.match(result.issues.join('\n'), /vague mystery filler|sought information/i);
  assert.equal(result.parsed.narration, 'The mystery deepens.');
});

test('repairNarrationDraftIfNeeded keeps original draft when repaired JSON has no narration', async () => {
  const result = await repairNarrationDraftIfNeeded({
    parsed: {
      narration: 'Meanwhile, SunMasa speaks to someone across town.',
      turnOutcome: {
        informationRevealed: [],
        situationChanged: false,
      },
    },
    rawContent: '{"narration":"Meanwhile, SunMasa speaks to someone across town."}',
    isCoop: true,
    action: 'look for clues || question the guard',
    messages: baseMessages,
    buildRepairInstruction: issues => issues.join('\n'),
    requestRepair: async () => '{"turnOutcome":{"situationChanged":true}}',
  });

  assert.equal(result.retried, true);
  assert.match(result.issues.join('\n'), /split the party/i);
  assert.equal(result.parsed.narration, 'Meanwhile, SunMasa speaks to someone across town.');
});
