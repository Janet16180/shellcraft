import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dir, file } from '../../src/backend/spec.js';
import { makeContext } from '../../src/game/checks.js';
import { worldEffects, lineEffects } from '../../src/game/effects.js';
import { HOME, observation, record, sampleTree } from '../helpers/records.js';

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
