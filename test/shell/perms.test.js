import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, canChangeEntries, canUnlink, canChmod } from '../../src/shell/perms.js';

const hero = { user: 'hero', gids: [1000], root: { type: 'dir', children: {} } };
const node = (owner, mode, type = 'dir') => ({ type, owner, group: owner, mode });

test('can asks the shared rule for the shell user', () => {
  assert.equal(can(hero, node('root', 0o700), 'x'), false);
  assert.equal(can(hero, node('hero', 0o700), 'x'), true);
});

test('changing entries needs write and search on the directory', () => {
  assert.equal(canChangeEntries(hero, node('hero', 0o755)), true);
  assert.equal(canChangeEntries(hero, node('root', 0o755)), false);
  assert.equal(canChangeEntries(hero, node('hero', 0o655)), false);
});

test('in a sticky directory only the owner of the entry or directory may unlink it', () => {
  const tmp = node('root', 0o1777);
  assert.equal(canUnlink(hero, tmp, node('hero', 0o644, 'file')), true);
  assert.equal(canUnlink(hero, tmp, node('root', 0o644, 'file')), false);
  assert.equal(canUnlink(hero, node('root', 0o777), node('root', 0o644, 'file')), true);
});

test('only the owner or root may chmod', () => {
  assert.equal(canChmod(hero, node('hero', 0)), true);
  assert.equal(canChmod(hero, node('root', 0o777)), false);
  assert.equal(canChmod({ user: 'root', gids: [0], root: { type: 'dir', children: {} } }, node('hero', 0)), true);
});
