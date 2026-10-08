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

test('like the simulator, the guard refuses rm -r of any directory holding home and leaves it in place', async () => {
  const backend = createFakeBackend();
  for (const line of ['rm -rf /home', 'rm -r /home/', 'rm -R ~']) {
    const result = await backend.run(line);
    assert.equal(result.blocked.length, 1, line);
    assert.equal(result.status, 1, line);
  }
  assert.ok((await backend.observe()).tree.children.home.children.hero);
});

test('a command named like an object property is simply not found', async () => {
  assert.equal((await createFakeBackend().run('constructor')).status, 127);
});

test('like the simulator, the guard refuses every signal that ends or stops the shell, from kill, pkill or killall', async () => {
  const backend = createFakeBackend();
  for (const line of ['kill -HUP 733', 'kill -s STOP 733', 'pkill -9 bash', 'pkill -9 ba', 'killall -s KILL bash']) {
    assert.equal((await backend.run(line)).blocked.length, 1, line);
  }
  for (const line of ['kill 733', 'kill -INT 733', 'pkill bash', 'killall -9 ba']) assert.deepEqual((await backend.run(line)).blocked, [], line);
  assert.ok((await backend.observe()).procs.some(p => p.key === 'shell'));
});

test('kill with a deadly signal removes another process', async () => {
  const backend = createFakeBackend();
  await backend.load([proc({ key: 'daemon', user: 'hero', cmd: './shadow' })]);
  const { pid } = (await backend.observe()).procs.find(p => p.key === 'daemon');
  await backend.run(`kill -9 ${pid}`);
  assert.equal((await backend.observe()).procs.some(p => p.key === 'daemon'), false);
});

test('sudo LINE waits for hidden input; dragon runs the line, anything else fails', async () => {
  const backend = createFakeBackend();
  const asked = await backend.run('sudo pwd');
  assert.deepEqual(asked.input, { prompt: '[sudo] password for hero: ', hidden: true });
  await assert.rejects(backend.run('pwd'), /waiting/);
  const done = await backend.answer('dragon');
  assert.deepEqual(done.output.map(c => c.text), ['[sudo] password for hero: \n', '/home/hero\n']);
  assert.deepEqual(done.commands.map(c => c.name), ['sudo', 'pwd']);
  await backend.run('sudo pwd');
  assert.equal((await backend.answer(null)).status, 1);
  await assert.rejects(backend.answer('x'), /no line is waiting/);
});
