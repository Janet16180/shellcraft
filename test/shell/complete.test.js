import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell } from './helpers.js';

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
