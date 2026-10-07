/**
 * Chapter 5, The Cursed Junkyard: rm, rmdir and rm -r, with the habit of
 * looking before and after removing. The boss room piles new junk with random
 * names into the junkyard (a file, an empty directory, a full directory): the
 * player clears it so that only the old boots are left.
 */
import { put, cd, dir, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { token } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const BOOTS = 'old_boots.txt';
const PILE_PARTS = ['bottle.txt', 'rag.txt', 'nail.txt', 'bone.txt', 'can.txt'];

const junkOf = ctx => `${ctx.home}/junk`;
const bootsOf = ctx => `${ctx.home}/junk/${BOOTS}`;
const appleOf = ctx => `${ctx.home}/junk/rotten_apple.txt`;
const bonesOf = ctx => `${ctx.home}/junk/fish_bones.txt`;
const crateOf = ctx => `${ctx.home}/junk/empty_crate`;
const cobwebsOf = ctx => `${ctx.home}/junk/cobwebs`;
const cartOf = ctx => `${ctx.home}/junk/broken_cart`;

const isDir = (ctx, path) => ctx.node(path)?.type === 'dir';
const isFullDir = (ctx, path) => isDir(ctx, path) && Object.keys(ctx.node(path).children).length > 0;
const listed = (ctx, record) => {
  const operands = ctx.paths(record);
  return operands.length > 0 ? operands : [record.cwd];
};
const recursive = (ctx, record) => ctx.flag(record, 'r') || ctx.flag(record, 'R');
const removed = (ctx, path) => !ctx.node(path) && ctx.ran('rm', record => ctx.hasPath(record, path));
const removedDir = (ctx, path) => !ctx.node(path) && ctx.ran('rm', record => recursive(ctx, record) && ctx.hasPath(record, path));
const plainRmOnDir = (ctx, path) => ctx.tried('rm', record => record.status !== 0 && !recursive(ctx, record) && ctx.hasPath(record, path) && isDir(ctx, path));
const rmdirRefused = (ctx, path) => ctx.tried('rmdir', record => record.status !== 0 && ctx.hasPath(record, path) && isFullDir(ctx, path));
const dirsIn = (ctx, path) => Object.keys(ctx.node(path)?.children ?? {}).map(name => `${path}/${name}`).filter(child => isDir(ctx, child));
const fullDirsIn = (ctx, path) => dirsIn(ctx, path).filter(child => isFullDir(ctx, child));
const triedRmdirOnFull = ctx => fullDirsIn(ctx, junkOf(ctx)).some(path => rmdirRefused(ctx, path));

const BOOTS_GONE = 'The old boots are gone, and rm has no undo. Press Restart chapter in the HUD to get them back.';
const bootsNote = ctx => (ctx.node(bootsOf(ctx))?.type === 'file' ? null : BOOTS_GONE);
// The first note that applies: the boots before anything else.
const firstNote = (ctx, notes) => bootsNote(ctx) ?? notes.find(([when]) => when(ctx))?.[1] ?? null;

const lostFile = (path, name) => [
  ctx => !ctx.node(path(ctx)),
  `The ${name} left ~/junk without rm. Make it again with touch, then throw it away with rm.`,
];

function setupBoss(random, { home, user }) {
  const base = restore('junk', { home, user })[0].node;
  const owned = { owner: user };
  const names = { file: `junk_${token(random, 3)}.txt`, crate: `crate_${token(random, 3)}`, pile: `pile_${token(random, 3)}` };
  const parts = PILE_PARTS.slice(0, 2 + Math.floor(random() * 2));
  const pile = Object.fromEntries(parts.map(part => [part, file('Rusty and useless.\n', owned)]));
  if (random() < 0.5) pile.bottom = dir({ 'mud.txt': file('Thick, cold mud.\n', owned) }, owned);
  const junk = {
    ...base,
    children: {
      [BOOTS]: base.children[BOOTS],
      [names.file]: file('A broken pot nobody wants.\n', owned),
      [names.crate]: dir({}, owned),
      [names.pile]: dir(pile, owned),
    },
  };
  const at = name => `${home}/junk/${name}`;
  const secret = { file: at(names.file), crate: at(names.crate), pile: at(names.pile), boots: base.children[BOOTS].content };
  return { patch: [put(`${home}/junk`, junk), cd(home)], secret };
}

function bossDone(ctx, { boots }) {
  const junk = ctx.node(junkOf(ctx));
  return junk?.type === 'dir' && Object.keys(junk.children).join('/') === BOOTS && junk.children[BOOTS].content === boots;
}

function bossNear(ctx, { boots }) {
  const dirs = dirsIn(ctx, junkOf(ctx));
  const changed = ctx.node(bootsOf(ctx))?.content !== boots;
  return firstNote(ctx, [
    [() => changed, 'old_boots.txt no longer holds what it did. Press Restart chapter in the HUD to get the boots back.'],
    [c => dirs.some(path => plainRmOnDir(c, path)), 'rm alone refuses a directory. Use rmdir for an empty one, and rm -r for one with things inside.'],
    [c => dirs.some(path => rmdirRefused(c, path)), 'That directory is not empty, so rmdir refuses. rm -r removes it with everything inside.'],
  ]);
}

function solveBoss(obs) {
  const junk = `${obs.home}/junk`;
  const children = nodeAt(obs.tree, junk).children;
  const lineFor = name => {
    const node = children[name];
    let line = `rm junk/${name}`;
    if (node.type === 'dir') line = Object.keys(node.children).length === 0 ? `rmdir junk/${name}` : `rm -r junk/${name}`;
    return line;
  };
  return ['ls junk', ...Object.keys(children).filter(name => name !== BOOTS).map(lineFor)];
}

const tilde = path => path.replace(/^\/home\/[^/]+/, '~');

export default {
  id: 'junkyard',
  act: 1,
  title: 'The Cursed Junkyard',
  setup: (_random, player) => [
    ...restore('junk', player),
    put(`${player.home}/junk/fish_bones.txt`, file('A heap of old fish bones. Even the cats gave up on them.\n', { owner: player.user })),
    put(`${player.home}/junk/broken_cart`, dir({
      'wheel.txt': file('A cracked wooden wheel.\n', { owner: player.user }),
      'plank.txt': file('A rotten plank with rusty nails.\n', { owner: player.user }),
    }, { owner: player.user })),
    cd(player.home),
  ],
  lesson: `<p>A curse has filled the junkyard with clutter. To clean it you need the commands that remove things:</p>
<ul>
<li><code>rm rotten_apple.txt</code> (remove) removes a file.</li>
<li><code>rmdir empty_crate</code> (remove directory) removes a directory, but only an empty one. On a directory with something inside, it refuses with "Directory not empty".</li>
<li><code>rm</code> alone refuses a directory too, with "Is a directory". <code>rm -r cobwebs</code> (recursive) removes the directory and everything inside it, all the way down.</li>
</ul>
<p>Careful: <code>rm</code> has no undo and no recycle bin. A removed file does not wait in a trash folder, so treat it as gone. Clean like this: look with <code>ls</code> first, remove exactly what you mean to, then look again with <code>ls</code> to check.</p>
<p><code>rm -i</code> (interactive) asks before each removal, like "rm: remove regular file 'rotten_apple.txt'?", and waits for <code>y</code> (yes) or <code>n</code> (no). In this game, it answers yes for you.</p>`,
  tasks: [
    {
      goal: 'Look at the junkyard before you clean it `~/junk`',
      tip: 'Before you remove anything, list it with `ls`, so you know exactly what is there.',
      hints: [
        'You already know the command that lists a directory.',
        'Give `ls` the junkyard\'s path.',
        'ls ~/junk',
      ],
      done: ctx => ctx.ran('ls', record => !ctx.flag(record, 'd') && listed(ctx, record).includes(junkOf(ctx))),
      near: ctx => bootsNote(ctx),
    },
    {
      goal: 'Throw away the rotten apple `~/junk/rotten_apple.txt` (`rm` removes a file, for good)',
      tip: '`rm` and a file\'s path removes the file: there is no undo and no recycle bin.',
      hints: [
        'Throwing away a file means removing it.',
        'Type `rm`, a space, and the apple\'s path.',
        'rm ~/junk/rotten_apple.txt',
      ],
      done: ctx => removed(ctx, appleOf(ctx)),
      near: ctx => firstNote(ctx, [lostFile(appleOf, 'rotten apple')]),
    },
    {
      goal: 'Throw away the fish bones `~/junk/fish_bones.txt`',
      tip: 'The command that threw away the apple removes any file, so check the path before you press Enter.',
      hints: [
        'This is just like the rotten apple.',
        'Use the same command with the fish bones\' path.',
        'rm ~/junk/fish_bones.txt',
      ],
      done: ctx => removed(ctx, bonesOf(ctx)),
      near: ctx => firstNote(ctx, [lostFile(bonesOf, 'fish bones')]),
    },
    {
      goal: 'Remove the empty crate `~/junk/empty_crate` (`rmdir` removes an empty directory)',
      tip: '`rm` alone refuses a directory, but `rmdir` removes one that is empty.',
      hints: [
        'The crate is a directory with nothing inside.',
        'Type `rmdir`, a space, and the crate\'s path.',
        'rmdir ~/junk/empty_crate',
      ],
      done: ctx => !ctx.node(crateOf(ctx)) && ctx.ran('rmdir', record => ctx.hasPath(record, crateOf(ctx))),
      near: ctx => firstNote(ctx, [
        [c => plainRmOnDir(c, crateOf(c)), 'rm alone refuses a directory ("Is a directory"). The crate is empty, so rmdir removes it.'],
        [c => !c.node(crateOf(c)), 'The crate left ~/junk without rmdir. Make it again with mkdir ~/junk/empty_crate, then remove it with rmdir.'],
      ]),
    },
    {
      goal: 'Try `rmdir` on the cobwebs `~/junk/cobwebs`, and read why it refuses',
      tip: '`rmdir` removes only empty directories, so on a full one it fails with "Directory not empty".',
      hints: [
        'The cobwebs directory still holds files. See what `rmdir` says about that.',
        'Type `rmdir` and the cobwebs\' path, then read the error.',
        'rmdir ~/junk/cobwebs',
      ],
      done: triedRmdirOnFull,
      near: ctx => firstNote(ctx, [
        [c => fullDirsIn(c, junkOf(c)).length === 0, 'No full directory is left in ~/junk. Make one: mkdir ~/junk/box; touch ~/junk/box/stone.txt, then try rmdir ~/junk/box.'],
      ]),
    },
    {
      goal: 'Sweep away the cobwebs `~/junk/cobwebs` and everything in them (`rm` with `-r`, recursive)',
      tip: '`rm -r` removes a directory with everything inside it, all the way down, so look before you use it.',
      hints: [
        'The cobwebs are a directory full of files, and `rmdir` refuses it.',
        'Add the option `-r` (recursive) to `rm`, then the cobwebs\' path.',
        'rm -r ~/junk/cobwebs',
      ],
      done: ctx => removedDir(ctx, cobwebsOf(ctx)),
      near: ctx => firstNote(ctx, [
        [c => plainRmOnDir(c, cobwebsOf(c)), 'rm alone refuses a directory. Add -r (recursive) to remove it with everything inside.'],
        [c => rmdirRefused(c, cobwebsOf(c)), 'rmdir refuses a full directory. rm -r removes it with everything inside.'],
        [c => !c.node(cobwebsOf(c)), 'The cobwebs left without rm -r. Make them again: mkdir ~/junk/cobwebs; touch ~/junk/cobwebs/web.txt, then use rm -r.'],
      ]),
    },
    {
      goal: 'Break up the broken cart `~/junk/broken_cart` and everything in it',
      tip: 'A directory with things inside needs the recursive option, just like the cobwebs.',
      hints: [
        'The cart is a directory with parts inside, like the cobwebs.',
        'Use `rm` with `-r` and the cart\'s path.',
        'rm -r ~/junk/broken_cart',
      ],
      done: ctx => removedDir(ctx, cartOf(ctx)),
      near: ctx => firstNote(ctx, [
        [c => plainRmOnDir(c, cartOf(c)) || rmdirRefused(c, cartOf(c)), 'The cart is a directory with parts inside. Add -r (recursive) to rm to remove it all.'],
        [c => !c.node(cartOf(c)), 'The cart left without rm -r. Make it again: mkdir ~/junk/broken_cart; touch ~/junk/broken_cart/wheel.txt, then use rm -r.'],
      ]),
    },
  ],
  solve: [
    'ls junk',
    'rm junk/rotten_apple.txt',
    'rm junk/fish_bones.txt',
    'rmdir junk/empty_crate',
    'rmdir junk/cobwebs',
    'rm -r junk/cobwebs',
    'rm -r junk/broken_cart',
  ],
  boss: {
    title: 'The Overnight Pile',
    briefing: `<p>Overnight, new junk appeared in <code>~/junk</code>: one file, one empty directory and one full directory. Their names are random, so look first with <code>ls ~/junk</code>. Clean the junkyard so that only <code>old_boots.txt</code> is left.</p>`,
    setup: setupBoss,
    hints: [
      'Look first: `ls ~/junk` shows the new names. Then check which ones are directories, and whether they are empty.',
      'Use `rm` for the file, `rmdir` for the empty directory and `rm -r` for the full one. Leave `old_boots.txt` alone.',
      secret => `rm ${tilde(secret.file)}; rmdir ${tilde(secret.crate)}; rm -r ${tilde(secret.pile)}`,
    ],
    done: bossDone,
    near: bossNear,
    hidden: secret => [secret.file, secret.crate, secret.pile],
    solve: solveBoss,
  },
  recap: [
    ['ls ~/junk', 'look before you remove, and again after'],
    ['rm ~/junk/rotten_apple.txt', 'remove a file; there is no undo'],
    ['rmdir ~/junk/empty_crate', 'remove an empty directory'],
    ['rm -r ~/junk/cobwebs', 'remove a directory and everything in it'],
    ['rm -i notes.txt', 'ask before each removal'],
  ],
  why: `<p>Why is there no recycle bin? The trash folder you may know from a desktop belongs to the file manager, which moves files there instead of removing them. <code>rm</code> does not move anything: it asks the system to delete a name from its directory (the system call is <code>unlink</code>). When the last name of a file is gone and no program has it open, the file is deleted and its space can be reused for new data.</p>
<p>Why does <code>rmdir</code> refuse a full directory? It is a safety net. The system call behind it removes only an empty directory, so one typo cannot wipe out a pile of files. To remove a directory with everything in it, you have to say so with <code>-r</code>.</p>
<p>Why the name recursive? <code>rm -r</code> repeats the same job on every level: it goes into the directory, removes what is inside (going into each directory there too), and removes the directory itself last. <code>rm -ri</code> shows that order: it asks to descend into the directory, then about each file, then about the directory.</p>`,
  field: [
    ['rm -i FILE', 'ask before removing each file; type `y` for yes or `n` for no'],
    ['rm -ri DIR', 'remove a directory and everything in it, asking at every step'],
    ['rm -I FILES', 'ask once before removing more than three files, or before removing recursively'],
  ],
  spells: [
    { name: 'rm', summary: 'Remove files, for good: no undo, no recycle bin.', examples: [['rm notes.txt', 'remove a file'], ['rm -r old_camp', 'a directory and everything in it'], ['rm -i notes.txt', 'ask first']] },
    { name: 'rmdir', summary: 'Remove an empty directory. It refuses a full one.', examples: [['rmdir empty_crate', 'an empty directory']] },
  ],
};
