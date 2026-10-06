import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parentOf, joinPath } from '../../src/map/paths.js';

test('the parent of a path drops its last name, and / is its own parent', () => {
  assert.equal(parentOf('/home/hero/forest'), '/home/hero');
  assert.equal(parentOf('/etc'), '/');
  assert.equal(parentOf('/'), '/');
});

test('joining a name onto a directory gives one slash between them', () => {
  assert.equal(joinPath('/', 'etc'), '/etc');
  assert.equal(joinPath('/home/hero', 'forest'), '/home/hero/forest');
});
