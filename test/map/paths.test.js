import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parentOf, joinPath, within } from '../../src/map/paths.js';

test('the parent of a path drops its last name, and / is its own parent', () => {
  assert.equal(parentOf('/home/hero/forest'), '/home/hero');
  assert.equal(parentOf('/etc'), '/');
  assert.equal(parentOf('/'), '/');
});

test('joining a name onto a directory gives one slash between them', () => {
  assert.equal(joinPath('/', 'etc'), '/etc');
  assert.equal(joinPath('/home/hero', 'forest'), '/home/hero/forest');
});

test('a path is within a directory when it is the directory or below it', () => {
  assert.equal(within('/home/hero', '/home/hero'), true);
  assert.equal(within('/home/hero/forest', '/home/hero'), true);
  assert.equal(within('/home/hero2', '/home/hero'), false);
  assert.equal(within('/etc', '/'), true);
});

test('relative paths compare the same way', () => {
  assert.equal(within('forest/cave/deep', 'forest/cave'), true);
  assert.equal(within('forest/caves', 'forest/cave'), false);
});
