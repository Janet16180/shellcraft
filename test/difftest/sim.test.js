import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSim } from '../../difftest/sim.js';
import { put, dir, file } from '../../src/backend/spec.js';

test('the simulator side runs each line and reports its streams and status', async () => {
  const world = [put('/home', dir({ hero: dir({ 'a.txt': file('hi\n', { owner: 'hero' }) }, { owner: 'hero', mode: 0o750 }) }))];
  const results = await runSim(world, ['cat a.txt', 'cat nope'], Date.UTC(2026, 0, 1));
  assert.deepEqual(results, [
    { out: 'hi\n', err: '', status: 0 },
    { out: '', err: 'cat: nope: No such file or directory\n', status: 1 },
  ]);
});

test('the world keeps the world time while later files get the real clock', async () => {
  const world = [put('/home', dir({ hero: dir({ 'old.txt': file('', { owner: 'hero' }) }, { owner: 'hero', mode: 0o750 }) }))];
  const [old] = await runSim(world, ['ls -l old.txt'], Date.UTC(2020, 0, 1));
  assert.match(old.out, /Jan {2}1 {2}2020 old\.txt/);
});
