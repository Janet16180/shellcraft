import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext } from '../../src/game/checks.js';
import { HOME, observation, record } from '../helpers/records.js';
import { symlink, file } from '../../src/backend/spec.js';
import { packTar, gzip } from '../../src/backend/archive.js';

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

test('the context keeps the keys as typed apart from the line that ran, the same line by default', () => {
  const before = observation();
  const ctx = makeContext({ commands: [], before, obs: before, line: 'sudo echo hi', typed: 'sudo !!' });
  assert.deepEqual([ctx.line, ctx.typed], ['sudo echo hi', 'sudo !!']);
  assert.equal(makeContext({ commands: [], before, obs: before, line: 'ls' }).typed, 'ls');
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

const linkedTree = () => {
  const tree = observation().tree;
  const hero = tree.children.home.children.hero.children;
  hero['readme.txt'].ino = 1847;
  hero.forest.children.cave.ino = 1900;
  Object.assign(hero, {
    'copy.txt': { ...hero['readme.txt'] },
    portal: { ...symlink('forest/cave', { owner: 'hero' }), ino: 1950 },
    broken: { ...symlink('nowhere', { owner: 'hero' }), ino: 1951 },
  });
  return tree;
};

test('inode gives the inode number a path leads to, so two names of one file compare equal', () => {
  const ctx = context([], { tree: linkedTree() });
  assert.equal(ctx.inode(`${HOME}/copy.txt`), ctx.inode(`${HOME}/readme.txt`));
  assert.equal(ctx.inode(`${HOME}/portal`), 1900);
  assert.equal(ctx.inode(`${HOME}/broken`), null);
  assert.equal(ctx.inode(`${HOME}/nothing`), null);
});

test('linkTarget gives a symbolic link\'s text as created, and null for anything else', () => {
  const ctx = context([], { tree: linkedTree() });
  assert.equal(ctx.linkTarget(`${HOME}/portal`), 'forest/cave');
  assert.equal(ctx.linkTarget(`${HOME}/broken`), 'nowhere');
  assert.equal(ctx.linkTarget(`${HOME}/readme.txt`), null);
  assert.equal(ctx.linkTarget(`${HOME}/nothing`), null);
});

test('node follows symbolic links like cat does', () => {
  const ctx = context([], { tree: linkedTree() });
  assert.equal(ctx.node(`${HOME}/portal`).type, 'dir');
  assert.equal(ctx.node(`${HOME}/broken`), null);
});

const job = (id, state, fields = {}) => ({ id, pid: 4000 + id, cmd: 'sleep 100', state, mark: '+', ...fields });

test('jobs lists the jobs after the line, and job finds one by number', () => {
  const ctx = context([], { jobs: [job(1, 'stopped')] });
  assert.deepEqual(ctx.jobs, [job(1, 'stopped')]);
  assert.equal(ctx.job(1).state, 'stopped');
  assert.equal(ctx.job(2), null);
});

test('pressed tells that the player pressed Ctrl+C or Ctrl+Z during a command, optionally a named one', () => {
  const ctx = context([record('sleep', ['100'], { status: 148, signal: 'TSTP' }), record('echo')]);
  assert.equal(ctx.pressed('TSTP'), true);
  assert.equal(ctx.pressed('TSTP', 'sleep'), true);
  assert.equal(ctx.pressed('TSTP', 'fg'), false);
  assert.equal(ctx.pressed('INT'), false);
});

test('pressed with anything but INT or TSTP is an authoring bug and raises', () => {
  assert.throws(() => context([]).pressed('ctrl-z'), /INT or TSTP/);
});

test('ended tells that a job ended on the line: its process went, or bash reported its end', () => {
  const before = { jobs: [job(1, 'running'), job(2, 'stopped'), job(3, 'running'), job(5, 'done'), job(6, 'done')] };
  const ctx = context([], { jobs: [job(1, 'done'), job(3, 'running'), job(6, 'done')] }, before);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(id => ctx.ended(id)), [true, true, false, false, true, false]);
});

test('ended does not count a new job that took the number of an old one', () => {
  const ctx = context([], { jobs: [job(1, 'running', { pid: 5000 })] }, { jobs: [job(1, 'running')] });
  assert.equal(ctx.ended(1), true);
  const same = context([], { jobs: [job(1, 'running')] }, { jobs: [job(1, 'running')] });
  assert.equal(same.ended(1), false);
});

const archiveTree = () => {
  const tree = observation().tree;
  const meta = { mode: 0o644, owner: 'hero', group: 'hero', mtime: 0 };
  const tar = packTar([
    { path: 'camp/', type: 'dir', ...meta, mode: 0o755 },
    { path: 'camp/notes.txt', type: 'file', ...meta, content: 'wood\n' },
    { path: 'camp/way', type: 'symlink', ...meta, mode: 0o777, target: 'notes.txt' },
  ]);
  Object.assign(tree.children.home.children.hero.children, {
    'camp.tar': file(tar, { owner: 'hero' }),
    'camp.tgz': file(gzip(tar), { owner: 'hero' }),
    'notes.txt.gz': file(gzip('wood\n', { name: 'notes.txt' }), { owner: 'hero' }),
    'link.tgz': symlink('camp.tgz', { owner: 'hero' }),
  });
  return tree;
};

test('archive lists the members of a tar archive, compressed or not, as tar -t names them', () => {
  const ctx = context([], { tree: archiveTree() });
  const members = ctx.archive(`${HOME}/camp.tgz`);
  assert.deepEqual(members.map(m => [m.path, m.type]), [['camp/', 'dir'], ['camp/notes.txt', 'file'], ['camp/way', 'symlink']]);
  assert.deepEqual([members[1].content, members[1].size, members[1].mode, members[2].target], ['wood\n', 5, 0o644, 'notes.txt']);
  assert.deepEqual(ctx.archive(`${HOME}/camp.tar`), members);
  assert.deepEqual(ctx.archive(`${HOME}/link.tgz`), members);
});

test('archive gives null for a file that is not a tar archive and for a missing path', () => {
  const ctx = context([], { tree: archiveTree() });
  assert.equal(ctx.archive(`${HOME}/readme.txt`), null);
  assert.equal(ctx.archive(`${HOME}/notes.txt.gz`), null);
  assert.equal(ctx.archive(`${HOME}/forest`), null);
  assert.equal(ctx.archive(`${HOME}/nothing.tar`), null);
});

test('gzipped gives the original text of gzip data, and null for anything else', () => {
  const ctx = context([], { tree: archiveTree() });
  assert.equal(ctx.gzipped(`${HOME}/notes.txt.gz`), 'wood\n');
  assert.equal(ctx.gzipped(`${HOME}/readme.txt`), null);
  assert.equal(ctx.gzipped(`${HOME}/nothing.gz`), null);
  assert.equal(typeof ctx.gzipped(`${HOME}/camp.tgz`), 'string');
});

test('flag reads tar\'s letters with or without a dash, and the long options of the archive commands', () => {
  const ctx = context([]);
  assert.equal(ctx.flag(record('tar', ['czf', 'a.tgz', 'box']), 'z'), true);
  assert.equal(ctx.flag(record('tar', ['czf', 'a.tgz', 'box']), 'x'), false);
  assert.equal(ctx.flag(record('tar', ['-xvzf', 'a.tgz']), 'x'), true);
  assert.equal(ctx.flag(record('tar', ['--extract', '--gzip', '--file=a.tgz']), 'z'), true);
  assert.equal(ctx.flag(record('tar', ['--list', '--file', 'a.tgz']), 't'), true);
  assert.equal(ctx.flag(record('gzip', ['--keep', 'a']), 'k'), true);
  assert.equal(ctx.flag(record('du', ['--summarize', '--human-readable', 'd']), 's'), true);
  assert.equal(ctx.flag(record('df', ['--human-readable']), 'h'), true);
});

test('paths leaves out tar\'s dashless letters', () => {
  const ctx = context([]);
  assert.deepEqual(ctx.paths(record('tar', ['czf', 'camp.tgz', 'camp'])), [`${HOME}/camp.tgz`, `${HOME}/camp`]);
  assert.deepEqual(ctx.paths(record('tar', ['-czf', 'camp.tgz', 'camp'])), [`${HOME}/camp.tgz`, `${HOME}/camp`]);
});

test('paths reads the archive and directory tar takes as option values, in their place', () => {
  const ctx = context([]);
  const paths = args => ctx.paths(record('tar', args));
  const [tgz, camp, out] = [`${HOME}/camp.tgz`, `${HOME}/camp`, `${HOME}/out`];
  assert.deepEqual(paths(['-t', '--file=camp.tgz']), [tgz]);
  assert.deepEqual(paths(['--list', '--file=camp.tgz']), [tgz]);
  assert.deepEqual(paths(['-tfcamp.tgz']), [tgz]);
  assert.deepEqual(paths(['-czfcamp.tgz', 'camp']), [tgz, camp]);
  assert.deepEqual(paths(['-xzf', 'camp.tgz', '-Cout']), [tgz, out]);
  assert.deepEqual(paths(['-xzf', 'camp.tgz', '-C', 'out']), [tgz, out]);
  assert.deepEqual(paths(['-xzf', 'camp.tgz', '--directory=out']), [tgz, out]);
  assert.deepEqual(paths(['xzf', 'camp.tgz', '-Cout']), [tgz, out]);
  assert.deepEqual(paths(['-c', '--file=camp.tgz', '--', '--file=x']), [tgz, `${HOME}/--file=x`]);
});

test('a value glued to tar\'s f or C is not read as option letters', () => {
  const ctx = context([]);
  assert.equal(ctx.flag(record('tar', ['-cfzt.tar', 'camp']), 'z'), false);
  assert.equal(ctx.flag(record('tar', ['-cfzt.tar', 'camp']), 'f'), true);
  assert.equal(ctx.flag(record('tar', ['-xfa.tar', '-Czz']), 'z'), false);
  assert.equal(ctx.flag(record('tar', ['-xfa.tar', '-Czz']), 'C'), true);
});
