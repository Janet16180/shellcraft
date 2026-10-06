import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allows } from '../../src/backend/access.js';
import { dir, file } from '../../src/backend/spec.js';

const hero = { user: 'hero', groups: ['hero'] };

test('the owner class decides for the owner even when others have more rights', () => {
  const f = file('', { owner: 'hero', mode: 0o047 });
  assert.equal(allows(f, 'r', hero), false);
  assert.equal(allows(f, 'w', hero), false);
});

test('a member of the file group gets the group bits', () => {
  const f = file('', { owner: 'root', group: 'staff', mode: 0o640 });
  assert.equal(allows(f, 'r', { user: 'hero', groups: ['hero', 'staff'] }), true);
  assert.equal(allows(f, 'w', { user: 'hero', groups: ['hero', 'staff'] }), false);
});

test('anyone else gets the other bits', () => {
  const d = dir({}, { owner: 'root', mode: 0o700 });
  assert.equal(allows(d, 'x', hero), false);
  assert.equal(allows(dir({}, { owner: 'root', mode: 0o755 }), 'x', hero), true);
});

test('root reads and writes anything and enters any directory', () => {
  const root = { user: 'root', groups: ['root'] };
  assert.equal(allows(file('', { owner: 'hero', mode: 0o000 }), 'w', root), true);
  assert.equal(allows(dir({}, { owner: 'hero', mode: 0o000 }), 'x', root), true);
});

test('root cannot execute a file that has no execute bit for anyone', () => {
  const root = { user: 'root', groups: ['root'] };
  assert.equal(allows(file('', { mode: 0o644 }), 'x', root), false);
  assert.equal(allows(file('', { mode: 0o744 }), 'x', root), true);
});

test('asking for a permission other than r, w or x is a bug and raises', () => {
  assert.throws(() => allows(file(''), 'rw', hero), /permission/);
});
