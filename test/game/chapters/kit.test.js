import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directoriesUnder } from '../../../src/game/chapters/kit.js';
import { dir, file } from '../../../src/backend/spec.js';

const TREE = dir({
  home: dir({ hero: dir({ forest: dir({ cave: dir({ deep: dir() }), 'fish.txt': file('blub\n') }) }) }),
});

test('directoriesUnder lists a directory and every directory below it, parents first, but no files', () => {
  assert.deepEqual(directoriesUnder(TREE, '/home/hero/forest'), ['/home/hero/forest', '/home/hero/forest/cave', '/home/hero/forest/cave/deep']);
});

test('directoriesUnder of a file or a missing path is empty', () => {
  assert.deepEqual(directoriesUnder(TREE, '/home/hero/forest/fish.txt'), []);
  assert.deepEqual(directoriesUnder(TREE, '/home/hero/nowhere'), []);
});
