import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, guild } from '../helpers.js';
import { put, file, login } from '../../../src/backend/spec.js';

const outcome = r => [r.out, r.err, r.status];

test('id prints the login groups with their numbers from /etc/group', async () => {
  const b = await shell(guild());
  assert.deepEqual(outcome(await run(b, 'id')), ['uid=1000(hero) gid=1000(hero) groups=1000(hero),1002(scribes)\n', '', 0]);
  assert.equal((await run(b, 'id -G')).out, '1000 1002\n');
  assert.equal((await run(b, 'id -Gn')).out, 'hero scribes\n');
  assert.equal((await run(b, 'id -gn')).out, 'hero\n');
  assert.equal((await run(b, 'id -a')).out, 'uid=1000(hero) gid=1000(hero) groups=1000(hero),1002(scribes)\n');
});

test('id USER describes another account, by name or uid', async () => {
  const b = await shell(guild());
  assert.equal((await run(b, 'id mira')).out, 'uid=1001(mira) gid=1001(smiths) groups=1001(smiths)\n');
  assert.equal((await run(b, 'id 1002')).out, 'uid=1002(oren) gid=1002(scribes) groups=1002(scribes)\n');
  assert.equal((await run(b, 'id -u mira')).out, '1001\n');
  assert.equal((await run(b, 'id -nG oren')).out, 'scribes\n');
  assert.equal((await run(b, 'id hero mira')).out, 'uid=1000(hero) gid=1000(hero) groups=1000(hero),1002(scribes)\nuid=1001(mira) gid=1001(smiths) groups=1001(smiths)\n');
});

test('id names an unknown user and fails', async () => {
  const b = await shell(guild());
  assert.deepEqual(outcome(await run(b, 'id nosuch')), ['', 'id: \u2018nosuch\u2019: no such user\n', 1]);
  assert.deepEqual(outcome(await run(b, 'id a mira')), ['uid=1001(mira) gid=1001(smiths) groups=1001(smiths)\n', 'id: \u2018a\u2019: no such user\n', 1]);
});

test('id refuses -n alone and more than one of -u, -g, -G', async () => {
  const b = await shell(guild());
  assert.deepEqual(outcome(await run(b, 'id -n')), ['', 'id: cannot print only names or real IDs in default format\n', 1]);
  assert.deepEqual(outcome(await run(b, 'id -ug')), ['', 'id: cannot print "only" of more than one choice\n', 1]);
});

test('a primary gid without a group line shows as a bare number', async () => {
  const b = await shell([...guild(), put('/etc/group', file('hero:x:1000:\n'))]);
  assert.equal((await run(b, 'id oren')).out, 'uid=1002(oren) gid=1002 groups=1002\n');
});

test('groups lists the login groups, or each user with a colon', async () => {
  const b = await shell(guild());
  assert.equal((await run(b, 'groups')).out, 'hero scribes\n');
  assert.equal((await run(b, 'groups mira')).out, 'mira : smiths\n');
  assert.deepEqual(outcome(await run(b, 'groups root nosuch hero')), ['root : root\nhero : hero scribes\n', 'groups: \u2018nosuch\u2019: no such user\n', 1]);
  assert.deepEqual(outcome(await run(b, 'groups -x')), ['', "groups: invalid option -- 'x'\nTry 'groups --help' for more information.\n", 1]);
});

test('editing /etc/group changes the shell only after a new login', async () => {
  const b = await shell(guild());
  await b.load([put('/etc/group', file('hero:x:1000:\nsmiths:x:1001:hero\nscribes:x:1002:\n'))]);
  assert.equal((await run(b, 'groups')).out, 'hero scribes\n');
  assert.equal((await run(b, 'groups hero')).out, 'hero : hero smiths\n');
  await b.load([login()]);
  assert.equal((await run(b, 'groups')).out, 'hero smiths\n');
  assert.deepEqual((await b.observe()).groups, ['hero', 'smiths']);
});
