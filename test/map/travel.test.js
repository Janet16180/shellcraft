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

test('stepping into a portal (a link in the room) walks to it and comes out in the middle of where it leads', () => {
  const portal = { realTo: `${HOME}/forest/cave/deep`, portal: true };
  assert.deepEqual(planTravel(HOME, `${HOME}/portal`, HOME, portal), { approach: 'portal', transition: 'portal', arrive: 'center' });
});

test('the realm is decided by where a path really leads, through any link', () => {
  assert.equal(planTravel(HOME, `${HOME}/etc`, HOME, { realTo: '/etc', portal: true }).transition, 'descend');
  assert.equal(planTravel(`${HOME}/forest`, `${HOME}/etc`, HOME, { realTo: '/etc' }).transition, 'descend');
  assert.equal(planTravel(`${HOME}/etc`, `${HOME}/forest`, HOME, { realFrom: '/etc' }).transition, 'climb');
});

test('going back up out of a linked room arrives at the portal you came through', () => {
  assert.deepEqual(planTravel(`${HOME}/portal`, HOME, HOME, { realFrom: `${HOME}/forest/cave/deep` }), { approach: 'exit', transition: 'fade', arrive: 'door' });
});
