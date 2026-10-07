/**
 * Chapter 3, Things Unseen: hidden files (names that start with a dot),
 * `ls -a`, `ls -l` and joined options. The boss room hides a tunnel with a
 * random dotted name in the cave: the player finds it with ls -a, walks in and
 * reads the treasure inside.
 */
import { put, cd, dir, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { revealedDirs } from '../effects.js';
import { token } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const TUNNEL = '.tunnel_';
const TREASURE = 'treasure.txt';
const FAIRY_RING = '.fairy_ring.txt';

const FAIRY_TEXT = `A ring of tiny mushrooms, hidden in the grass.
A fairy whispers: "My name starts with a dot, so plain ls walks past me.
You found me with ls -a. Well done, you see what others miss."
`;

const TREASURE_TEXT = `A pouch of 300 gold coins, and a scrap of paper:
"Whoever reads this knows the secret: a name that starts with a dot
hides from plain ls, and ls -a shows it."
`;

const clearingOf = ctx => `${ctx.home}/forest/clearing`;
const caveOf = ctx => `${ctx.home}/forest/cave`;
const keyOf = ctx => `${ctx.home}/forest/cave/deep/ancient_key.txt`;
const fairyOf = ctx => `${clearingOf(ctx)}/${FAIRY_RING}`;
const mapOf = ctx => `${ctx.home}/.secret_map`;

const listed = (ctx, record) => {
  const operands = ctx.paths(record);
  return operands.length > 0 ? operands : [record.cwd];
};
const showedHidden = (ctx, path) => revealedDirs(ctx).includes(path);
const listedPlainly = (ctx, path) => ctx.ran('ls', record => !ctx.flag(record, 'a') && !ctx.flag(record, 'A') && listed(ctx, record).includes(path));
const listedLong = (ctx, pred) => ctx.ran('ls', record => ctx.flag(record, 'l') && pred(record));
const showsAll = (ctx, record) => ctx.flag(record, 'a') || ctx.flag(record, 'A');

// "secret_map" for ".secret_map": the player left out the dot.
const withoutDot = path => path.replace(/\/\.([^/]+)$/, '/$1');
const missedDot = (ctx, path) => ctx.tried('cat', record => ctx.paths(record).includes(withoutDot(path)));

function setupBoss(random, { home, user }) {
  const target = `${home}/forest/cave/${TUNNEL}${token(random, 3)}`;
  const patch = [
    ...restore('forest', { home, user }),
    put(target, dir({ [TREASURE]: file(TREASURE_TEXT, { owner: user }) }, { owner: user })),
    cd(home),
  ];
  return { patch, secret: { target } };
}

function bossNear(ctx, { target }) {
  let note = null;
  if (ctx.read(`${target}/${TREASURE}`) && ctx.cwd !== target) note = 'You read the treasure from outside. Walk into the tunnel with cd first, then read it there.';
  else if (listedPlainly(ctx, caveOf(ctx))) note = `The tunnel's name starts with a dot, so plain ls skips it. Try ls -a ~/forest/cave.`;
  return note;
}

function solveBoss(obs) {
  const cave = `${obs.home}/forest/cave`;
  const name = Object.keys(nodeAt(obs.tree, cave).children).find(child => child.startsWith(TUNNEL));
  return ['ls -a forest/cave', `cd forest/cave/${name}`, `cat ${TREASURE}`];
}

export default {
  id: 'unseen',
  act: 1,
  title: 'Things Unseen',
  setup: (_random, player) => [
    ...restore('forest', player),
    ...restore('.secret_map', player),
    put(`${player.home}/forest/clearing/${FAIRY_RING}`, file(FAIRY_TEXT, { owner: player.user })),
    cd(player.home),
  ],
  lesson: `<p>Some names start with a dot, like <code>.secret_map</code>. These are <b>hidden files</b>. They are ordinary files: <code>ls</code> just skips them, so the settings they usually hold stay out of your way.</p>
<p><code>ls -a</code> (all) lists every name, hidden ones too. You will also see two names that every directory has: <code>.</code>, the directory itself, and <code>..</code>, its parent. A hidden file reads like any other, as long as you type the dot: <code>cat .secret_map</code>.</p>
<p><code>ls -l</code> (long) shows one name per line, with details. Read a line from left to right:</p>
<ul>
<li>The first letter is the type: <code>d</code> for a directory, <code>-</code> for a regular file.</li>
<li>The next nine letters are the permissions, who may read, write or run it. Chapter 11 explains them.</li>
<li>Then a count of links (you can skip it), the owner, the group, the size in bytes, the date of the last change, and the name.</li>
</ul>
<p>The first line, <b>total</b>, counts disk blocks; you can skip it too.</p>
<p>Options can share one dash: <code>ls -la</code> is the same as <code>ls -l -a</code>. And like any <code>ls</code>, they work with a path: <code>ls -a ~/forest</code>.</p>`,
  tasks: [
    {
      goal: 'Reveal the hidden files in your home (`ls` with `-a`, for all)',
      tip: '`ls -a` lists every name, including hidden ones that start with a dot.',
      hints: [
        'Some names in your home start with a dot, and plain `ls` walks past them.',
        'Add the option `-a` (all) after `ls`, with a space between them.',
        'ls -a ~',
      ],
      done: ctx => showedHidden(ctx, ctx.home),
      near: ctx => (listedPlainly(ctx, ctx.home) ? 'Plain ls skips names that start with a dot. Add -a: ls -a.' : null),
    },
    {
      goal: 'Read the secret map `~/.secret_map`',
      tip: 'A hidden file reads like any other file, as long as you type the dot.',
      hints: [
        'You already know the command that prints a file.',
        '`cat` and the file\'s name, dot included.',
        'cat ~/.secret_map',
      ],
      done: ctx => ctx.read(mapOf(ctx)),
      near: ctx => (missedDot(ctx, mapOf(ctx)) ? 'The dot is part of the name: .secret_map.' : null),
    },
    {
      goal: 'Find the hidden file in the fairy clearing `~/forest/clearing`',
      tip: '`ls -a` works with a path too, so you can look into the clearing from anywhere.',
      hints: [
        'Plain `ls` will not show it. You need the option that shows all names.',
        'Give `ls -a` the clearing\'s path, or walk into the clearing and run `ls -a` there.',
        'ls -a ~/forest/clearing',
      ],
      done: ctx => showedHidden(ctx, clearingOf(ctx)),
      near: ctx => (listedPlainly(ctx, clearingOf(ctx)) ? 'Plain ls skips the hidden file. Add -a.' : null),
    },
    {
      goal: 'Read the hidden file you found in the clearing',
      tip: 'Its name starts with a dot, and the dot is part of the name.',
      hints: [
        'Use the full name that `ls -a` showed you, dot included.',
        '`cat` and the path to the file: the clearing, then the hidden name.',
        'cat ~/forest/clearing/.fairy_ring.txt',
      ],
      done: ctx => ctx.read(fairyOf(ctx)),
      near: ctx => (missedDot(ctx, fairyOf(ctx)) ? 'The dot is part of the name: .fairy_ring.txt.' : null),
    },
    {
      goal: 'Look at your home in detail (`ls` with `-l`, for long)',
      tip: '`ls -l` shows one name per line: type and permissions, owner, size in bytes, date and name.',
      hints: [
        'There is an option that makes `ls` show a long line about each name.',
        'Add the option `-l` (a small L, for long) after `ls`.',
        'ls -l ~',
      ],
      done: ctx => listedLong(ctx, record => listed(ctx, record).includes(ctx.home)),
    },
    {
      goal: 'See the hidden files in detail too (join both options: `-la`)',
      tip: 'Options can share one dash: `ls -la` is the same as `ls -l -a`.',
      hints: [
        'You know one option for details and one for hidden names. Use both at once.',
        'Write both letters after one dash, or give each its own dash.',
        'ls -la ~',
      ],
      done: ctx => listedLong(ctx, record => showsAll(ctx, record)),
    },
    {
      goal: 'Find the size of the ancient key `~/forest/cave/deep/ancient_key.txt`',
      tip: 'In a long listing, the number just before the date is the size in bytes.',
      hints: [
        '`cat` shows what is inside a file, not how big it is.',
        'Give `ls -l` the path to the key, or to the directory that holds it.',
        'ls -l ~/forest/cave/deep/ancient_key.txt',
      ],
      done: ctx => listedLong(ctx, record => listed(ctx, record).some(path => path === keyOf(ctx) || path === `${caveOf(ctx)}/deep`)),
      near: ctx => (ctx.read(keyOf(ctx)) ? 'cat shows what is inside the key. Its size is in the long listing: ls -l with the key\'s path.' : null),
    },
  ],
  solve: ['ls -a', 'cat .secret_map', 'ls -a forest/clearing', 'cat forest/clearing/.fairy_ring.txt', 'ls -l', 'ls -la', 'ls -l forest/cave/deep/ancient_key.txt'],
  boss: {
    title: 'The Hidden Tunnel',
    briefing: `<p>Something is hidden in the cave: a directory whose name starts with <code>.tunnel_</code>, inside <code>~/forest/cave</code>. Find its full name, walk into it with <code>cd</code>, and read <code>treasure.txt</code> there.</p>`,
    setup: setupBoss,
    hints: [
      'Plain `ls` will not show the tunnel: its name starts with a dot.',
      'Run `ls -a ~/forest/cave` to learn the full name, then `cd` into the tunnel and `cat` the treasure.',
      ({ target }) => `cd ${target.replace(/^\/home\/[^/]+/, '~')}; cat ${TREASURE}`,
    ],
    done: (ctx, { target }) => ctx.cwd === target && ctx.read(`${target}/${TREASURE}`),
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['ls -a', 'list every name, hidden ones too'],
    ['cat .secret_map', 'a hidden file reads like any other; the dot is part of the name'],
    ['ls -l', 'one name per line, with type, permissions, owner, size and date'],
    ['ls -la', 'options can share one dash'],
    ['ls -a ~/forest', 'options work with a path too'],
  ],
  why: `<p>Why hide files at all? Programs keep their settings in your home, in files and directories whose names start with a dot, like <code>.bashrc</code>. Plain <code>ls</code> skips them so your own files stand out.</p>
<p>Hiding is not a lock. It is a habit of <code>ls</code>, not a protection: anyone allowed to read the directory sees the names with <code>ls -a</code>. Permissions, which <code>ls -l</code> shows in its first column, are what decide who may read a file.</p>
<p>Why do <code>.</code> and <code>..</code> show up? Every directory has them: <code>.</code> is the directory itself and <code>..</code> its parent. That is why <code>cd ..</code> works everywhere.</p>`,
  field: [
    ['ls -A', 'like `-a`, but leaves out `.` and `..`'],
    ['ls -lh', 'sizes people can read, like `4.0K` instead of `4096`'],
    ['ls -lt', 'newest first'],
  ],
  spells: [
    { name: 'ls -a', summary: 'List every name, including hidden ones that start with a dot.', examples: [['ls -a', 'the directory you are in'], ['ls -a ~/forest', 'another directory']] },
    { name: 'ls -l', summary: 'Long listing: type, permissions, owner, size in bytes, date and name.', examples: [['ls -l', 'details of every name'], ['ls -la', 'details, hidden names too']] },
  ],
};
