import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, guild } from '../helpers.js';

const outcome = r => [r.out, r.err, r.status];
const TRY = "Try `getent --help' or `getent --usage' for more information.\n";

test('getent group and getent passwd print the entries for names or ids, as the files hold them', async () => {
  const b = await shell(guild());
  assert.deepEqual(outcome(await run(b, 'getent group scribes')), ['scribes:x:1002:hero\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'getent passwd mira 0')), ['mira:x:1001:1001::/home/mira:/bin/bash\nroot:x:0:0:root:/root:/bin/bash\n', '', 0]);
  assert.equal((await run(b, 'getent group')).out, 'root:x:0:\nhero:x:1000:\nsmiths:x:1001:\nscribes:x:1002:hero\n');
});

test('getent exits 2 when a key is missing, after printing the ones it found', async () => {
  const b = await shell(guild());
  assert.deepEqual(outcome(await run(b, 'getent group nosuch')), ['', '', 2]);
  assert.deepEqual(outcome(await run(b, 'getent group hero nosuch root')), ['hero:x:1000:\nroot:x:0:\n', '', 2]);
});

test('getent names a wrong call and an unknown database; other real databases get a note', async () => {
  const b = await shell(guild());
  assert.deepEqual(outcome(await run(b, 'getent')), [TRY, 'getent: wrong number of arguments\n', 1]);
  assert.deepEqual(outcome(await run(b, 'getent nosuchdb x')), [TRY, 'Unknown database: nosuchdb\n', 1]);
  const hosts = await run(b, 'getent hosts kernelia');
  assert.equal(hosts.status, 1);
  assert.match(hosts.note, /getent passwd and getent group/);
});
