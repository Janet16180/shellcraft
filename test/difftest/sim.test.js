import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSim } from '../../difftest/sim.js';
import { put, dir, file } from '../../src/backend/spec.js';

const CLOCK = Date.UTC(2026, 9, 6, 10, 30) / 1000;

test('the simulator side runs each line and reports its streams and status', async () => {
  const world = [put('/home', dir({ hero: dir({ 'a.txt': file('hi\n', { owner: 'hero' }) }, { owner: 'hero', mode: 0o750 }) }))];
  const results = await runSim(world, ['cat a.txt', 'cat nope'], Date.UTC(2026, 0, 1), [CLOCK, CLOCK]);
  assert.deepEqual(results, [
    { out: 'hi\n', err: '', status: 0 },
    { out: '', err: 'cat: nope: No such file or directory\n', status: 1 },
  ]);
});

test('the world keeps the world time while the lines run on the container clock', async () => {
  const world = [put('/home', dir({ hero: dir({ 'old.txt': file('', { owner: 'hero' }) }, { owner: 'hero', mode: 0o750 }) }))];
  const [old] = await runSim(world, ['ls -l old.txt'], Date.UTC(2020, 0, 1), [CLOCK]);
  assert.match(old.out, /Jan {2}1 {2}2020 old\.txt/);
});

test('each line runs at the clock the container had for it', async () => {
  const world = [put('/home', dir({ hero: dir({}, { owner: 'hero', mode: 0o750 }) }))];
  const [, listed] = await runSim(world, ['touch new.txt', 'ls -l new.txt'], Date.UTC(2026, 0, 1), [CLOCK, CLOCK + 1]);
  assert.match(listed.out, /Oct {2}6 10:30 new\.txt/);
});

test('the simulator needs one clock per line', async () => {
  await assert.rejects(runSim([], ['ls', 'pwd'], Date.UTC(2026, 0, 1), [CLOCK]), /one clock per line/);
});

test('a line whose command takes time runs to its end on the simulator clock', async () => {
  const world = [put('/home', dir({ hero: dir({}, { owner: 'hero', mode: 0o750 }) }))];
  const [slept, after] = await runSim(world, ['sleep 1 & sleep 2; echo up', 'jobs'], Date.UTC(2026, 0, 1), [CLOCK, CLOCK + 2]);
  assert.equal(slept.out, 'up\n');
  assert.match(slept.err, /^\[1\] \d+\n\[1\]\+ {2}Done {20}sleep 1\n$/);
  assert.deepEqual(after, { out: '', err: '', status: 0 });
});
