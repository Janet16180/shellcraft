import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dir, file, symlink, link, put, remove, proc, stop, cd, login, password, validatePatch } from '../../src/backend/spec.js';

test('a file defaults to mode 644 owned by root, with its group equal to its owner', () => {
  assert.deepEqual(file('hi\n'), { type: 'file', content: 'hi\n', mode: 0o644, owner: 'root', group: 'root' });
});

test('a directory keeps its children and takes the owner and mode it is given', () => {
  const d = dir({ 'a.txt': file('') }, { owner: 'hero', mode: 0o700 });
  assert.equal(d.type, 'dir');
  assert.equal(d.mode, 0o700);
  assert.equal(d.group, 'hero');
  assert.deepEqual(Object.keys(d.children), ['a.txt']);
});

test('a well-formed patch passes validation unchanged', () => {
  const patch = [put('/home/hero/camp', dir()), remove('/home/hero/junk'), proc({ key: 'daemon', user: 'hero', cmd: './shadow' }), stop('daemon'), cd('/var/log'), login()];
  assert.equal(validatePatch(patch), patch);
});

test('relative paths in a patch are an authoring bug and raise', () => {
  assert.throws(() => validatePatch([put('camp', dir())]), /absolute/);
  assert.throws(() => validatePatch([cd('~/forest')]), /absolute/);
});

test('an unknown operation raises', () => {
  assert.throws(() => validatePatch([{ op: 'teleport', path: '/' }]), /unknown/);
});

test('a process without a key or a command raises', () => {
  assert.throws(() => validatePatch([proc({ user: 'hero', cmd: 'x' })]), /key/);
  assert.throws(() => validatePatch([proc({ key: 'k', user: 'hero' })]), /cmd/);
});

test('a process PID, when given, is a whole number from 2 to 4194304', () => {
  for (const pid of [1, 0, 2.5, 4194305, '300']) {
    assert.throws(() => validatePatch([proc({ key: 'k', user: 'hero', cmd: 'x', pid })]), /PID/, String(pid));
  }
  assert.doesNotThrow(() => validatePatch([proc({ key: 'k', user: 'hero', cmd: 'x', pid: 4194304 })]));
});

test('a node with a mode outside 0 to 7777 raises', () => {
  assert.throws(() => validatePatch([put('/x', file('', { mode: 0o10000 }))]), /mode/);
});

test("the key 'shell' is reserved for the player's own shell and raises in a patch", () => {
  assert.throws(() => validatePatch([proc({ key: 'shell', user: 'hero', cmd: 'x' })]), /reserved/);
  assert.throws(() => validatePatch([stop('shell')]), /reserved/);
});

test('a symbolic link keeps its target text as typed, mode 777, owned by root unless told', () => {
  assert.deepEqual(symlink('forest/cave'), { type: 'symlink', target: 'forest/cave', mode: 0o777, owner: 'root', group: 'root' });
  assert.equal(symlink('/x', { owner: 'hero' }).group, 'hero');
});

test('a hard link names the absolute path of an existing node', () => {
  assert.deepEqual(link('/home/hero/a.txt'), { type: 'link', target: '/home/hero/a.txt' });
});

test('links in a patch: a symlink anywhere, a hard link only as the node a put places', () => {
  assert.doesNotThrow(() => validatePatch([put('/home/hero/d', dir({ p: symlink('x') })), put('/home/hero/b', link('/home/hero/a'))]));
  assert.throws(() => validatePatch([put('/home/hero/d', dir({ b: link('/home/hero/a') }))]), /hard link/);
  assert.throws(() => validatePatch([put('/home/hero/b', link('a'))]), /absolute/);
  assert.throws(() => validatePatch([put('/home/hero/p', symlink(''))]), /empty/);
});

test("password sets the player's password; null leaves the account without one", () => {
  assert.deepEqual(password('dragon'), { op: 'password', text: 'dragon' });
  assert.deepEqual(password(null), { op: 'password', text: null });
  assert.doesNotThrow(() => validatePatch([password('dragon'), password(null)]));
});

test('a password must be non-empty text without a newline, or null', () => {
  for (const bad of ['', 'two\nlines', 42, undefined]) assert.throws(() => validatePatch([password(bad)]), /password/, String(bad));
});
