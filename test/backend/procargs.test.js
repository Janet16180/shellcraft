import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VALUE_OPTIONS, scanOptions, splitOption } from '../../src/backend/procargs.js';

const scan = (command, args) => {
  const seen = [];
  const r = scanOptions(args, VALUE_OPTIONS[command], (word, value) => seen.push([word, value]));
  return { ...r, seen };
};

test('options that take a value consume the next argument', () => {
  assert.deepEqual(scan('pkill', ['-u', 'hero', '-x', 'sleep']), { operands: ['sleep'], missing: null, seen: [['-u', 'hero'], ['-x', null]] });
  assert.deepEqual(scan('killall', ['-s', 'KILL', 'sleep']).seen, [['-s', 'KILL']]);
  assert.deepEqual(scan('pgrep', ['--terminal', 'pts/0']).seen, [['--terminal', 'pts/0']]);
});

test('-- ends the options and a missing value is reported', () => {
  assert.deepEqual(scan('pkill', ['-x', '--', '-u']).operands, ['-u']);
  assert.equal(scan('pkill', ['-u']).missing, '-u');
});

test('an option word splits into flags and the value its last value letter takes', () => {
  const grammar = VALUE_OPTIONS.pkill;
  assert.deepEqual(splitOption('-xu', 'hero', grammar), [['-x', null], ['-u', 'hero']]);
  assert.deepEqual(splitOption('-uhero', null, grammar), [['-u', 'hero']]);
  assert.deepEqual(splitOption('-xi', null, grammar), [['-x', null], ['-i', null]]);
  assert.deepEqual(splitOption('--euid=root', null, grammar), [['--euid', 'root']]);
  assert.deepEqual(splitOption('--euid', 'hero', grammar), [['--euid', 'hero']]);
});
