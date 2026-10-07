/**
 * Chapter 2, The Whispering Forest: cd, relative and absolute paths, `..`,
 * `~`, `cd -` and Tab. The boss room hides a lantern with a random name by the
 * river: the player finds it with ls, walks into it and goes home in one command.
 */
import { put, remove, cd, dir, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { NOTES } from './awakening.js';
import { token } from '../rng.js';
import { isInside, nodeAt } from '../../backend/tree.js';

const LANTERN = 'lantern_';

const forestOf = ctx => `${ctx.home}/forest`;
const deepOf = ctx => `${ctx.home}/forest/cave/deep`;
const caveOf = ctx => `${ctx.home}/forest/cave`;
const riverOf = ctx => `${ctx.home}/forest/river`;

const climbsWithDots = record => /^\.\.(\/|$)/.test(record.args[0] ?? '');
const isAbsolute = record => (record.args[0] ?? '').startsWith('/');
const lastCd = ctx => ctx.commands.findLast(record => record.name === 'cd');
const usedTab = ctx => ctx.completions.some(tab => tab.completed !== tab.line);
const walkedIntoForest = ctx => !isInside(ctx.before.cwd, forestOf(ctx)) && isInside(ctx.cwd, forestOf(ctx));
const steppedOutOfDeep = ctx => ctx.before.cwd === deepOf(ctx) && ctx.cwd === caveOf(ctx);

const reachedRiverRelatively = ctx => ctx.cwd === riverOf(ctx)
  && ctx.ran('cd', record => record.args.length > 0 && record.args[0] !== '-' && !isAbsolute(record));

function setupBoss(random, { home, user }) {
  const target = `${home}/forest/river/${LANTERN}${token(random, 3)}`;
  const light = file('A small lantern glows here. Now find your way home.\n', { owner: user });
  const patch = [
    ...restore('forest', { home, user }),
    put(target, dir({ 'light.txt': light }, { owner: user })),
    cd(home),
  ];
  return { patch, secret: { target } };
}

// The line's last cd decides where the player stands, so it is the step home that is judged.
function wentHomeFromLantern(ctx, target) {
  const step = lastCd(ctx);
  return ctx.cwd === ctx.home && step?.status === 0 && step.cwd === target;
}

function bossNear(ctx, target) {
  const step = lastCd(ctx);
  const cameHome = ctx.cwd === ctx.home && step?.status === 0 && ctx.before.cwd !== ctx.home;
  return cameHome && !wentHomeFromLantern(ctx, target)
    ? 'You are home, but the lantern is not found yet. Its name starts with lantern_: ls ~/forest/river shows it.'
    : null;
}

function solveBoss(obs) {
  const river = `${obs.home}/forest/river`;
  const name = Object.keys(nodeAt(obs.tree, river).children).find(child => child.startsWith(LANTERN));
  return ['ls forest/river', `cd forest/river/${name}`, 'cd'];
}

export default {
  id: 'forest',
  act: 1,
  title: 'The Whispering Forest',
  setup: (_random, player) => [
    ...restore('forest', player),
    ...NOTES.map(name => remove(`${player.home}/${name}`)),
    cd(player.home),
  ],
  lesson: `<p>Linux keeps everything in one tree of directories. The tree starts at <code>/</code>, the <b>root directory</b>. Your home, <code>/home/hero</code>, is one branch of it. On the map, each room is a directory. Its doors lead into the directories inside it, and the way out leads to its <b>parent</b>, the directory that holds it.</p>
<p><code>cd</code> (change directory) walks you from room to room. Tell it where to go with a <b>path</b>:</p>
<ul>
<li>A <b>relative path</b> starts from where you are: <code>cd forest</code>. Slashes go several rooms deeper at once: <code>cd forest/cave</code>.</li>
<li>An <b>absolute path</b> starts at the root with <code>/</code>, so it works from anywhere: <code>cd /home/hero/forest</code>.</li>
<li><code>..</code> is the parent directory: <code>cd ..</code> takes you one level up the tree, toward <code>/</code>. People say up because diagrams draw <code>/</code> at the top. Kernelia draws the tree the way trees grow, with its root underground: from your home, the way toward <code>/</code> leads down the stairs into the dungeon.</li>
<li><code>~</code> stands for your home, so <code>cd ~/forest</code> also works from anywhere.</li>
<li><code>cd</code> on its own takes you home. <code>cd -</code> jumps back to the directory you were in before, and prints its path.</li>
</ul>
<p>Paths work with other commands too: <code>ls ~/forest</code> lists the forest from wherever you stand.</p>
<p>Press <kbd>Tab</kbd> to finish a name: type <code>cd fo</code>, press <kbd>Tab</kbd>, and the shell writes <code>cd forest/</code> for you. When several names match, press <kbd>Tab</kbd> again to list them.</p>`,
  tasks: [
    {
      goal: 'Enter the forest',
      tip: '`cd` followed by a directory name walks you into it.',
      hints: [
        'The forest is a door in your home. Walk through it.',
        'From your home, `cd` followed by a directory name moves you into that directory.',
        'cd forest',
      ],
      done: ctx => isInside(ctx.cwd, forestOf(ctx)),
      near: ctx => (ctx.ran('ls', record => ctx.hasPath(record, forestOf(ctx))) && !isInside(ctx.cwd, forestOf(ctx))
        ? 'That looked into the forest from outside. To walk in, use cd forest.' : null),
    },
    {
      goal: 'Go deeper into the cave, all the way to `forest/cave/deep`',
      tip: 'A path with slashes goes several rooms deeper at once, like `cd cave/deep` from the forest.',
      hints: [
        'The cave is in the forest, and deep is inside the cave.',
        'Walk one room at a time with `cd`, or give `cd` a path with slashes, like `cave/deep` from the forest.',
        'cd ~/forest/cave/deep',
      ],
      done: ctx => ctx.cwd === deepOf(ctx),
    },
    {
      goal: 'Read what glitters in there',
      tip: '`ls` shows the names in the room you are in, and `cat` prints a file.',
      hints: [
        'Something glitters in deep. List the room to learn its name.',
        '`ls` shows the file name, then `cat` prints the file.',
        'cat ~/forest/cave/deep/ancient_key.txt',
      ],
      done: ctx => ctx.read(`${deepOf(ctx)}/ancient_key.txt`),
    },
    {
      goal: 'From deep, step back out into the cave with `..`',
      tip: '`..` is the parent directory, so `cd ..` from deep steps back out into the cave.',
      hints: [
        'deep is inside the cave, so the cave is its parent.',
        '`..` means the parent of the directory you are in. Stand in deep first.',
        'cd ..',
      ],
      done: ctx => steppedOutOfDeep(ctx) && ctx.ran('cd', climbsWithDots),
      near: ctx => (steppedOutOfDeep(ctx) && !ctx.ran('cd', climbsWithDots)
        ? 'You reached the cave, but without .. this time. Go back into deep and type cd .. to step back out.' : null),
    },
    {
      goal: 'Jump to the river with an absolute path: `cd ~/forest/river`',
      tip: '`~` is your home\'s absolute path, `/home/hero`, so `~/forest/river` is the same as `/home/hero/forest/river` and works from anywhere.',
      hints: [
        'An absolute path works from anywhere, because it starts at the root of the tree, `/`. `~` is short for `/home/hero`.',
        'Start the path with `~` and name every directory on the way: forest, then river.',
        'cd ~/forest/river',
      ],
      done: ctx => ctx.cwd === riverOf(ctx)
        && ctx.ran('cd', record => isAbsolute(record) && ctx.hasPath(record, riverOf(ctx))),
      near: ctx => (reachedRiverRelatively(ctx) ? 'You reached the river with a relative path. This task wants an absolute one, starting with ~ or /: cd ~/forest/river.' : null),
    },
    {
      goal: 'Jump back to where you were with `cd -`',
      tip: '`cd -` jumps back to the directory you were in before, and prints its path.',
      hints: [
        'The shell remembers the directory you were in before this one.',
        'A dash after `cd` means: go back to the previous directory.',
        'cd -',
      ],
      done: ctx => ctx.ran('cd', record => record.args[0] === '-'),
    },
    {
      goal: 'Go home with the shortest command there is',
      tip: '`cd` with nothing after it takes you home.',
      hints: [
        'There is a way home that needs no path at all.',
        '`cd` with nothing after it takes you home.',
        'cd',
      ],
      done: ctx => ctx.cwd === ctx.home && ctx.ran('cd', record => record.args.length === 0),
      near: ctx => (ctx.cwd === ctx.home && ctx.ran('cd', record => record.args.length > 0)
        ? 'That works, but there is a shorter way home: cd on its own.' : null),
    },
    {
      goal: 'Walk into the forest again, and let Tab finish the name',
      tip: 'Type the first letters of a name, like `cd fo`, then press Tab to finish it.',
      hints: [
        'You do not have to type every letter of a name.',
        'Tab finishes a name from its first letters when only one name matches.',
        'Type cd fo, press Tab, then press Enter.',
      ],
      done: ctx => walkedIntoForest(ctx) && usedTab(ctx),
      near: ctx => (walkedIntoForest(ctx) && !usedTab(ctx)
        ? 'You typed the whole name. Try cd fo and press Tab.' : null),
    },
  ],
  solve: ['cd forest', 'cd cave/deep', 'cat ancient_key.txt', 'cd ..', 'cd /home/hero/forest/river', 'cd -', 'cd', 'cd fo\t'],
  boss: {
    title: 'The Lost Lantern',
    briefing: `<p>Someone left a lantern by the river. It is a directory inside <code>~/forest/river</code> whose name starts with <code>lantern_</code>. Find its full name with <code>ls</code>, walk into it with one <code>cd</code>, then go home with one command.</p>`,
    setup: setupBoss,
    hints: [
      '`ls` can look into a directory without walking into it, if you give it a path.',
      'Run `ls ~/forest/river`, then `cd ~/forest/river/` followed by the lantern\'s name. From there, `cd` alone takes you home.',
      ({ target }) => `cd ${target.replace(/^\/home\/[^/]+/, '~')}; cd`,
    ],
    done: (ctx, { target }) => wentHomeFromLantern(ctx, target),
    near: (ctx, { target }) => bossNear(ctx, target),
    solve: solveBoss,
  },
  recap: [
    ['cd forest', 'enter a directory with a relative path'],
    ['cd forest/cave', 'go several rooms deep at once'],
    ['cd ..', 'step back out to the parent directory'],
    ['cd /home/hero/forest', 'an absolute path works from anywhere'],
    ['cd ~/forest', '`~` is your home'],
    ['cd', 'go home'],
    ['cd -', 'go back to the previous directory'],
    ['ls ~/forest', 'paths work with other commands too'],
    ['cd fo', 'then press Tab to finish the name'],
  ],
  why: `<p>Why one tree? On Linux, every disk, USB stick and network share appears as a directory somewhere in the tree that starts at <code>/</code>, once it is mounted. There are no drive letters like <code>C:</code>, so one absolute path names one place.</p>
<p>Why two kinds of path? A relative path is short when the place is near. An absolute path means the same place wherever you stand, which is why configuration files and scripts often use them.</p>
<p>Why <code>~</code>? Your home is where your own files live, and you go there more than anywhere else. Bash replaces <code>~</code> with your home's path before the command runs, so <code>cd ~/forest</code> is really <code>cd /home/hero/forest</code>.</p>`,
  field: [
    ['ls /', 'look at the root of a real tree: `bin`, `etc`, `home`, `usr`, `var` and more'],
    ['cd /etc', 'the directory where system settings live'],
    ['pushd /tmp', 'like `cd`, but remembers where you were; `popd` takes you back'],
  ],
  spells: [
    {
      name: 'cd',
      summary: 'Change directory.',
      examples: [['cd forest', 'relative path'], ['cd ..', 'back out to the parent'], ['cd /home/hero', 'absolute path'], ['cd ~/forest', '`~` is your home'], ['cd', 'go home'], ['cd -', 'back to the previous directory']],
    },
    { name: 'Tab', summary: 'Finish a name for you. Type the first letters, then press Tab.', examples: [['cd fo', 'then press Tab']] },
  ],
};
