import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext } from '../../src/game/checks.js';
import { HOME, observation, record } from '../helpers/records.js';

const context = (commands, after = {}, before = {}) =>
  makeContext({ commands, before: observation(before), obs: observation(after) });

test('the context exposes the line, both observations, home and the new cwd', () => {
  const commands = [record('cd', ['forest'])];
  const ctx = context(commands, { cwd: `${HOME}/forest` });
  assert.equal(ctx.commands, commands);
  assert.equal(ctx.home, HOME);
  assert.equal(ctx.cwd, `${HOME}/forest`);
  assert.equal(ctx.before.cwd, HOME);
  assert.equal(ctx.obs.cwd, `${HOME}/forest`);
});

test('node finds files and directories by absolute path in the observation after the line', () => {
  const ctx = context([]);
  assert.equal(ctx.node(`${HOME}/readme.txt`).content, 'Welcome, hero.\n');
  assert.equal(ctx.node(`${HOME}/forest/cave`).type, 'dir');
  assert.equal(ctx.node(`${HOME}/forest/`).type, 'dir');
  assert.equal(ctx.node('/').type, 'dir');
});

test('node returns null for a path that does not exist', () => {
  assert.equal(context([]).node(`${HOME}/nothing`), null);
  assert.equal(context([]).node(`${HOME}/readme.txt/inside`), null);
});

test('node with a relative path is an authoring bug and raises', () => {
  assert.throws(() => context([]).node('forest'), /absolute/);
});

test('proc finds a process by the key a patch started it under', () => {
  const daemon = { pid: 4242, ppid: 1, user: 'hero', tty: '?', stat: 'R', cpu: 99, mem: 12, cmd: './shadow', key: 'daemon' };
  const ctx = context([], { procs: [daemon] });
  assert.equal(ctx.proc('daemon'), daemon);
  assert.equal(ctx.proc('ghost'), null);
});

test('ran needs a command with that name that exited 0', () => {
  const ctx = context([record('ls', [], { status: 2 }), record('pwd')]);
  assert.equal(ctx.ran('pwd'), true);
  assert.equal(ctx.ran('ls'), false);
  assert.equal(ctx.ran('whoami'), false);
});

test('ran and tried apply the predicate to the record', () => {
  const ctx = context([record('cat', ['readme.txt'], { status: 1 })]);
  assert.equal(ctx.tried('cat'), true);
  assert.equal(ctx.tried('cat', r => r.args.includes('readme.txt')), true);
  assert.equal(ctx.tried('cat', r => r.args.includes('other')), false);
  assert.equal(ctx.ran('cat'), false);
});

test('flag finds a letter in short option clusters', () => {
  const ctx = context([]);
  const r = record('ls', ['-la', 'forest']);
  assert.equal(ctx.flag(r, 'l'), true);
  assert.equal(ctx.flag(r, 'a'), true);
  assert.equal(ctx.flag(r, 'R'), false);
  assert.equal(ctx.flag(record('ls', ['forest', '-a']), 'a'), true);
});

test('flag ignores long options, a lone dash and anything after --', () => {
  const ctx = context([]);
  assert.equal(ctx.flag(record('ls', ['--all']), 'a'), false);
  assert.equal(ctx.flag(record('cat', ['-']), 'a'), false);
  assert.equal(ctx.flag(record('rm', ['--', '-a']), 'a'), false);
});

test('paths resolves operands against the record cwd, skipping options', () => {
  const ctx = context([]);
  const r = record('ls', ['-l', 'cave', '../readme.txt', '/etc/'], { cwd: `${HOME}/forest` });
  assert.deepEqual(ctx.paths(r), [`${HOME}/forest/cave`, `${HOME}/readme.txt`, '/etc']);
});

test('paths expands a leading tilde to home and normalizes dots and slashes', () => {
  const ctx = context([]);
  const r = record('cd', ['~', '~/forest//cave/.', '/..', 'forest/../.'], { cwd: HOME });
  assert.deepEqual(ctx.paths(r), [HOME, `${HOME}/forest/cave`, '/', HOME]);
});

test('paths treats everything after -- as an operand and never a lone dash', () => {
  const ctx = context([]);
  assert.deepEqual(ctx.paths(record('rm', ['--', '-odd'])), [`${HOME}/-odd`]);
  assert.deepEqual(ctx.paths(record('cd', ['-'])), []);
});

test('hasPath is true when an operand resolves to the absolute path', () => {
  const ctx = context([]);
  const r = record('cat', ['./readme.txt'], { cwd: HOME });
  assert.equal(ctx.hasPath(r, `${HOME}/readme.txt`), true);
  assert.equal(ctx.hasPath(record('cat', ['readme.txt'], { cwd: '/tmp' }), `${HOME}/readme.txt`), false);
});

test('read is true when a reading command succeeded on the file', () => {
  for (const name of ['cat', 'less', 'more', 'head', 'tail']) {
    assert.equal(context([record(name, ['readme.txt'])]).read(`${HOME}/readme.txt`), true, name);
  }
});

test('read accepts the file as an input redirection', () => {
  const r = record('cat', [], { redirects: [{ op: '<', target: `${HOME}/readme.txt` }] });
  assert.equal(context([r]).read(`${HOME}/readme.txt`), true);
});

test('read is false for a failed read, another file or a command that does not read', () => {
  assert.equal(context([record('cat', ['readme.txt'], { status: 1 })]).read(`${HOME}/readme.txt`), false);
  assert.equal(context([record('cat', ['other.txt'])]).read(`${HOME}/readme.txt`), false);
  assert.equal(context([record('ls', ['readme.txt'])]).read(`${HOME}/readme.txt`), false);
  assert.equal(context([record('cat', [], { redirects: [{ op: '>', target: `${HOME}/readme.txt` }] })]).read(`${HOME}/readme.txt`), false);
});
