import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInside, directoriesUnder } from '../../../src/game/chapters/kit.js';
import { dir, file } from '../../../src/backend/spec.js';

const TREE = dir({
  home: dir({ hero: dir({ forest: dir({ cave: dir({ deep: dir() }), 'fish.txt': file('blub\n') }) }) }),
});

test('a path is inside a directory when it is the directory or below it, not a sibling with the same prefix', () => {
  assert.ok(isInside('/home/hero', '/home/hero'));
  assert.ok(isInside('/home/hero/forest', '/home/hero'));
  assert.ok(!isInside('/home/heroine', '/home/hero'));
  assert.ok(!isInside('/home', '/home/hero'));
});

test('directoriesUnder lists a directory and every directory below it, parents first, but no files', () => {
  assert.deepEqual(directoriesUnder(TREE, '/home/hero/forest'), ['/home/hero/forest', '/home/hero/forest/cave', '/home/hero/forest/cave/deep']);
});

test('directoriesUnder of a file or a missing path is empty', () => {
  assert.deepEqual(directoriesUnder(TREE, '/home/hero/forest/fish.txt'), []);
  assert.deepEqual(directoriesUnder(TREE, '/home/hero/nowhere'), []);
});
