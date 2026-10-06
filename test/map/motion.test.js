import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMotion } from '../../src/map/motion.js';

const fixed = () => 0.5;

test('a tween runs from 0 to 1 over its duration, then resolves', async () => {
  const motion = createMotion({ reducedMotion: false, random: fixed });
  const seen = [];
  const done = motion.tween(100, p => seen.push(p));
  motion.step(1000);
  motion.step(1050);
  motion.step(1100);
  await done;
  assert.deepEqual(seen, [0, 0.5, 1]);
  assert.equal(motion.busy(), false);
});

test('with reduced motion a tween jumps to its end at once', async () => {
  const motion = createMotion({ reducedMotion: true, random: fixed });
  const seen = [];
  await motion.tween(500, p => seen.push(p));
  assert.deepEqual(seen, [1]);
});

test('finishing ends every running tween at its last frame', async () => {
  const motion = createMotion({ reducedMotion: false, random: fixed });
  const seen = [];
  const done = motion.tween(100, p => seen.push(p));
  motion.step(0);
  motion.finish();
  await done;
  assert.deepEqual(seen, [0, 1]);
  assert.equal(motion.busy(), false);
});

test('a burst throws particles that fall and fade away', () => {
  const motion = createMotion({ reducedMotion: false, random: fixed });
  motion.burst(100, 100, ['#fff'], 10);
  assert.equal(motion.particles.length, 10);
  motion.step(0);
  for (let t = 16; t < 3000; t += 16) motion.step(t);
  assert.equal(motion.particles.length, 0);
});

test('with reduced motion a burst throws nothing', () => {
  const motion = createMotion({ reducedMotion: true, random: fixed });
  motion.burst(100, 100, ['#fff'], 10);
  assert.equal(motion.particles.length, 0);
});

test('waiting is a tween that changes nothing', async () => {
  const motion = createMotion({ reducedMotion: false, random: fixed });
  const done = motion.wait(200);
  motion.step(0);
  motion.step(200);
  await done;
  assert.equal(motion.busy(), false);
});
