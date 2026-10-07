/**
 * The worlds the differential cases run in, built with src/backend/spec.js.
 * They avoid what the container manages itself (/etc/hostname, /etc/passwd)
 * and never replace a system directory, only add children to it.
 */

import { put, dir, file } from '../src/backend/spec.js';
import { baseWorld } from '../src/game/world.js';
import { PLAYER } from '../src/backend/player.js';

const mine = { owner: 'hero' };
const scroll = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of the scroll${i === 22 ? ': a dragon sleeps' : ''}`).join('\n') + '\n';

const home = () => put('/home', dir({ hero: dir({
  'readme.txt': file('Dear apprentice,\n\nYou have awakened in Kernelia.\nType ls to look around.\n', mine),
  '.secret_map': file('THE SECRET MAP\n  ~/forest   a cave hides a key\n', mine),
  '.bashrc': file("alias ll='ls -alF'\nalias la='ls -A'\n", mine),
  forest: dir({
    clearing: dir({ 'mushroom.txt': file('A glowing mushroom whispers: pwd\n', mine) }, mine),
    river: dir({ 'fish.txt': file('Absolute paths start with a slash.\n', mine) }, mine),
    cave: dir({
      'bat.txt': file('A bat squeaks.\n', mine),
      deep: dir({ 'ancient_key.txt': file('The Ancient Key.\n', mine) }, mine),
    }, mine),
  }, mine),
  library: dir({
    'scroll_of_ages.txt': file(scroll, mine),
    'librarian.txt': file('Nobody reads a whole scroll.\n', mine),
  }, mine),
  market: dir({
    'inventory.txt': file('potion\nsword\napple\npotion\nShield\napple\npotion\nmap\nsword\ntorch\napple\n10 arrows\n9 bolts\n', mine),
  }, mine),
  gate: dir({
    'open_gate.sh': file('#!/bin/bash\necho "The gate opens"\n', mine),
    'inscription.txt': file('Only a spell that may EXECUTE opens this gate.\n', mine),
  }, mine),
}, { owner: 'hero', mode: 0o750 }) }));

const system = () => [
  put('/tmp', dir({}, { mode: 0o1777 })),
  put('/root', dir({ 'treasure.txt': file('root only\n') }, { mode: 0o700 })),
  put('/etc', dir({ motd: file('Welcome to Kernelia\n'), 'vault.conf': file('secret=1\n', { mode: 0o600 }) })),
  put('/srv', dir({ 'notice.txt': file('Property of root.\n'), empty: dir() })),
];

const names = () => put('/home/hero/names', dir({
  'apple.txt': file('a\n', mine), 'Banana.txt': file('b\n', mine), 'cherry': file('', mine), 'Zebra': dir({}, mine),
  '_under': file('', mine), '.hidden': file('', mine), '10.txt': file('', mine), '9.txt': file('', mine), 'B': dir({}, mine),
  'my notes.txt': file('spaced\n', mine), 'run.sh': file('echo run\n', { owner: 'hero', mode: 0o755 }),
  "it's": file('', mine), 'a$b': file('', mine), 'tab\tx': file('', mine),
}, mine));

/** @type {Record<string, () => object[]>} */
export const WORLDS = {
  home: () => [home(), ...system()],
  names: () => [home(), names(), ...system()],
  game: () => baseWorld(PLAYER),
};
