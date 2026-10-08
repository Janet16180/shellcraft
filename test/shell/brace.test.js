import { test } from 'node:test';
import assert from 'node:assert/strict';
import { braceExpand } from '../../src/shell/brace.js';

test('a comma list expands with its prefix and suffix', () => {
  assert.deepEqual(braceExpand('{a,b}'), ['a', 'b']);
  assert.deepEqual(braceExpand('mirror{1,2,3}.txt'), ['mirror1.txt', 'mirror2.txt', 'mirror3.txt']);
  assert.deepEqual(braceExpand('x{,a}'), ['x', 'xa']);
  assert.deepEqual(braceExpand('{,}'), ['', '']);
});

test('lists nest, and several lists multiply left to right', () => {
  assert.deepEqual(braceExpand('{a,{b,c}d}'), ['a', 'bd', 'cd']);
  assert.deepEqual(braceExpand('{1..3}{x,y}'), ['1x', '1y', '2x', '2y', '3x', '3y']);
});

test('sequences count up or down, by a step, with zero padding, or over letters', () => {
  assert.deepEqual(braceExpand('{1..3}'), ['1', '2', '3']);
  assert.deepEqual(braceExpand('{3..1}'), ['3', '2', '1']);
  assert.deepEqual(braceExpand('{1..10..3}'), ['1', '4', '7', '10']);
  assert.deepEqual(braceExpand('{5..1..2}'), ['5', '3', '1']);
  assert.deepEqual(braceExpand('{1..5..-2}'), ['1', '3', '5']);
  assert.deepEqual(braceExpand('{1..2..0}'), ['1', '2']);
  assert.deepEqual(braceExpand('{-1..2}'), ['-1', '0', '1', '2']);
  assert.deepEqual(braceExpand('{08..10}'), ['08', '09', '10']);
  assert.deepEqual(braceExpand('{-02..1}'), ['-02', '-01', '000', '001']);
  assert.deepEqual(braceExpand('{a..e..2}'), ['a', 'c', 'e']);
  assert.deepEqual(braceExpand('{Z..b}'), ['Z', '\\[', "''", '\\]', '\\^', '_', '\\`', 'a', 'b']);
});

test('braces without a comma or a valid sequence stay as they are', () => {
  for (const w of ['{a}', '{}', '{a..3}', '{a,b', 'a{b}c']) assert.deepEqual(braceExpand(w), [w]);
  assert.deepEqual(braceExpand('a{b}c{d,e}'), ['a{b}cd', 'a{b}ce']);
  assert.deepEqual(braceExpand('{{a,b}'), ['{a', '{b']);
  assert.deepEqual(braceExpand('{x{a,b}y}'), ['{xay}', '{xby}']);
});

test('quoted, escaped and substituted braces and commas are not special', () => {
  for (const w of ['"{a,b}"', "'{a,b}'", '\\{a,b}', '{a\\,b}', '${HOME}', '$(echo {a,b})']) assert.deepEqual(braceExpand(w), [w]);
  assert.deepEqual(braceExpand('{"a b",c}'), ['"a b"', 'c']);
  assert.deepEqual(braceExpand('{${HOME},b}'), ['${HOME}', 'b']);
  assert.deepEqual(braceExpand('{a,b}$(echo {c,d})'), ['a$(echo {c,d})', 'b$(echo {c,d})']);
});
