import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dir, file } from '../../src/backend/spec.js';
import { makeContext } from '../../src/game/checks.js';
import { worldEffects, lineEffects, dangers } from '../../src/game/effects.js';
import { HOME, observation, record, sampleTree } from '../helpers/records.js';

const SHELL = { pid: 733, ppid: 1, user: 'hero', tty: 'pts/0', stat: 'Ss', cpu: 0, mem: 0.1, cmd: '-bash', key: 'shell' };

const withHome = changes => {
  const tree = sampleTree();
  changes(tree.children.home.children.hero.children);
  return tree;
};

const context = (commands, after = {}, before = {}) =>
  makeContext({ commands, before: observation(before), obs: observation(after) });

const kinds = effects => effects.map(e => e.kind);

test('a change of directory is a travel from the old cwd to the new one', () => {
  const effects = worldEffects(observation(), observation({ cwd: `${HOME}/forest` }));
  assert.deepEqual(effects, [{ kind: 'travel', from: HOME, to: `${HOME}/forest` }]);
});

test('a new file or directory is created, with its type', () => {
  const after = observation({ tree: withHome(h => { h.camp = dir({ 'tent.txt': file() }); h['note.txt'] = file('x'); }) });
  assert.deepEqual(worldEffects(observation(), after), [
    { kind: 'created', path: `${HOME}/camp`, type: 'dir' },
    { kind: 'created', path: `${HOME}/note.txt`, type: 'file' },
  ]);
});

test('a removed directory is reported once, not once per child', () => {
  const after = observation({ tree: withHome(h => { delete h.forest; }) });
  assert.deepEqual(worldEffects(observation(), after), [{ kind: 'removed', path: `${HOME}/forest`, type: 'dir' }]);
});

test('a file replaced by a directory is removed and created', () => {
  const after = observation({ tree: withHome(h => { h['readme.txt'] = dir(); }) });
  assert.deepEqual(worldEffects(observation(), after), [
    { kind: 'removed', path: `${HOME}/readme.txt`, type: 'file' },
    { kind: 'created', path: `${HOME}/readme.txt`, type: 'dir' },
  ]);
});

test('changing a file content creates no effect', () => {
  const after = observation({ tree: withHome(h => { h['readme.txt'] = file('changed\n'); }) });
  assert.deepEqual(worldEffects(observation(), after), []);
});

test('ls -a and ls -A reveal the hidden files of the listed directory or the cwd', () => {
  assert.deepEqual(lineEffects(context([record('ls', ['-a'])]), []), [{ kind: 'reveal', path: HOME }]);
  assert.deepEqual(lineEffects(context([record('ls', ['-lA', 'forest'])]), []), [{ kind: 'reveal', path: `${HOME}/forest` }]);
  assert.deepEqual(lineEffects(context([record('ls', ['--all', '/etc'])]), []), [{ kind: 'reveal', path: '/etc' }]);
});

test('a plain ls, ls -d, a failed ls or a file operand reveals nothing', () => {
  const lines = [
    [record('ls', ['-l'])],
    [record('ls', ['-ad', 'forest'])],
    [record('ls', ['-a', 'nowhere'], { status: 2 })],
    [record('ls', ['-a', 'readme.txt'])],
  ];
  for (const commands of lines) assert.deepEqual(lineEffects(context(commands), []), [], commands[0].args.join(' '));
});

test('a directory revealed twice in one line is reported once', () => {
  const effects = lineEffects(context([record('ls', ['-a']), record('ls', ['-a', '.'])]), []);
  assert.deepEqual(effects, [{ kind: 'reveal', path: HOME }]);
});

test('a command that was not found is an unknown-command', () => {
  assert.deepEqual(lineEffects(context([record('sl', [], { status: 127 })]), []), [{ kind: 'unknown-command', name: 'sl' }]);
});

test('each refusal by the guard is a guardian effect', () => {
  assert.deepEqual(lineEffects(context([]), ['no', 'never']), [{ kind: 'guardian', reason: 'no' }, { kind: 'guardian', reason: 'never' }]);
});

test('line effects include the world changes before the per-command ones', () => {
  const ctx = context([record('cd', ['forest']), record('ls', ['-a'], { cwd: `${HOME}/forest` })], { cwd: `${HOME}/forest` });
  assert.deepEqual(kinds(lineEffects(ctx, ['x'])), ['travel', 'reveal', 'guardian']);
});

test('rm -r of the root or of home is dangerous however it is written', () => {
  const lines = [
    record('rm', ['-rf', '/']),
    record('rm', ['-R', '//']),
    record('rm', ['--recursive', '~']),
    record('rm', ['-r', HOME]),
    record('rm', ['-r', '~/']),
  ];
  for (const r of lines) assert.equal(dangers(context([r])).length, 1, r.args.join(' '));
});

test('rm -r of anything else, or rm without -r, is not dangerous', () => {
  const lines = [record('rm', ['-r', 'forest']), record('rm', ['/']), record('rm', ['-f', HOME]), record('ls', ['-r', '/'])];
  for (const r of lines) assert.deepEqual(dangers(context([r])), [], `${r.name} ${r.args.join(' ')}`);
});

test('rm -r of . or .. is not dangerous because rm refuses those names', () => {
  const lines = [record('rm', ['-r', '.']), record('rm', ['-fr', '..'], { cwd: `${HOME}/forest` }), record('rm', ['-r', `${HOME}/.`])];
  for (const r of lines) assert.deepEqual(dangers(context([r])), [], `${r.name} ${r.args.join(' ')}`);
});

test('kill -9 of the player shell is dangerous however the signal is written', () => {
  const before = { procs: [SHELL] };
  const lines = [['-9', '733'], ['-KILL', '733'], ['-SIGKILL', '733'], ['-s', 'KILL', '733'], ['-s', '9', '733'], ['-n', 'sigkill', '733']];
  for (const args of lines) assert.equal(dangers(context([record('kill', args)], {}, before)).length, 1, args.join(' '));
});

test('a polite kill of the shell or kill -9 of another process is not dangerous', () => {
  const before = { procs: [SHELL] };
  const lines = [['733'], ['-15', '733'], ['-9', '4242'], ['-s', 'TERM', '733']];
  for (const args of lines) assert.deepEqual(dangers(context([record('kill', args)], {}, before)), [], args.join(' '));
});

test('a dangerous attempt counts even when the command failed', () => {
  assert.equal(dangers(context([record('rm', ['-rf', '/'], { status: 1 })])).length, 1);
});

test('each dangerous command in a line gives one reason', () => {
  const line = [record('rm', ['-rf', '/']), record('kill', ['-9', '733'])];
  assert.equal(dangers(context(line, {}, { procs: [SHELL] })).length, 2);
});
