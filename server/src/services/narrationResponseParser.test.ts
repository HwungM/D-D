import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSuggestedActions, parseNarrationResponse } from './narrationResponseParser';

test('parseNarrationResponse normalizes awaiting roll turns and suppresses suggestions', () => {
  const result = parseNarrationResponse({
    narration: 'The lock clicks halfway, then jams under your pick.',
    awaitingRoll: true,
    diceRequired: true,
    suggestedActions: ['Force it', 'Listen at the door'],
    rollContext: {
      stat: 'dex',
      dc: 14,
      description: 'Pick the old lock before the guard returns.',
      successDescription: 'The lock opens silently.',
      failDescription: 'The pick snaps and the guard hears.',
      modifier: 99,
    },
  });

  assert.equal(result.awaitingRoll, true);
  assert.equal(result.diceRequired, false);
  assert.equal(result.suggestedActions.length, 0);
  assert.equal(result.rollContext?.stat, 'dex');
  assert.equal(result.rollContext?.modifier, 5);
});

test('parseNarrationResponse requires valid choice cards before treating a turn as high stakes', () => {
  const invalid = parseNarrationResponse({
    narration: 'A bell tolls.',
    isHighStakes: true,
    choiceCards: [{ title: 'One choice only', description: 'Not enough cards.' }],
    suggestedActions: ['Step toward the bell'],
  });

  assert.equal(invalid.isHighStakes, false);
  assert.deepEqual(invalid.suggestedActions, ['Step toward the bell']);

  const valid = parseNarrationResponse({
    narration: 'The bridge burns behind you.',
    isHighStakes: true,
    choiceCards: [
      { title: 'Save the captain', description: 'Pull her from the fire.', consequenceHint: 'The relic may be lost.' },
      { title: 'Save the relic', description: 'Dive for the crown.', consequenceHint: 'The captain may fall.' },
    ],
    suggestedActions: ['ignored'],
  });

  assert.equal(valid.isHighStakes, true);
  assert.equal(valid.suggestedActions.length, 0);
  assert.equal(valid.choiceCards?.length, 2);
});

test('cleanSuggestedActions filters malformed and overlong model output', () => {
  const actions = cleanSuggestedActions([
    'Follow the blood trail',
    '{"bad":"json"}',
    '',
    'A'.repeat(141),
    'Question Captain Mira',
  ], ['fallback']);

  assert.deepEqual(actions, ['Follow the blood trail', 'Question Captain Mira']);
  assert.deepEqual(cleanSuggestedActions([], ['fallback']), ['fallback']);
});
