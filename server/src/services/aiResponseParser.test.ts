import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJsonArray, parseJsonRecord, parseJsonValueOrFallback } from './aiResponseParser';

test('parseJsonRecord parses ordinary object responses', () => {
  assert.deepEqual(parseJsonRecord('{"narration":"You find a clue."}'), {
    narration: 'You find a clue.',
  });
});

test('parseJsonRecord extracts fenced JSON objects', () => {
  assert.deepEqual(parseJsonRecord('```json\n{"ok":true}\n```'), {
    ok: true,
  });
});

test('parseJsonRecord extracts object from wrapped AI text', () => {
  assert.deepEqual(parseJsonRecord('Sure — here is the JSON:\n{"hpChange":-2,"note":"brace { inside string }"}\nDone.'), {
    hpChange: -2,
    note: 'brace { inside string }',
  });
});

test('parseJsonRecord falls back for arrays and malformed content', () => {
  const fallback = { narration: 'safe fallback' };

  assert.equal(parseJsonRecord('[{"name":"seed"}]', fallback), fallback);
  assert.equal(parseJsonRecord('not json', fallback), fallback);
  assert.equal(parseJsonRecord('', fallback), fallback);
});

test('parseJsonArray extracts arrays when the caller expects an array', () => {
  assert.deepEqual(parseJsonArray('Before [{"name":"seed"}] after'), [{ name: 'seed' }]);
  assert.deepEqual(parseJsonArray('{"not":"array"}', ['fallback']), ['fallback']);
});

test('parseJsonValueOrFallback supports non-record JSON values', () => {
  assert.deepEqual(parseJsonValueOrFallback('{"hooks":[]}', { hooks: ['fallback'] }), { hooks: [] });
  assert.equal(parseJsonValueOrFallback('"plain"', 'fallback'), 'plain');
  assert.equal(parseJsonValueOrFallback('bad', 'fallback'), 'fallback');
});
