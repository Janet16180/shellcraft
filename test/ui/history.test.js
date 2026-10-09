import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../src/ui/history.js';

test('Up recalls lines from the newest to the oldest and stops at the oldest', () => {
  const history = createHistory();
  history.push('ls');
  history.push('pwd');
  assert.equal(history.up(''), 'pwd');
  assert.equal(history.up('pwd'), 'ls');
  assert.equal(history.up('ls'), 'ls');
});

test('Down walks forward again and ends on the line being typed before Up', () => {
  const history = createHistory();
  history.push('ls');
  history.push('pwd');
  history.up('cat re');
  history.up('pwd');
  assert.equal(history.down(), 'pwd');
  assert.equal(history.down(), 'cat re');
  assert.equal(history.down(), 'cat re');
});

test('with no history Up keeps the current line', () => {
  assert.equal(createHistory().up('wh'), 'wh');
});

test('blank lines, lines starting with a space and repeats are not saved, as with HISTCONTROL=ignoreboth', () => {
  const history = createHistory();
  history.push('ls');
  history.push('ls');
  history.push('   ');
  history.push(' secret');
  assert.equal(history.up(''), 'ls');
  assert.equal(history.up('ls'), 'ls');
  assert.equal(history.down(), '');
});

test('pushing a line resets the position to the newest entry', () => {
  const history = createHistory();
  history.push('a');
  history.push('b');
  history.up('');
  history.up('b');
  history.push('c');
  assert.equal(history.up(''), 'c');
});

test('entries lists the saved lines, oldest first, and changing the list does not change the history', () => {
  const history = createHistory();
  history.push('ls');
  history.push('pwd');
  const lines = history.entries();
  assert.deepEqual(lines, ['ls', 'pwd']);
  lines.push('rm');
  assert.deepEqual(history.entries(), ['ls', 'pwd']);
});

test('seek moves to an entry, so Up and Down go on from a line found by search', () => {
  const history = createHistory();
  for (const line of ['echo alpha', 'echo beta', 'ls alpha']) history.push(line);
  history.seek(2, 'typed');
  assert.equal(history.up('ls alpha'), 'echo beta');
  history.seek(1, 'typed');
  assert.equal(history.down(), 'ls alpha');
  assert.equal(history.down(), 'typed');
});

test('seek to the end of the history stands on the line being typed', () => {
  const history = createHistory();
  history.push('ls');
  history.seek(1, 'ca');
  assert.equal(history.down(), 'ca');
  assert.equal(history.up('ca'), 'ls');
});

test('seek outside the history is a bug and raises', () => {
  const history = createHistory();
  history.push('ls');
  assert.throws(() => history.seek(2, ''), /history index/);
  assert.throws(() => history.seek(-1, ''), /history index/);
});
