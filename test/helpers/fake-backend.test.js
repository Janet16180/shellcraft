import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, remove, proc, stop, cd, dir, file } from '../../src/backend/spec.js';
import { createFakeBackend } from './fake-backend.js';

const HOME = '/home/hero';

test('the fake applies every patch operation', async () => {
  const backend = createFakeBackend();
  await backend.load([
    put(`${HOME}/forest`, dir({ 'tree.txt': file('oak') })),
    put(`${HOME}/junk.txt`, file()),
    remove(`${HOME}/junk.txt`),
    proc({ key: 'daemon', user: 'hero', cmd: './shadow' }),
    proc({ key: 'gone', user: 'hero', cmd: 'x' }),
    stop('gone'),
    cd(`${HOME}/forest`),
  ]);
  const obs = await backend.observe();
  assert.equal(obs.cwd, `${HOME}/forest`);
  assert.deepEqual(Object.keys(obs.tree.children.home.children.hero.children), ['forest']);
  assert.deepEqual(obs.procs.map(p => p.key), ['shell', 'daemon']);
});

test('a put without a parent directory raises', async () => {
  await assert.rejects(createFakeBackend().load([put('/nowhere/x', file())]), /parent/);
});

test('observe returns a snapshot that later commands do not change', async () => {
  const backend = createFakeBackend();
  const before = await backend.observe();
  await backend.run('mkdir camp; cd camp');
  assert.equal(before.cwd, HOME);
  assert.equal(before.tree.children.home.children.hero.children.camp, undefined);
});

test('each command of a line gives a record with its cwd and status', async () => {
  const backend = createFakeBackend();
  await backend.load([put(`${HOME}/forest`, dir())]);
  const result = await backend.run('cd forest; pwd; nope');
  assert.deepEqual(result.commands.map(r => [r.name, r.cwd, r.status]), [
    ['cd', HOME, 0], ['pwd', `${HOME}/forest`, 0], ['nope', `${HOME}/forest`, 127],
  ]);
  assert.equal(result.commands[1].stdout, `${HOME}/forest\n`);
  assert.equal(result.status, 127);
});

test('the guard refuses rm -r of home and kill -9 of the shell', async () => {
  const backend = createFakeBackend();
  assert.equal((await backend.run('rm -r ~')).blocked.length, 1);
  assert.equal((await backend.run('kill -9 733')).blocked.length, 1);
  const obs = await backend.observe();
  assert.ok(obs.tree.children.home.children.hero);
  assert.ok(obs.procs.some(p => p.key === 'shell'));
});
