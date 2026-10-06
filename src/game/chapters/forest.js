/**
 * Chapter 2, The Whispering Forest: cd, relative and absolute paths, `..`,
 * `~`, `cd -` and Tab. The boss room drops the player into the dungeon; they
 * must find a beacon in the forest with ls and reach it with one absolute cd.
 */
import { put, remove, cd, dir, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { LETTERS } from './awakening.js';
import { pick, token } from '../rng.js';
import { isInside, directoriesUnder } from './kit.js';

const DROPS = ['/var/log', '/var/log/apt', '/tmp', '/etc'];
const SPOTS = ['', '/clearing', '/river', '/cave', '/cave/deep'];
const BEACON = 'beacon_';

const forestOf = ctx => `${ctx.home}/forest`;
const deepOf = ctx => `${ctx.home}/forest/cave/deep`;
const caveOf = ctx => `${ctx.home}/forest/cave`;
const riverOf = ctx => `${ctx.home}/forest/river`;

const climbsWithDots = record => /^\.\.(\/|$)/.test(record.args[0] ?? '');

function setupBoss(random, { home, user }) {
  const target = `${home}/forest${pick(random, SPOTS)}/${BEACON}${token(random, 3)}`;
  const flame = file('A warm flame. You found your way back with one absolute path.\n', { owner: user });
  const patch = [
    ...restore('forest', { home, user }),
    put(target, dir({ 'flame.txt': flame }, { owner: user })),
    cd(pick(random, DROPS)),
  ];
  return { patch, secret: { target } };
}

function jumpedFromDungeon(ctx, target) {
  const [record] = ctx.commands;
  return ctx.commands.length === 1
    && record.name === 'cd'
    && record.status === 0
    && (record.args[0] ?? '').startsWith('/')
    && !isInside(ctx.before.cwd, ctx.home)
    && ctx.cwd === target;
}

function solveBoss(obs) {
  const beacon = directoriesUnder(obs.tree, `${obs.home}/forest`)
    .find(path => path.slice(path.lastIndexOf('/') + 1).startsWith(BEACON));
  return [`cd ${beacon}`];
}

export default {
  id: 'forest',
  act: 1,
  title: 'The Whispering Forest',
  setup: (_random, player) => [
    ...restore('forest', player),
    ...LETTERS.map(name => remove(`${player.home}/${name}`)),
    cd(player.home),
  ],
  lesson: `<p>Linux keeps everything in one tree of directories. The tree starts at <code>/</code>, the <b>root directory</b>. Your home, <code>/home/hero</code>, is one branch of it. On the map, each room is a directory. Its doors lead into the directories inside it, and the way out leads to its <b>parent</b>, the directory that holds it.</p>
<p><code>cd</code> (change directory) walks you from room to room. Tell it where to go with a <b>path</b>:</p>
<ul>
<li>A <b>relative path</b> starts from where you are: <code>cd forest</code>. Slashes go several rooms deep at once: <code>cd forest/cave</code>.</li>
<li>An <b>absolute path</b> starts at the root with <code>/</code>, so it works from anywhere: <code>cd /home/hero/forest</code>.</li>
<li><code>..</code> is the parent directory: <code>cd ..</code> takes you one level up the tree, toward <code>/</code>. People say up because diagrams draw <code>/</code> at the top. Kernelia draws the tree the way trees grow, with its root underground: from your home, the way toward <code>/</code> leads down the stairs into the dungeon. A single <code>.</code> is the directory you are in.</li>
<li><code>~</code> stands for your home, so <code>cd ~/forest</code> also works from anywhere.</li>
<li><code>cd</code> on its own takes you home. <code>cd -</code> jumps back to the directory you were in before, and prints its path.</li>
</ul>
<p>Paths work with other commands too: <code>ls ~/forest</code> lists the forest from wherever you stand.</p>
<p>Press <kbd>Tab</kbd> to finish a name: type <code>cd fo</code>, press <kbd>Tab</kbd>, and the shell writes <code>cd forest/</code> for you. When several names match, press <kbd>Tab</kbd> again to list them.</p>`,
  tasks: [
    {
      goal: 'Enter the forest',
      hints: [
        'The forest is a door in your home. Walk through it.',
        'From your home, cd followed by a directory name moves you into that directory.',
        'cd forest',
      ],
      done: ctx => isInside(ctx.cwd, forestOf(ctx)),
    },
    {
      goal: 'Walk down to the deepest part of the cave: forest/cave/deep',
      hints: [
        'The cave is in the forest, and deep is inside the cave.',
        'Walk one room at a time with cd, or give cd a path with slashes, like cave/deep from the forest.',
        'cd ~/forest/cave/deep',
      ],
      done: ctx => ctx.cwd === deepOf(ctx),
    },
    {
      goal: 'Read what glitters down there',
      hints: [
        'Something glitters in deep. List the room to learn its name.',
        'ls shows the file name, then cat prints the file.',
        'cat ~/forest/cave/deep/ancient_key.txt',
      ],
      done: ctx => ctx.read(`${deepOf(ctx)}/ancient_key.txt`),
    },
    {
      goal: 'From deep, climb back up into the cave with ..',
      hints: [
        'deep is inside the cave, so the cave is its parent.',
        '.. means the parent of the directory you are in. Stand in deep first.',
        'cd ..',
      ],
      done: ctx => ctx.before.cwd === deepOf(ctx) && ctx.cwd === caveOf(ctx) && ctx.ran('cd', climbsWithDots),
    },
    {
      goal: 'Jump to the river with an absolute path',
      hints: [
        'An absolute path works from anywhere, because it starts at the root of the tree, /.',
        'Start the path with / and name every directory on the way: home, hero, forest, river.',
        'cd /home/hero/forest/river',
      ],
      done: ctx => ctx.cwd === riverOf(ctx)
        && ctx.ran('cd', record => (record.args[0] ?? '').startsWith('/') && ctx.hasPath(record, riverOf(ctx))),
    },
    {
      goal: 'Jump back to where you were with cd -',
      hints: [
        'The shell remembers the directory you were in before this one.',
        'A dash after cd means: go back to the previous directory.',
        'cd -',
      ],
      done: ctx => ctx.ran('cd', record => record.args[0] === '-') && ctx.cwd !== ctx.before.cwd,
    },
    {
      goal: 'Go home with the shortest command there is',
      hints: [
        'There is a way home that needs no path at all.',
        'cd with nothing after it takes you home.',
        'cd',
      ],
      done: ctx => ctx.cwd === ctx.home && ctx.ran('cd', record => record.args.length === 0),
    },
    {
      goal: 'Walk into the forest again, and let Tab finish the name',
      hints: [
        'You do not have to type every letter of a name.',
        'Tab finishes a name from its first letters when only one name matches.',
        'Type cd fo, press Tab, then press Enter.',
      ],
      done: ctx => !isInside(ctx.before.cwd, forestOf(ctx)) && isInside(ctx.cwd, forestOf(ctx))
        && ctx.completions.some(tab => tab.completed !== tab.line),
    },
  ],
  solve: ['cd forest', 'cd cave/deep', 'cat ancient_key.txt', 'cd ..', 'cd /home/hero/forest/river', 'cd -', 'cd', 'cd fo\t'],
  boss: {
    title: 'The Trapdoor',
    briefing: `<p>Crack! A trapdoor opens under your feet. You fall out of your home and land in the dungeon: the part of the system outside <code>~</code>, where most things belong to root. Look at your prompt: it now shows the full path of where you landed.</p>
<p>The Guardian has lit a beacon somewhere in the forest: a directory whose name starts with <code>beacon_</code>. Find it from where you stand, then reach it with a single <code>cd</code> and an absolute path. The jump only counts if you take it from the dungeon.</p>`,
    setup: setupBoss,
    hints: [
      'ls can look into another directory from where you stand, if you give it a path.',
      'Search with ls ~/forest, then ls ~/forest/NAME for each room. Jump with cd and a path that starts with / or ~.',
      secret => `cd ${secret.target}`,
    ],
    done: (ctx, secret) => jumpedFromDungeon(ctx, secret.target),
    solve: solveBoss,
  },
  recap: [
    ['cd forest', 'enter a directory with a relative path'],
    ['cd forest/cave', 'go several rooms deep at once'],
    ['cd ..', 'go up to the parent directory'],
    ['cd /home/hero/forest', 'an absolute path works from anywhere'],
    ['cd ~/forest', '~ is your home'],
    ['cd', 'go home'],
    ['cd -', 'go back to the previous directory'],
    ['ls ~/forest', 'paths work with other commands too'],
    ['cd fo', 'then press Tab to finish the name'],
  ],
  why: `<p>Why one tree? On Linux, every disk, USB stick and network share appears as a directory somewhere in the tree that starts at <code>/</code>, once it is mounted. There are no drive letters like <code>C:</code>, so one absolute path names one place.</p>
<p>Why two kinds of path? A relative path is short when the place is near. An absolute path means the same place wherever you stand, which is why configuration files and scripts often use them.</p>
<p>Why <code>~</code>? Your home is where your own files live, and you go there more than anywhere else. Bash replaces <code>~</code> with your home's path before the command runs, so <code>cd ~/forest</code> is really <code>cd /home/hero/forest</code>.</p>`,
  field: [
    ['ls /', 'look at the root of a real tree: bin, etc, home, usr, var and more'],
    ['cd /etc', 'the directory where system settings live'],
    ['pushd /tmp', 'like cd, but remembers where you were; popd takes you back'],
  ],
  spells: [
    {
      name: 'cd',
      summary: 'Change directory.',
      examples: [['cd forest', 'relative path'], ['cd ..', 'up to the parent'], ['cd /home/hero', 'absolute path'], ['cd ~/forest', '~ is your home'], ['cd', 'go home'], ['cd -', 'back to the previous directory']],
    },
    { name: 'Tab', summary: 'Finish a name for you. Type the first letters, then press Tab.', examples: [['cd fo', 'then press Tab']] },
  ],
};
