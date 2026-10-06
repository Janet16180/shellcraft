import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shellQuote, needsQuoting, localeQuote } from '../../src/shell/quote.js';

test('plain names need no quoting', () => {
  for (const name of ['readme.txt', 'Zebra', '_under', '10.txt', 'a-b', 'x,y:z%', 'café']) assert.equal(needsQuoting(name), false, name);
  assert.equal(shellQuote('readme.txt'), 'readme.txt');
});

test('names with shell special characters are single-quoted', () => {
  assert.equal(shellQuote('my notes.txt'), "'my notes.txt'");
  assert.equal(shellQuote('a$b'), "'a$b'");
  assert.equal(shellQuote('a*'), "'a*'");
  assert.equal(shellQuote('back\\slash'), "'back\\slash'");
});

test('# and ~ need quoting only at the start; braces only alone', () => {
  assert.equal(shellQuote('#tag'), "'#tag'");
  assert.equal(shellQuote('a#b'), 'a#b');
  assert.equal(shellQuote('~x'), "'~x'");
  assert.equal(shellQuote('{'), "'{'");
  assert.equal(shellQuote('{a}'), '{a}');
});

test('an apostrophe uses double quotes when nothing else is special', () => {
  assert.equal(shellQuote("it's"), '"it\'s"');
  assert.equal(shellQuote("it's here"), '"it\'s here"');
  assert.equal(shellQuote("it's$"), "'it'\\''s$'");
});

test('control characters use $\'...\' escapes', () => {
  assert.equal(shellQuote('tab\tx'), "'tab'$'\\t''x'");
  assert.equal(shellQuote('a\nb'), "'a'$'\\n''b'");
});

test('always-quoting quotes even plain names', () => {
  assert.equal(shellQuote('nope', { always: true }), "'nope'");
  assert.equal(shellQuote("it's", { always: true }), '"it\'s"');
});

test('locale quotes are curly in C.UTF-8', () => {
  assert.equal(localeQuote('now'), '‘now’');
});
