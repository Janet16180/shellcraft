import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick, shuffle, token, isInside, nodeAt, directoriesUnder, TOKEN_ALPHABET } from '../../../src/game/chapters/kit.js';
import { dir, file } from '../../../src/backend/spec.js';

const counter = values => {
  let i = 0;
  return () => values[i++ % values.length];
};

const TREE = dir({
  home: dir({ hero: dir({ forest: dir({ cave: dir({ deep: dir() }), 'fish.txt': file('blub\n') }) }) }),
});

test('pick maps the random number onto the list', () => {
  assert.equal(pick(counter([0]), ['a', 'b', 'c']), 'a');
  assert.equal(pick(counter([0.99]), ['a', 'b', 'c']), 'c');
});

test('picking from an empty list is a bug and raises', () => {
  assert.throws(() => pick(Math.random, []), /empty/);
});

test('shuffle keeps every item and leaves the original list alone', () => {
  const items = ['a', 'b', 'c', 'd'];
  const shuffled = shuffle(counter([0.1, 0.7, 0.3]), items);
  assert.deepEqual([...shuffled].sort(), items);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});

test('a token has the asked length and uses only the safe alphabet', () => {
  const random = counter([0, 0.2, 0.5, 0.8, 0.999]);
  const value = token(random, 40);
  assert.equal(value.length, 40);
  assert.match(value, new RegExp(`^[${TOKEN_ALPHABET}]+$`));
  assert.doesNotMatch(TOKEN_ALPHABET, /[0O1lI2Z5S8B]/);
});

test('a path is inside a directory when it is the directory or below it, not a sibling with the same prefix', () => {
  assert.ok(isInside('/home/hero', '/home/hero'));
  assert.ok(isInside('/home/hero/forest', '/home/hero'));
  assert.ok(!isInside('/home/heroine', '/home/hero'));
  assert.ok(!isInside('/home', '/home/hero'));
});

test('nodeAt finds a node by absolute path and returns undefined for a missing one', () => {
  assert.equal(nodeAt(TREE, '/'), TREE);
  assert.equal(nodeAt(TREE, '/home/hero/forest/fish.txt').content, 'blub\n');
  assert.equal(nodeAt(TREE, '/home/hero/nowhere/deeper'), undefined);
});

test('directoriesUnder lists a directory and every directory below it, but no files', () => {
  assert.deepEqual(directoriesUnder(TREE, '/home/hero/forest'), ['/home/hero/forest', '/home/hero/forest/cave', '/home/hero/forest/cave/deep']);
  assert.deepEqual(directoriesUnder(TREE, '/home/hero/forest/fish.txt'), []);
});
