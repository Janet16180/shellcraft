import { dir, file } from '../../src/backend/spec.js';

const run = { mode: 0o755 };

/**
 * A small world shaped like the game's: the player's overworld under
 * /home/hero and a dungeon of system directories around it. Every call builds
 * a fresh tree, so tests can change it freely.
 *
 * @returns {object} The root directory node.
 */
export function sampleTree() {
  const mine = { owner: 'hero' };
  return dir({
    etc: dir({
      hostname: file('kernelia\n'),
      motd: file('Welcome\n'),
      passwd: file('root:x:0:0::/root:/bin/bash\n'),
      shadow: file('root:*:19000::::::\n', { mode: 0o640, group: 'shadow' }),
      apt: dir({ 'sources.list': file('') }),
    }),
    home: dir({
      alice: dir({ 'diary.txt': file('', { owner: 'alice' }) }, { owner: 'alice', mode: 0o750 }),
      hero: dir({
        'readme.txt': file('Welcome\n', mine),
        '.secret_map': file('X\n', mine),
        forest: dir({
          clearing: dir({ 'mushroom.txt': file('', mine) }, mine),
          river: dir({ 'fish.txt': file('', mine) }, mine),
          cave: dir({ deep: dir({ 'ancient_key.txt': file('', mine) }, mine) }, mine),
        }, mine),
        junk: dir({}, mine),
        tower: dir({ floor1: dir({ 'ruby.gem': file('', mine) }, mine) }, mine),
        gate: dir({
          'open_gate.sh': file('#!/bin/bash\n', mine),
          'spell.sh': file('#!/bin/bash\n', { ...mine, mode: 0o755 }),
        }, mine),
      }, { owner: 'hero', mode: 0o750 }),
    }),
    root: dir({ 'treasure.txt': file('') }, { mode: 0o700 }),
    tmp: dir({}, { mode: 0o1777 }),
    usr: dir({ bin: dir({ cat: file('', run), ls: file('', run), grep: file('', run) }) }),
    var: dir({ log: dir({ syslog: file(''), 'auth.log': file('', { mode: 0o640, group: 'adm' }) }) }),
    dev: dir({ null: file('', { mode: 0o666 }) }),
  });
}

/**
 * An Observation of the sample world (or a given tree) from one directory.
 *
 * @param {string} cwd Absolute working directory.
 * @param {{tree?: object, user?: string, procs?: object[], jobs?: object[]}} [opts] Overrides.
 * @returns {object} The observation.
 */
export function observe(cwd, { tree = sampleTree(), user = 'hero', procs = [], jobs = [] } = {}) {
  const home = user === 'root' ? '/root' : `/home/${user}`;
  return { user, groups: [user], host: 'kernelia', home, cwd, tree, procs, jobs };
}

/**
 * A directory holding the given number of subdirectories and files, named so
 * that they sort in creation order.
 *
 * @param {number} dirs How many subdirectories.
 * @param {number} files How many files.
 * @returns {object} The directory node, owned by hero.
 */
export function crowded(dirs, files) {
  const children = {};
  for (let i = 0; i < dirs; i++) children[`d${String(i).padStart(2, '0')}`] = dir({}, { owner: 'hero' });
  for (let i = 0; i < files; i++) children[`f${String(i).padStart(2, '0')}.txt`] = file('', { owner: 'hero' });
  return dir(children, { owner: 'hero' });
}
