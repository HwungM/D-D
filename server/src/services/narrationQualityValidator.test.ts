import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanTurnOutcome, detectNarrationIssues } from './narrationQualityValidator';

test('cleanTurnOutcome normalizes model-provided proof fields', () => {
  assert.deepEqual(cleanTurnOutcome({
    playerIntent: ' ask the guard ',
    concreteResult: ' Name revealed ',
    informationRevealed: [' Adrian ', '', 42],
    situationChanged: 'true',
    unresolvedQuestion: '',
    whyNoRoll: null,
    whyRollNeeded: ' guarded secret ',
  }), {
    playerIntent: 'ask the guard',
    concreteResult: 'Name revealed',
    informationRevealed: ['Adrian'],
    situationChanged: true,
    unresolvedQuestion: null,
    whyNoRoll: null,
    whyRollNeeded: 'guarded secret',
  });
});

test('detectNarrationIssues catches co-op split-camera narration', () => {
  const issues = detectNarrationIssues(
    'Tortasa questions the guard. Meanwhile, SunMasa follows a different alley.',
    true,
    { turnOutcome: cleanTurnOutcome({ informationRevealed: ['The guard knows Adrian.'], situationChanged: true }) },
  );

  assert.match(issues.join('\n'), /split the party/i);
});

test('detectNarrationIssues catches weather and ambient opener crutches', () => {
  const issues = detectNarrationIssues(
    'The air hangs thick over the square as the merchant waits.',
    false,
    { turnOutcome: cleanTurnOutcome({ informationRevealed: ['The merchant saw the red cloak.'], situationChanged: true }) },
  );

  assert.match(issues.join('\n'), /weather\/sky\/air\/ambient bustle/i);
});

test('detectNarrationIssues catches vague mystery filler with no concrete payoff', () => {
  const issues = detectNarrationIssues(
    'The discovery feels like a crucial step toward understanding, and the mystery deepens.',
    false,
    { turnOutcome: cleanTurnOutcome({ informationRevealed: [], situationChanged: false }) },
  );

  assert.match(issues.join('\n'), /vague mystery filler/i);
});

test('detectNarrationIssues requires information requests to reveal facts or ask for rolls', () => {
  const issues = detectNarrationIssues(
    'The old woman studies you for a long moment, saying nothing of substance.',
    false,
    {
      action: 'ask the old woman about Adrian',
      turnOutcome: cleanTurnOutcome({ informationRevealed: [], situationChanged: false }),
    },
  );

  assert.match(issues.join('\n'), /sought information/i);
});

test('detectNarrationIssues requires task attempts to change the situation or ask for rolls', () => {
  const issues = detectNarrationIssues(
    'You try to lift the fallen gate, but the moment only grows tense.',
    false,
    {
      action: 'lift the fallen gate',
      turnOutcome: cleanTurnOutcome({ informationRevealed: [], situationChanged: false }),
    },
  );

  assert.match(issues.join('\n'), /attempted a concrete action/i);
});

test('detectNarrationIssues allows guarded uncertainty when a roll is requested', () => {
  const issues = detectNarrationIssues(
    'The guard hesitates, jaw tight, clearly deciding whether to trust you.',
    false,
    {
      action: 'ask the guard who hired him',
      turnOutcome: cleanTurnOutcome({
        informationRevealed: [],
        situationChanged: false,
        whyRollNeeded: 'The guard is afraid of retaliation.',
      }),
    },
  );

  assert.deepEqual(issues, []);
});

test('detectNarrationIssues catches hero puppeting and unchosen scene transitions', () => {
  const issues = detectNarrationIssues(
    'Gol and Saty exchange a knowing look. Together, they set off toward the Gilded Glade.',
    true,
    { action: 'Ask Ryliss for more information' },
  );

  assert.ok(issues.some(item => item.includes('invented a hero reaction')));
  assert.ok(issues.some(item => item.includes('unchosen scene transition')));
});
