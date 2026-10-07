import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, mapLongOptions, optionFailure } from '../../src/shell/options.js';

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
  assert.deepEqual(mapLongOptions('ls', ['--all', '--color=auto', '--', '--all'], table), { args: ['-a', '--', '--all'], err: null, unsimulated: null });
  assert.equal(mapLongOptions('ls', ['--nope'], table).err, "ls: unrecognized option '--nope'\nTry 'ls --help' for more information.");
});

test('a real option the game does not simulate is named instead of rejected', () => {
  const short = parseOptions('ls', ['-la', '-R', 'x'], 'la');
  assert.deepEqual([short.err, short.unsimulated], [null, '-R']);
  assert.equal(parseOptions('cp', ['--sparse=always', 'a', 'b'], 'r').unsimulated, '--sparse');
  assert.equal(mapLongOptions('ls', ['--recursive'], { '--all': 'a' }).unsimulated, '--recursive');
  assert.equal(parseOptions('ls', ['-R'], 'la').rest.length, 0);
});

test('options of a command without a table of real options stay invalid', () => {
  assert.equal(parseOptions('nope', ['-R'], 'la').err, "nope: invalid option -- 'R'\nTry 'nope --help' for more information.");
});

test('optionFailure turns a stopped parse into the error or the note', () => {
  assert.equal(optionFailure('ls', parseOptions('ls', ['-a'], 'a'), 2), null);
  assert.deepEqual(optionFailure('ls', parseOptions('ls', ['-z'], 'a'), 2), {
    out: '', err: "ls: invalid option -- 'z'\nTry 'ls --help' for more information.", status: 2, html: null, note: null,
  });
  assert.deepEqual(optionFailure('ls', parseOptions('ls', ['-R'], 'a'), 2), {
    out: '', err: '', status: 2, html: null, note: 'ls -R is a real option, but this game does not simulate it.',
  });
});

test('a missing option value is reported and not recorded', () => {
  const o = parseOptions('grep', ['-e'], '', 'e');
  assert.equal(o.err, "grep: option requires an argument -- 'e'\nTry 'grep --help' for more information.");
  assert.deepEqual([o.vals, o.lists], [{}, {}]);
});
