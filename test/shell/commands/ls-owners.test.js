import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, guild } from '../helpers.js';
import { put, dir, file } from '../../../src/backend/spec.js';

const outcome = r => [r.out, r.err, r.status];
const mine = { owner: 'hero' };

const hall = () => shell([...guild(), put('/home/hero/hall', dir({
  'mine.txt': file('mine\n', mine),
  'miras.txt': file('forged\n', { owner: 'mira', group: 'smiths', mode: 0o640 }),
  'orphan.txt': file('lost\n', { owner: '1234', group: '4321' }),
  ronly: dir({ a: file('a\n', mine), sub: dir({}, mine) }, { owner: 'hero', mode: 0o444 }),
}, mine))]);

test('ls -l shows names left-aligned and unknown ids as numbers right-aligned', async () => {
  const r = await run(await hall(), 'ls -l hall/mine.txt hall/miras.txt hall/orphan.txt');
  assert.equal(r.out, [
    '-rw-r--r-- 1 hero hero   5 Oct  6 10:00 hall/mine.txt\n',
    '-rw-r----- 1 mira smiths 7 Oct  6 10:00 hall/miras.txt\n',
    '-rw-r--r-- 1 1234   4321 5 Oct  6 10:00 hall/orphan.txt\n',
  ].join(''));
});

test('ls -n shows ids; -g leaves out the owner, -o the group, -G the group', async () => {
  const b = await hall();
  assert.equal((await run(b, 'ls -n hall/miras.txt hall/orphan.txt')).out,
    '-rw-r----- 1 1001 1001 7 Oct  6 10:00 hall/miras.txt\n-rw-r--r-- 1 1234 4321 5 Oct  6 10:00 hall/orphan.txt\n');
  assert.equal((await run(b, 'ls -g hall/miras.txt')).out, '-rw-r----- 1 smiths 7 Oct  6 10:00 hall/miras.txt\n');
  assert.equal((await run(b, 'ls -o hall/miras.txt')).out, '-rw-r----- 1 mira 7 Oct  6 10:00 hall/miras.txt\n');
  assert.equal((await run(b, 'ls -lG hall/miras.txt')).out, '-rw-r----- 1 mira 7 Oct  6 10:00 hall/miras.txt\n');
  assert.equal((await run(b, 'ls -l --no-group hall/miras.txt')).out, '-rw-r----- 1 mira 7 Oct  6 10:00 hall/miras.txt\n');
  assert.equal((await run(b, 'ls --numeric-uid-gid hall/miras.txt')).out, '-rw-r----- 1 1001 1001 7 Oct  6 10:00 hall/miras.txt\n');
  assert.equal((await run(b, 'ls -go hall/miras.txt')).out, '-rw-r----- 1 7 Oct  6 10:00 hall/miras.txt\n');
});

test('a directory with r but no x lists its names, but not their details', async () => {
  const b = await hall();
  assert.deepEqual(outcome(await run(b, 'ls hall/ronly')), ['a  sub\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'ls -a hall/ronly')), ['.  ..  a  sub\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'ls -l hall/ronly')), [
    'total 0\n-????????? ? ? ? ?            ? a\nd????????? ? ? ? ?            ? sub\n',
    "ls: cannot access 'hall/ronly/a': Permission denied\nls: cannot access 'hall/ronly/sub': Permission denied\n", 1]);
  assert.deepEqual(outcome(await run(b, 'ls -F hall/ronly')), ['a  sub/\n', "ls: cannot access 'hall/ronly/a': Permission denied\n", 1]);
  assert.deepEqual(outcome(await run(b, 'ls -ld hall/ronly')), ['dr--r--r-- 3 hero hero 4096 Oct  6 10:00 hall/ronly\n', '', 0]);
});
