import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteWord, commandForPick, commandForPath } from '../../src/ui/picks.js';

test('plain names need no quotes', () => {
  assert.equal(quoteWord('readme.txt'), 'readme.txt');
  assert.equal(quoteWord('/home/hero/forest'), '/home/hero/forest');
});

test('names with spaces or shell characters are single-quoted', () => {
  assert.equal(quoteWord('old map.txt'), "'old map.txt'");
  assert.equal(quoteWord('a*b'), "'a*b'");
});

test('a single quote inside a name is closed, escaped and reopened', () => {
  assert.equal(quoteWord("hero's log"), "'hero'\\''s log'");
});

test('a name starting with a dash gets ./ so it is not read as an option', () => {
  assert.equal(quoteWord('-v'), './-v');
});

test('a door becomes cd with the relative name', () => {
  assert.equal(commandForPick({ kind: 'door', name: 'forest', path: '/home/hero/forest' }), 'cd forest');
});

test('the exit becomes cd ..', () => {
  assert.equal(commandForPick({ kind: 'exit', name: '..', path: '/home' }), 'cd ..');
});

test('an item becomes cat with the relative name', () => {
  assert.equal(commandForPick({ kind: 'item', name: 'old map.txt', path: '/home/hero/old map.txt' }), "cat 'old map.txt'");
});

test('an unknown pick kind is a bug and raises', () => {
  assert.throws(() => commandForPick({ kind: 'chest', name: 'x', path: '/x' }), /pick kind/);
});

test('a breadcrumb becomes cd with the absolute path', () => {
  assert.equal(commandForPath('/home/hero'), 'cd /home/hero');
});
