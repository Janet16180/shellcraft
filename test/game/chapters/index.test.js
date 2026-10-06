import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapters from '../../../src/game/chapters/index.js';

const ORDER = ['awakening', 'forest', 'unseen', 'camp', 'junkyard', 'mirrors', 'library', 'tower', 'market', 'descent', 'gate', 'well', 'daemon', 'forge'];

test('the chapter list has the fourteen chapters of the design, in order', () => {
  assert.deepEqual(chapters.map(chapter => chapter.id), ORDER);
});

test('act I runs to the Market of Pipes and act II starts with the Descent', () => {
  assert.deepEqual(chapters.map(chapter => chapter.act), [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
});

test('the slice plays the first two chapters and marks the rest as coming soon', () => {
  assert.deepEqual(chapters.map(chapter => Boolean(chapter.soon)), ORDER.map((_, i) => i >= 2));
  for (const chapter of chapters) assert.ok(chapter.title, chapter.id);
});
