import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { put, file, dir, symlink, link } from '../../../src/backend/spec.js';

const status = async (b, line) => (await run(b, line)).status;
const both = async (b, line) => { const r = await run(b, line); return [r.err, r.status]; };

test('test checks files: exists, kind, permissions and size', async () => {
  const b = await shell([
    put('/home/hero/empty', file('', { owner: 'hero' })),
    put('/home/hero/full', file('x\n', { owner: 'hero', mode: 0o700 })),
    put('/home/hero/sealed', file('x\n', { owner: 'root', mode: 0o600 })),
    put('/home/hero/box', dir({}, { owner: 'hero' })),
  ]);
  const cases = [
    ['test -e full', 0], ['test -e nope', 1], ['test -e ""', 1], ['test -f full', 0], ['test -f box', 1],
    ['test -d box', 0], ['test -d full', 1], ['test -r full', 0], ['test -r sealed', 1], ['test -w full', 0],
    ['test -w sealed', 1], ['test -x full', 0], ['test -x empty', 1], ['test -x box', 0], ['test -s full', 0],
    ['test -s empty', 1], ['test -s box', 0], ['test -e nope/x', 1], ['test -L full', 1],
  ];
  for (const [line, want] of cases) assert.equal(await status(b, line), want, line);
});

test('test compares strings and integers', async () => {
  const b = await shell();
  const cases = [
    ['test -z ""', 0], ['test -z a', 1], ['test -n a', 0], ['test -n ""', 1], ['test a = a', 0], ['test a == b', 1],
    ['test a != b', 0], ['test 2 -eq 2', 0], ['test 2 -ne 2', 1], ['test 1 -lt 2', 0], ['test 2 -le 2', 0],
    ['test 3 -gt 2', 0], ['test 2 -ge 3', 1], ['test -5 -lt +3', 0], ['test " 5 " -eq 5', 0], ['test a "<" b', 0],
  ];
  for (const [line, want] of cases) assert.equal(await status(b, line), want, line);
});

test('test follows the rules for each number of arguments, and ! negates', async () => {
  const b = await shell();
  const cases = [
    ['test', 1], ['test ""', 1], ['test x', 0], ['test -n', 0], ['test !', 0], ['test ! x', 1], ['test ! ""', 0],
    ['test ! -e nope', 0], ['test ! a = b', 0], ['test ! ! x', 0], ['test a -a b', 0], ['test "" -o b', 0],
    ['test -v HOME', 0], ['test -v NOPE', 1], ['test -R HOME', 1], ['test "(" a ")"', 0], ['test 1 -lt 2 -a 3 -lt 4', 0], ['test 1 -lt 2 -a 3 -gt 4', 1], ['test -o x', 1],
  ];
  for (const [line, want] of cases) assert.equal(await status(b, line), want, line);
});

test('test reports what bash reports, with status 2', async () => {
  const b = await shell();
  const cases = [
    ['test -q x', 'bash: test: -q: unary operator expected\n'],
    ['test a b', 'bash: test: a: unary operator expected\n'],
    ['test a b c', 'bash: test: b: binary operator expected\n'],
    ['test 1 -eq', 'bash: test: 1: unary operator expected\n'],
    ['test a -eq 1', 'bash: test: a: integer expression expected\n'],
    ['test "" -eq 1', 'bash: test: : integer expression expected\n'],
    ['test 99999999999999999999 -gt 1', 'bash: test: 99999999999999999999: integer expression expected\n'],
    ['test a = b = c', 'bash: test: too many arguments\n'],
    ['test a b c d e', 'bash: test: too many arguments\n'],
    ['[ a', "bash: [: missing `]'\n"],
    ['[ 1 -eq x ]', 'bash: [: x: integer expression expected\n'],
  ];
  for (const [line, err] of cases) assert.deepEqual(await both(b, line), [err, 2], line);
});

test('[ needs a closing ] and then works like test', async () => {
  const b = await shell([put('/home/hero/box', dir({}, { owner: 'hero' }))]);
  assert.equal(await status(b, '[ -d box ]'), 0);
  assert.equal(await status(b, '[ ! ]'), 0);
  assert.equal(await status(b, '[ ]'), 1);
  assert.equal((await run(b, 'if [ -d box ]; then echo dir; fi')).out, 'dir\n');
  assert.equal((await run(b, 'type test [')).out, 'test is a shell builtin\n[ is a shell builtin\n');
});

test('test -L and -h see a link itself; the other tests look where it leads', async () => {
  const b = await shell([
    put('/home/hero/portal', symlink('forest', { owner: 'hero' })),
    put('/home/hero/broken', symlink('nowhere', { owner: 'hero' })),
    put('/home/hero/copy', link('/home/hero/readme.txt')),
  ]);
  assert.equal(await status(b, 'test -L portal'), 0);
  assert.equal(await status(b, '[ -h broken ]'), 0);
  assert.equal(await status(b, 'test -L readme.txt'), 1);
  assert.equal(await status(b, 'test -L nope'), 1);
  assert.equal(await status(b, 'test -e broken'), 1);
  assert.equal(await status(b, 'test -d portal'), 0);
  assert.equal(await status(b, 'test -f copy'), 0);
  assert.equal(await status(b, 'test copy -ef readme.txt'), 0);
  assert.equal(await status(b, 'test portal -ef forest'), 0);
});
