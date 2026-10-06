import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, mapLongOptions } from '../../src/shell/options.js';

test('bundled short flags split and operands stay in order', () => {
  const o = parseOptions('ls', ['-la', 'x', '-F', 'y'], 'laF');
  assert.deepEqual([...o.flags], ['l', 'a', 'F']);
  assert.deepEqual(o.rest, ['x', 'y']);
  assert.equal(o.err, null);
});

test('an option value can be attached or separate', () => {
  assert.equal(parseOptions('head', ['-n5'], '', 'n').vals.n, '5');
  assert.equal(parseOptions('head', ['-n', '5', 'f'], '', 'n').vals.n, '5');
  assert.deepEqual(parseOptions('head', ['-n', '5', 'f'], '', 'n').rest, ['f']);
});

test('-- ends options and a lone - is an operand', () => {
  assert.deepEqual(parseOptions('rm', ['--', '-x', '-'], 'r').rest, ['-x', '-']);
});

test('an unknown flag or a missing value gives the coreutils message', () => {
  assert.equal(parseOptions('ls', ['-z'], 'la').err, "ls: invalid option -- 'z'\nTry 'ls --help' for more information.");
  assert.equal(parseOptions('head', ['-n'], '', 'n').err, "head: option requires an argument -- 'n'\nTry 'head --help' for more information.");
});

test('every value of a repeated option is kept in order', () => {
  const o = parseOptions('grep', ['-e', 'a', '-eb'], '', 'e');
  assert.deepEqual(o.lists.e, ['a', 'b']);
  assert.equal(o.vals.e, 'b');
});

test('long options map to letters before -- only, and unknown ones are reported', () => {
  const table = { '--all': 'a' };
  assert.deepEqual(mapLongOptions('ls', ['--all', '--color=auto', '--', '--all'], table), { args: ['-a', '--', '--all'], err: null });
  assert.equal(mapLongOptions('ls', ['--nope'], table).err, "ls: unrecognized option '--nope'\nTry 'ls --help' for more information.");
});
