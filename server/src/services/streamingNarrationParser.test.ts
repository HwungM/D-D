import assert from 'node:assert/strict';
import test from 'node:test';
import { StreamingNarrationParser } from './streamingNarrationParser';

test('StreamingNarrationParser yields narration tokens across chunk boundaries', () => {
  const parser = new StreamingNarrationParser();
  const tokens = [
    ...parser.push('{"nar'),
    ...parser.push('ration":"Hel'),
    ...parser.push('lo world","suggestedActions":[]}'),
  ];

  assert.equal(tokens.join(''), 'Hello world');
  assert.equal(parser.isDone(), true);
  assert.equal(parser.getRawJson(), '{"narration":"Hello world","suggestedActions":[]}');
});

test('StreamingNarrationParser handles escaped quotes, slashes, newlines, and tabs', () => {
  const parser = new StreamingNarrationParser();
  const tokens = [
    ...parser.push('{"narration":"He said \\"go\\".'),
    ...parser.push(' Path C:\\\\Temp\\nNext\\tstep","x":1}'),
  ];

  assert.equal(tokens.join(''), 'He said "go". Path C:\\Temp\nNext\tstep');
  assert.equal(parser.isDone(), true);
});

test('StreamingNarrationParser ignores later JSON fields after narration closes', () => {
  const parser = new StreamingNarrationParser();
  const tokens = [
    ...parser.push('{"narration":"First field"'),
    ...parser.push(',"other":"not emitted"}'),
  ];

  assert.equal(tokens.join(''), 'First field');
  assert.equal(parser.isDone(), true);
});

test('StreamingNarrationParser emits nothing until narration marker appears', () => {
  const parser = new StreamingNarrationParser();

  assert.deepEqual(parser.push('{"other":"value",'), []);
  assert.deepEqual(parser.push('"narration":"Now"'), ['N', 'o', 'w']);
});

test('StreamingNarrationParser keeps buffering after narration is done for final JSON parse', () => {
  const parser = new StreamingNarrationParser();

  parser.push('{"narration":"Done"');
  parser.push(',"turnOutcome":{"situationChanged":true}}');

  assert.equal(parser.getRawJson(), '{"narration":"Done","turnOutcome":{"situationChanged":true}}');
});
