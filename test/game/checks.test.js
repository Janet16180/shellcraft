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

test('the context carries the Tab completions since the previous line, none by default', () => {
  const completions = [{ line: 'cd fo', completed: 'cd forest/' }];
  assert.deepEqual(makeContext({ commands: [], before: observation(), obs: observation(), completions }).completions, completions);
  assert.deepEqual(context([]).completions, []);
});

test('the context carries the text of the line as typed, empty by default', () => {
  const before = observation();
  assert.equal(makeContext({ commands: [], before, obs: before, line: 'wish=gold' }).line, 'wish=gold');
  assert.equal(makeContext({ commands: [], before, obs: before }).line, '');
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

test('flag reads the long options players type as their short letter, per command', () => {
  const ctx = context([]);
  assert.equal(ctx.flag(record('ls', ['--all']), 'a'), true);
  assert.equal(ctx.flag(record('grep', ['--ignore-case', 'x']), 'i'), true);
  assert.equal(ctx.flag(record('grep', ['--recursive', 'x']), 'r'), true);
  assert.equal(ctx.flag(record('tail', ['--lines=3', 'f']), 'n'), true);
  assert.equal(ctx.flag(record('wc', ['--lines']), 'l'), true);
  assert.equal(ctx.flag(record('rm', ['--recursive', 'd']), 'r'), true);
  assert.equal(ctx.flag(record('cat', ['--all']), 'a'), false, 'only the command\'s own long options');
  assert.equal(ctx.flag(record('ls', ['--', '--all']), 'a'), false);
});

test('flag ignores unknown long options, a lone dash and anything after --', () => {
  const ctx = context([]);
  assert.equal(ctx.flag(record('ls', ['--color']), 'c'), false);
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

test('piped lists the files a cat stage just before the command fed it, through chains of cat', () => {
  const stage = (name, args, n, fields = {}) => record(name, args, { pipeline: 0, stage: n, stages: 3, ...fields });
  const cat = stage('cat', ['ledger.txt'], 0);
  const sort = stage('sort', [], 1);
  const uniq = stage('uniq', [], 2);
  const ctx = context([cat, sort, uniq]);
  assert.deepEqual(ctx.piped(sort), [`${HOME}/ledger.txt`]);
  assert.deepEqual(ctx.piped(uniq), []);
  assert.deepEqual(ctx.piped(cat), []);
  const chain = [stage('cat', ['a.txt'], 0), stage('cat', [], 1), stage('grep', ['x'], 2)];
  assert.deepEqual(context(chain).piped(chain[2]), [`${HOME}/a.txt`]);
  const failed = [stage('cat', ['a.txt'], 0, { status: 1 }), stage('grep', ['x'], 1)];
  assert.deepEqual(context(failed).piped(failed[1]), []);
  const redirected = [stage('cat', [], 0, { redirects: [{ op: '<', target: `${HOME}/a.txt` }] }), stage('grep', ['x'], 1)];
  assert.deepEqual(context(redirected).piped(redirected[1]), [`${HOME}/a.txt`]);
  const numbered = [stage('cat', ['-n', 'a.txt'], 0), stage('grep', ['x'], 1)];
  assert.deepEqual(context(numbered).piped(numbered[1]), [], 'cat -n changes the lines');
});

test('hasPath counts a file sent in with < or a piped cat, only for commands that read their input', () => {
  const stage = (name, args, n, fields = {}) => record(name, args, { pipeline: 0, stage: n, stages: 2, ...fields });
  const file = `${HOME}/a.txt`;
  assert.equal(context([]).hasPath(record('grep', ['x'], { redirects: [{ op: '<', target: file }] }), file), true);
  const line = [stage('cat', ['a.txt'], 0), stage('tail', ['-n', '3'], 1)];
  assert.equal(context(line).hasPath(line[1], file), true);
  const ignored = [stage('cat', ['a.txt'], 0), stage('ls', [], 1)];
  assert.equal(context(ignored).hasPath(ignored[1], file), false);
});

test('read counts a reader that failed on another file after printing this one whole', () => {
  const r = record('cat', ['readme.txt', 'forest'], { status: 1, stdout: 'Hello\n' });
  const tree = { type: 'dir', children: { home: { type: 'dir', children: { hero: { type: 'dir', children: { 'readme.txt': { type: 'file', content: 'Hello\n' } } } } } } };
  assert.equal(context([r], { tree }).read(`${HOME}/readme.txt`), true);
  assert.equal(context([record('cat', ['readme.txt'], { status: 1, stdout: '' })], { tree }).read(`${HOME}/readme.txt`), false);
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

test('streams follows redirections in typed order, null meaning the screen', () => {
  const at = redirects => context([]).streams(record('ls', [], { redirects }));
  const F = `${HOME}/f`;
  assert.deepEqual(at([]), { out: null, err: null });
  assert.deepEqual(at([{ op: '>', target: F }]), { out: F, err: null });
  assert.deepEqual(at([{ op: '2>>', target: F }]), { out: null, err: F });
  assert.deepEqual(at([{ op: '&>', target: F }]), { out: F, err: F });
  assert.deepEqual(at([{ op: '>', target: F }, { op: '2>&', target: '1' }]), { out: F, err: F });
  assert.deepEqual(at([{ op: '2>&', target: '1' }, { op: '>', target: F }]), { out: F, err: null });
  assert.deepEqual(at([{ op: '2>', target: F }, { op: '>&', target: '2' }]), { out: F, err: F });
  assert.deepEqual(at([{ op: '<', target: F }]), { out: null, err: null });
});

test('onScreen is the last stage with its output not sent elsewhere', () => {
  const ctx = context([]);
  assert.equal(ctx.onScreen(record('echo', [], { redirects: [{ op: '2>&', target: '1' }] })), true);
  assert.equal(ctx.onScreen(record('echo', [], { redirects: [{ op: '>', target: `${HOME}/f` }] })), false);
  assert.equal(ctx.onScreen(record('echo', [], { stage: 0, stages: 2 })), false);
});
