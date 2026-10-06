import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch } from '../../src/shell/patch.js';
import { createSystem } from '../../src/shell/system.js';
import { lookup } from '../../src/shell/fs.js';
import { put, proc, cd, dir, file } from '../../src/backend/spec.js';

const make = () => createSystem({ user: 'hero', host: 'kernelia', home: '/home/hero', now: () => 3, random: () => 0.5, binaries: ['ls'] });

test('put creates nodes stamped with the clock', () => {
  const sys = make();
  applyPatch(sys, [put('/home/hero/a.txt', file('a'))]);
  assert.equal(lookup(sys.root, '/home/hero/a.txt').mtime, 3);
});

test('a proc on the terminal is a child of the shell; others are children of init', () => {
  const sys = make();
  applyPatch(sys, [proc({ key: 'a', user: 'hero', cmd: 'sleep 1', tty: 'pts/0' }), proc({ key: 'b', user: 'root', cmd: 'x' })]);
  assert.equal(sys.procs.find(p => p.key === 'a').ppid, sys.shellPid);
  assert.equal(sys.procs.find(p => p.key === 'b').ppid, 1);
});

test('an unknown signal name in ignores raises', () => {
  assert.throws(() => applyPatch(make(), [proc({ key: 'a', user: 'hero', cmd: 'x', ignores: ['NOPE'] })]), /unknown signal/);
});

test('cd sets the old directory like a real cd and refuses a non-directory', () => {
  const sys = make();
  applyPatch(sys, [put('/tmp', dir()), cd('/tmp')]);
  assert.equal(sys.oldpwd, '/home/hero');
  assert.throws(() => applyPatch(sys, [cd('/nope')]), /not a directory/);
});

test('a malformed patch raises before anything changes', () => {
  const sys = make();
  assert.throws(() => applyPatch(sys, [put('relative', dir())]), /absolute/);
});
