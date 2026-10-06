import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystem, allocPid, makeProc } from '../../src/shell/system.js';
import { lookup } from '../../src/shell/fs.js';

const make = (random = () => 0.5) => createSystem({ user: 'hero', host: 'kernelia', home: '/home/hero', now: () => 7, random, binaries: ['ls', 'cat'] });

test('the machine starts in the home, which exists and belongs to the user', () => {
  const sys = make();
  assert.equal(sys.cwd, '/home/hero');
  assert.deepEqual(lookup(sys.root, '/home/hero'), { type: 'dir', mode: 0o750, owner: 'hero', group: 'hero', mtime: 7, children: {} });
  assert.equal(lookup(sys.root, '/home').owner, 'root');
});

test('each binary is a root-owned executable in /usr/bin', () => {
  const ls = lookup(make().root, '/usr/bin/ls');
  assert.equal(ls.mode, 0o755);
  assert.equal(ls.owner, 'root');
  assert.equal(ls.bin, 'ls');
});

test('PIDs only grow', () => {
  const sys = make(() => 0.99);
  const a = allocPid(sys);
  assert.ok(allocPid(sys) > a);
});

test('makeProc fills defaults and turns ignored signals into a set', () => {
  const p = makeProc({ pid: 5, ppid: 1, user: 'hero', cmd: 'x', ignores: [15], key: 'k' });
  assert.equal(p.tty, '?');
  assert.equal(p.stat, 'S');
  assert.ok(p.ignores.has(15));
  assert.equal(p.key, 'k');
});

test('a home that is not an absolute path below / is a bug', () => {
  assert.throws(() => createSystem({ user: 'hero', host: 'h', home: 'hero', now: () => 0, random: () => 0, binaries: [] }), /home/);
});
