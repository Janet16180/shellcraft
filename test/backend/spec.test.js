import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dir, file, put, remove, proc, stop, cd, validatePatch } from '../../src/backend/spec.js';

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
  const patch = [put('/home/hero/camp', dir()), remove('/home/hero/junk'), proc({ key: 'daemon', user: 'hero', cmd: './shadow' }), stop('daemon'), cd('/var/log')];
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
