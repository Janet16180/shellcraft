import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell } from './helpers.js';
import { put, file } from '../../src/backend/spec.js';

test('a first word completes to a command name', async () => {
  const b = await shell();
  assert.deepEqual(await b.complete('whoa'), { line: 'whoami ', candidates: [] });
  assert.deepEqual(await b.complete('ls | so'), { line: 'ls | sort ', candidates: [] });
});

test('a later word completes to a path, with a slash after a directory', async () => {
  const b = await shell();
  assert.deepEqual(await b.complete('cd forest/ca'), { line: 'cd forest/cave/', candidates: [] });
  assert.deepEqual(await b.complete('cat ~/rea'), { line: 'cat ~/readme.txt ', candidates: [] });
});

test('hidden names complete only when the word starts with a dot', async () => {
  const b = await shell();
  assert.deepEqual(await b.complete('cat .se'), { line: 'cat .secret_map ', candidates: [] });
  assert.deepEqual(await b.complete('cat '), { line: 'cat ', candidates: ['forest/', 'readme.txt'] });
});

test('ambiguous matches extend to their common prefix, then list', async () => {
  const b = await shell();
  assert.deepEqual(await b.complete('h'), { line: 'h', candidates: ['head', 'help', 'history', 'hostname', 'htop'] });
  assert.deepEqual(await b.complete('hi'), { line: 'history ', candidates: [] });
});

test('nothing matches, nothing changes', async () => {
  const b = await shell();
  assert.deepEqual(await b.complete('cat zzz'), { line: 'cat zzz', candidates: [] });
  assert.deepEqual(await b.complete('ls /root/'), { line: 'ls /root/', candidates: [] });
});

test('a name with a space completes with the space escaped, and an escaped word keeps completing', async () => {
  const b = await shell([put('/home/hero/my notes.txt', file('', { owner: 'hero' }))]);
  assert.deepEqual(await b.complete('cat my'), { line: 'cat my\\ notes.txt ', candidates: [] });
  assert.deepEqual(await b.complete('cat my\\ n'), { line: 'cat my\\ notes.txt ', candidates: [] });
});

test('candidates come in C.UTF-8 byte order, capitals first', async () => {
  const b = await shell([put('/home/hero/Zed', file('', { owner: 'hero' })), put('/home/hero/apple', file('', { owner: 'hero' }))]);
  assert.deepEqual((await b.complete('cat ')).candidates, ['Zed', 'apple', 'forest/', 'readme.txt']);
});

test('a directory the user cannot search completes to nothing', async () => {
  assert.deepEqual(await (await shell()).complete('cat /root/s'), { line: 'cat /root/s', candidates: [] });
});

test('completion finds files named like object members', async () => {
  const b = await shell();
  await b.run('touch constructor __proto__');
  assert.deepEqual(await b.complete('cat cons'), { line: 'cat constructor ', candidates: [] });
  assert.deepEqual(await b.complete('cat __p'), { line: 'cat __proto__ ', candidates: [] });
  assert.deepEqual((await b.complete('constr')).line, 'constr');
});
