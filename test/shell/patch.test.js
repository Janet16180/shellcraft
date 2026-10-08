import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch } from '../../src/shell/patch.js';
import { createSystem } from '../../src/shell/system.js';
import { lookup } from '../../src/shell/fs.js';
import { put, proc, cd, dir, file, symlink, link, password } from '../../src/backend/spec.js';

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

test('a proc may ask for its PID; the next free PIDs come after it', () => {
  const sys = make();
  applyPatch(sys, [proc({ key: 'a', user: 'hero', cmd: 'x', pid: 4242 }), proc({ key: 'b', user: 'hero', cmd: 'y' })]);
  assert.equal(sys.procs.find(p => p.key === 'a').pid, 4242);
  assert.ok(sys.procs.find(p => p.key === 'b').pid > 4242);
});

test('a proc that asks for a PID already in use raises', () => {
  const sys = make();
  assert.throws(() => applyPatch(sys, [proc({ key: 'a', user: 'hero', cmd: 'x', pid: sys.shellPid })]), /PID .* in use/);
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

test('a world deeper than the tree limit is an authoring bug', () => {
  let deep = file('x');
  for (let i = 0; i < 300; i++) deep = dir({ d: deep });
  assert.throws(() => applyPatch(make(), [put('/home/hero/deep', deep)]), /deeper than 256 levels/);
});

test('put places a symbolic link with its target text as given', () => {
  const sys = make();
  applyPatch(sys, [put('/home/hero/a.txt', file('a')), put('/home/hero/p', symlink('a.txt', { owner: 'hero' }))]);
  assert.equal(lookup(sys.root, '/home/hero/p', { follow: false }).target, 'a.txt');
  assert.equal(lookup(sys.root, '/home/hero/p').content, 'a');
});

test('put of a hard link makes a second name for the same node, stamping only the directory', () => {
  let now = 3;
  const sys = createSystem({ user: 'hero', host: 'kernelia', home: '/home/hero', now: () => now, random: () => 0.5, binaries: [] });
  applyPatch(sys, [put('/home/hero/a.txt', file('a')), put('/home/hero/d', dir())]);
  now = 9;
  applyPatch(sys, [put('/home/hero/d/b.txt', link('/home/hero/a.txt'))]);
  assert.equal(lookup(sys.root, '/home/hero/d/b.txt'), lookup(sys.root, '/home/hero/a.txt'));
  assert.equal(lookup(sys.root, '/home/hero/a.txt').mtime, 3);
  assert.equal(lookup(sys.root, '/home/hero/d').mtime, 9);
});

test('a hard link to a directory or to nothing raises', () => {
  const sys = make();
  assert.throws(() => applyPatch(sys, [put('/home/hero/h', link('/home'))]), /directory/);
  assert.throws(() => applyPatch(sys, [put('/home/hero/h', link('/home/hero/nope'))]), /no such/);
});

test("password sets the account's password on the machine, outside the tree, and forgets any sudo timestamp", () => {
  const sys = createSystem({ user: 'hero', host: 'h', home: '/home/hero', now: () => 0, random: () => 0.5, binaries: [] });
  assert.equal(sys.password, null);
  applyPatch(sys, [password('dragon')]);
  assert.equal(sys.password, 'dragon');
  sys.sudoStamp = 5;
  applyPatch(sys, [password(null)]);
  assert.equal(sys.password, null);
  assert.equal(sys.sudoStamp, null);
});
