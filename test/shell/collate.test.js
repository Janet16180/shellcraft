import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareNames } from '../../src/shell/collate.js';

test('names sort in C.UTF-8 byte order: punctuation, digits, capitals, underscore, lowercase', () => {
  const names = ['cherry', 'apple.txt', 'Zebra', '_under', '9.txt', '10.txt', 'B', 'Banana.txt', '.hidden', 'my notes.txt'];
  assert.deepEqual(names.sort(compareNames), ['.hidden', '10.txt', '9.txt', 'B', 'Banana.txt', 'Zebra', '_under', 'apple.txt', 'cherry', 'my notes.txt']);
});

test('a prefix sorts before the longer name', () => {
  assert.ok(compareNames('ab', 'abc') < 0);
  assert.equal(compareNames('same', 'same'), 0);
});

test('characters outside ASCII sort by code point, as their UTF-8 bytes do', () => {
  assert.deepEqual(['é', 'z', '\u{1F600}', 'Ａ'].sort(compareNames), ['z', 'é', 'Ａ', '\u{1F600}']);
});
