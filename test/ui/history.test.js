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
