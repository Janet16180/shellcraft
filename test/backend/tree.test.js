import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeAt, isInside, compareNames } from '../../src/backend/tree.js';
import { dir, file } from '../../src/backend/spec.js';

const tree = dir({ home: dir({ hero: dir({ 'a.txt': file('hi\n') }) }) });

test('nodeAt finds a node by its absolute path and the root by /', () => {
  assert.equal(nodeAt(tree, '/home/hero/a.txt').content, 'hi\n');
  assert.equal(nodeAt(tree, '/'), tree);
});

test('nodeAt gives null for a path where nothing is, even below a file', () => {
  assert.equal(nodeAt(tree, '/home/nobody'), null);
  assert.equal(nodeAt(tree, '/home/hero/a.txt/x'), null);
});

test('nodeAt raises for a relative path, which is a caller bug', () => {
  assert.throws(() => nodeAt(tree, 'home/hero'), /absolute/);
});

test('a directory is inside itself and holds everything below it', () => {
  assert.equal(isInside('/home/hero', '/home/hero'), true);
  assert.equal(isInside('/home/hero/forest/cave', '/home/hero'), true);
});

test('a sibling that only shares a prefix is not inside', () => {
  assert.equal(isInside('/home/heroine', '/home/hero'), false);
  assert.equal(isInside('/home', '/home/hero'), false);
});

test('every absolute path is inside the root', () => {
  assert.equal(isInside('/', '/'), true);
  assert.equal(isInside('/home/hero', '/'), true);
});

test('names compare in C.UTF-8 order: by code point, capitals and dots first', () => {
  assert.deepEqual(['b', '.x', 'B', 'a', '_y'].sort(compareNames), ['.x', 'B', '_y', 'a', 'b']);
});

test('names compare by code point even beyond the basic plane', () => {
  assert.ok(compareNames('\u{1F600}', '�') > 0);
  assert.ok(compareNames('ab', 'abc') < 0);
  assert.equal(compareNames('same', 'same'), 0);
});
