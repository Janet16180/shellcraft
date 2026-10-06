import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTravel } from '../../src/map/travel.js';

const HOME = '/home/hero';

test('going into a subdirectory walks through its door and arrives at the exit', () => {
  assert.deepEqual(planTravel(HOME, `${HOME}/forest`, HOME), { approach: 'door', transition: 'fade', arrive: 'exit' });
});

test('going up to the parent walks out of the exit and arrives at the door you left', () => {
  assert.deepEqual(planTravel(`${HOME}/forest`, HOME, HOME), { approach: 'exit', transition: 'fade', arrive: 'door' });
});

test('a jump to anywhere else is a warp', () => {
  assert.deepEqual(planTravel(`${HOME}/forest/cave`, `${HOME}/tower`, HOME), { approach: 'none', transition: 'warp', arrive: 'center' });
});

test('leaving home for the system is a descent, coming back is a climb', () => {
  assert.deepEqual(planTravel(HOME, '/home', HOME), { approach: 'exit', transition: 'descend', arrive: 'door' });
  assert.deepEqual(planTravel('/home', HOME, HOME), { approach: 'door', transition: 'climb', arrive: 'exit' });
  assert.equal(planTravel(`${HOME}/forest`, '/etc', HOME).transition, 'descend');
  assert.equal(planTravel('/var/log', `${HOME}/tower`, HOME).transition, 'climb');
});

test('moving within the dungeon keeps the plain transitions', () => {
  assert.equal(planTravel('/', '/etc', HOME).transition, 'fade');
  assert.equal(planTravel('/etc', '/var/log', HOME).transition, 'warp');
});

test('staying put is a bug and raises', () => {
  assert.throws(() => planTravel('/etc', '/etc', HOME), /same/);
});
