/**
 * The worlds the differential cases run in, built with src/backend/spec.js.
 * They avoid what the container manages itself (/etc/hostname, /etc/shadow)
 * and never replace a system directory, only add children to it.
 */

import { put, dir, file } from '../src/backend/spec.js';
import { baseWorld, accounts } from '../src/game/world.js';
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

const localBin = () => put('/usr/local', dir({ bin: dir({
  glimmer: file('#!/bin/bash\necho "glimmer runs"\nnosuch\n', { mode: 0o755 }),
  dim: file('#!/bin/bash\necho dim\n'),
}) }));

const spells = () => put('/home/hero/spells', dir({
  'args.sh': file('#!/bin/bash\necho arg=$1 n=$# 0=$0 ${2}\necho "$*" $@\ntouch "$@"\n', { owner: 'hero', mode: 0o755 }),
}, mine));

const exe = { owner: 'hero', mode: 0o755 };

const loops = () => put('/home/hero/loops', dir({
  'loop.sh': file('#!/bin/bash\n# one line each\necho start\nfor x in a b\ndo\n  echo "x=$x"\n  nosuch\ndone\nfor f in ~/forest/*; do echo $f; done | sort -r\necho end\n', exe),
  'lines.sh': file('nosuch \\\n  arg\necho \\\n "$(nosuch2)"\nfor 1 in a\ndo echo\ndone\necho "a # b" a#b # gone\n', exe),
  'nested.sh': file('for i in 1 2 3; do\n  for j in a b; do\n    if [ $i = 2 ]; then continue 2; fi\n    echo $i$j\n    if [ $i = 3 ]; then break 2; fi\n  done\ndone\nbreak\necho s=$?\nfor i in 1 2; do break 0; echo no; done; echo out=$?\nfor i in 1 2; do continue 1 2; echo no; done\necho after\n', exe),
  'redir.sh': file('echo one\necho >\necho never\n', exe),
  'eof.sh': file('echo one\nfor x in a b; do\n  echo $x\n', exe),
  'quote.sh': file('echo one\necho "abc\necho two\n', exe),
  'nodo.sh': file('for x in a b\n  echo $x\ndone\n', exe),
  'stray.sh': file('echo a; fi\n', exe),
  'exit.sh': file('echo a\nfor i in 1 2; do exit 4; done\necho never\n', exe),
  'last.sh': file('false\nexit\n', exe),
  'bad.sh': file('exit abc\necho never\n', exe),
  'numeric.sh': file('for i in 1 2; do break x; done\necho never\n', exe),
  'conds.sh': file('for n in 1 5 10; do\n  if [ $n -lt 5 ]; then\n    echo "$n small"\n  elif [ $n -eq 5 ]; then\n    echo "$n five"\n  else\n    echo "$n big"\n  fi\ndone\nif [ -d ~/forest ] && [ ! -e ~/nowhere ]; then echo yes; fi\n', exe),
}, mine));

const people = () => accounts(PLAYER, {
  users: [{ name: 'mira', uid: 1001, group: 'smiths' }, { name: 'oren', uid: 1002, group: 'scribes' }],
  groups: [{ name: 'smiths', gid: 1001 }, { name: 'scribes', gid: 1002, members: ['hero'] }],
});

const hall = () => put('/home/hero/hall', dir({
  'mine.txt': file('mine\n', mine),
  'miras.txt': file('forged\n', { owner: 'mira', group: 'smiths', mode: 0o640 }),
  'scroll.txt': file('ink\n', { owner: 'oren', group: 'scribes', mode: 0o664 }),
  'orphan.txt': file('lost\n', { owner: '1234', group: '4321' }),
  'shy.txt': file('hidden from me\n', { owner: 'hero', mode: 0o044 }),
  'locked.txt': file('locked\n', { owner: 'hero', mode: 0o444 }),
  ronly: dir({ a: file('a\n', mine) }, { owner: 'hero', mode: 0o444 }),
  xonly: dir({ known: file('known\n', mine) }, { owner: 'hero', mode: 0o111 }),
  sealed: dir({ in: file('in\n', mine) }, { owner: 'hero', mode: 0o555 }),
  shared: dir({}, { owner: 'oren', group: 'scribes', mode: 0o2775 }),
  forge: dir({ 'blade.txt': file('blade\n', { owner: 'mira', group: 'smiths' }) }, { owner: 'mira', group: 'smiths', mode: 0o755 }),
}, mine));

/** @type {Record<string, () => object[]>} */
export const WORLDS = {
  home: () => [home(), ...system()],
  names: () => [home(), names(), ...system()],
  game: () => baseWorld(PLAYER),
  scripts: () => [home(), ...system(), localBin(), spells()],
  loops: () => [home(), ...system(), loops()],
  guild: () => [home(), ...system(), ...people(), hall()],
};
