import { test } from 'node:test';
import assert from 'node:assert/strict';
import { result, withNote, needInput } from '../../src/shell/result.js';

test('result defaults to an empty success', () => {
  assert.deepEqual(result(), { out: '', err: '', status: 0, html: null, note: null });
});

test('withNote copies the result with a note', () => {
  const r = result('x');
  assert.equal(withNote(r, 'n').note, 'n');
  assert.equal(r.note, null);
});

test('needInput fails with a note naming the command', () => {
  const r = needInput('sort');
  assert.equal(r.status, 1);
  assert.match(r.note, /^sort is waiting for keyboard input/);
});
