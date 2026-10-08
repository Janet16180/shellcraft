import { test } from 'node:test';
import assert from 'node:assert/strict';
import { residentOf, PEOPLE } from '../../src/map/residents.js';
import { PALETTES } from '../../src/map/palette.js';

const door = (path, owner) => ({ name: path.split('/').pop(), path, owner });

test('the door of a known person\'s home has them as its resident', () => {
  assert.equal(residentOf(door('/home/mira', 'mira'), 'hero'), 'mira');
  assert.equal(residentOf(door('/home/oren', 'oren'), 'hero'), 'oren');
  assert.equal(residentOf(door('/home/tamsin', 'tamsin'), 'hero'), 'tamsin');
});

test('nobody stands at the player\'s own door, a stranger\'s door or a door that changed hands', () => {
  assert.equal(residentOf(door('/home/hero', 'hero'), 'hero'), null);
  assert.equal(residentOf(door('/home/alice', 'alice'), 'hero'), null);
  assert.equal(residentOf(door('/home/mira', 'root'), 'hero'), null);
  assert.equal(residentOf(door('/srv/mira', 'mira'), 'hero'), null);
  assert.equal(residentOf(door('/home/mira', 'mira'), 'mira'), null);
});

test('a name like constructor is nobody', () => {
  assert.equal(residentOf(door('/home/constructor', 'constructor'), 'hero'), null);
});

test('every person recolours the hero\'s hat and robe with real colours', () => {
  assert.deepEqual(PEOPLE.mira, { h: '#e2434f', r: '#a24f34' });
  assert.deepEqual(PEOPLE.oren, { h: '#8fd14f', r: '#2c5aa8' });
  for (const [name, colours] of Object.entries(PEOPLE)) {
    assert.deepEqual(Object.keys(colours).sort(), ['h', 'r'], name);
    for (const colour of Object.values(colours)) assert.match(colour, /^#[0-9a-f]{6}$/, name);
    assert.notEqual(colours.h, PALETTES.toon.h, name);
  }
});
