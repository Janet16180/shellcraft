/**
 * Chapter 4, Build a Camp: mkdir, touch, `echo >`, cp and mv (moving and
 * renaming). The boss room lays a flint with a random name by the river: the
 * player makes a fire pit in the camp, moves the flint into it and writes a
 * file that lights the fire.
 */
import { put, remove, cd, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { token } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const FLINT = 'flint_';
const LIT = 'lit\n';
const WOOD = 'wood\n';

const campOf = ctx => `${ctx.home}/camp`;
const tentOf = ctx => `${ctx.home}/camp/tent`;
const suppliesOf = ctx => `${ctx.home}/camp/supplies.txt`;
const packOf = ctx => `${ctx.home}/camp/pack.txt`;
const keyOf = ctx => `${ctx.home}/forest/cave/deep/ancient_key.txt`;
const keyCopyOf = ctx => `${ctx.home}/camp/ancient_key.txt`;
const mushroomOf = ctx => `${ctx.home}/forest/clearing/mushroom.txt`;
const tentMushroomOf = ctx => `${ctx.home}/camp/tent/mushroom.txt`;

const isDir = (ctx, path) => ctx.node(path)?.type === 'dir';
const isFile = (ctx, path) => ctx.node(path)?.type === 'file';
const made = (ctx, name, path) => ctx.ran(name, record => ctx.hasPath(record, path));
// mkdir -p ~/camp/tent makes the camp too, and mkdir ~/camp on an existing camp only says File exists.
const madeDir = (ctx, path) => ctx.tried('mkdir', record => ctx.paths(record).some(p => p === path || p.startsWith(`${path}/`)));
const writesInto = (ctx, path) => ctx.ran('echo', record => record.redirects.some(r => (r.op === '>' || r.op === '>>') && r.target === path));
const echoedOnScreen = ctx => ctx.ran('echo', record => record.redirects.length === 0 && record.stage === record.stages - 1);
const holdsOtherText = (ctx, path, text) => isFile(ctx, path) && ctx.node(path).content !== text;

function setupBoss(random, { home, user }) {
  const flint = `${home}/forest/river/${FLINT}${token(random, 3)}.txt`;
  const patch = [
    ...restore('forest', { home, user }),
    remove(`${home}/camp/firepit`),
    put(flint, file('A grey flint stone. Strike it against steel and it sparks.\n', { owner: user })),
    cd(home),
  ];
  return { patch, secret: { flint } };
}

const pitOf = ctx => `${ctx.home}/camp/firepit`;
const nameOf = path => path.slice(path.lastIndexOf('/') + 1);

function bossDone(ctx, { flint }) {
  const pit = pitOf(ctx);
  return isDir(ctx, pit) && isFile(ctx, `${pit}/${nameOf(flint)}`) && !ctx.node(flint)
    && ctx.node(`${pit}/fire.txt`)?.content === LIT;
}

function bossNear(ctx, { flint }) {
  const pit = pitOf(ctx);
  let note = null;
  if (!isDir(ctx, campOf(ctx))) note = 'Your camp is gone. Make it again with mkdir ~/camp, then make the fire pit inside it.';
  else if (ctx.node(flint) && isFile(ctx, `${pit}/${nameOf(flint)}`)) note = 'The flint is still by the river: cp made a copy. Use mv to move it.';
  else if (!ctx.node(flint) && isFile(ctx, pit)) note = 'There was no firepit directory, so mv renamed the flint to firepit. Move it back with mv ~/camp/firepit ~/forest/river/' + nameOf(flint) + ', then mkdir ~/camp/firepit first.';
  else if (!ctx.node(flint) && !isFile(ctx, `${pit}/${nameOf(flint)}`) && ctx.ran('mv')) note = `The flint must keep its name, ${nameOf(flint)}: move it into the fire pit directory, not to a new name.`;
  else if (holdsOtherText(ctx, `${pit}/fire.txt`, LIT)) note = 'fire.txt should hold exactly the word lit: echo lit > ~/camp/firepit/fire.txt.';
  return note;
}

function solveBoss(obs) {
  const river = `${obs.home}/forest/river`;
  const name = Object.keys(nodeAt(obs.tree, river).children).find(child => child.startsWith(FLINT));
  return ['ls forest/river', 'mkdir camp/firepit', `mv forest/river/${name} camp/firepit`, 'echo lit > camp/firepit/fire.txt'];
}

export default {
  id: 'camp',
  act: 1,
  title: 'Build a Camp',
  setup: (_random, player) => [
    ...restore('forest', player),
    remove(`${player.home}/camp`),
    cd(player.home),
  ],
  lesson: `<p>So far you have looked around. Now you build. These commands make things and move them:</p>
<ul>
<li><code>mkdir camp</code> (make directory) makes a new, empty directory.</li>
<li><code>touch notes.txt</code> makes an empty file. On a file that already exists, it only updates the file's time.</li>
<li><code>echo hello > notes.txt</code> writes text into a file. The <code>></code> sends what <code>echo</code> prints into the file instead of onto the screen. Careful: <code>></code> replaces everything that was in the file. If the file does not exist, it is made.</li>
<li><code>cp FROM TO</code> (copy) copies a file. The original stays where it was. If TO is a directory, the copy goes inside it, with the same name.</li>
<li><code>mv FROM TO</code> (move) moves a file, so it leaves its old place. Moving a file to a new name in the same directory renames it: <code>mv notes.txt diary.txt</code>.</li>
</ul>
<p>All of them take paths, so they work from anywhere: <code>mkdir ~/camp</code> makes your camp even when you stand in the cave.</p>`,
  tasks: [
    {
      goal: 'Pitch your camp: make a directory `~/camp` (`mkdir` makes directories)',
      tip: '`mkdir` and a name makes a new, empty directory.',
      hints: [
        'A camp is a new room in your home, and rooms are directories.',
        'Type `mkdir`, a space, and the path of the new directory.',
        'mkdir ~/camp',
      ],
      done: ctx => isDir(ctx, campOf(ctx)) && madeDir(ctx, campOf(ctx)),
      near: ctx => (isFile(ctx, campOf(ctx)) ? 'That made a file named camp, not a directory. Remove it with rm camp, then use mkdir.' : null),
    },
    {
      goal: 'Put up a tent inside your camp: a directory `~/camp/tent`',
      tip: 'A path works with `mkdir` too, so you can make a directory inside another from anywhere.',
      hints: [
        'A tent is a directory inside the camp directory.',
        'Use the same command as for the camp, with the path `~/camp/tent`.',
        'mkdir ~/camp/tent',
      ],
      done: ctx => isDir(ctx, tentOf(ctx)) && madeDir(ctx, tentOf(ctx)),
    },
    {
      goal: 'Start a supply list: an empty file `~/camp/supplies.txt` (`touch` makes empty files)',
      tip: '`touch` and a file name makes an empty file.',
      hints: [
        'This time you need a file, not a directory.',
        'Type `touch`, a space, and the path of the new file.',
        'touch ~/camp/supplies.txt',
      ],
      done: ctx => isFile(ctx, suppliesOf(ctx)) && made(ctx, 'touch', suppliesOf(ctx)),
    },
    {
      goal: 'Write `wood` into your supply list (`echo wood > ~/camp/supplies.txt`)',
      tip: '`>` sends what `echo` prints into a file, and replaces everything that was in it.',
      hints: [
        '`echo` prints words. `>` decides where they go.',
        'After `echo wood`, add `>` and the path of the supply list.',
        'echo wood > ~/camp/supplies.txt',
      ],
      done: ctx => ctx.node(suppliesOf(ctx))?.content === WOOD && writesInto(ctx, suppliesOf(ctx)),
      near: ctx => {
        let note = null;
        if (writesInto(ctx, suppliesOf(ctx)) && holdsOtherText(ctx, suppliesOf(ctx), WOOD)) note = 'The list should hold exactly the word wood: echo wood > ~/camp/supplies.txt.';
        else if (echoedOnScreen(ctx)) note = 'echo printed on the screen. Add > and the file\'s path to send the words into the file.';
        return note;
      },
    },
    {
      goal: 'Copy the ancient key into your camp (`cp ~/forest/cave/deep/ancient_key.txt ~/camp`)',
      tip: '`cp` copies the file named first into the place named second, and the original stays.',
      hints: [
        'The key said: copy me and I will be in two places at once.',
        'After `cp`, give the key\'s path, then the camp\'s path.',
        'cp ~/forest/cave/deep/ancient_key.txt ~/camp',
      ],
      done: ctx => isFile(ctx, keyCopyOf(ctx)) && isFile(ctx, keyOf(ctx)) && made(ctx, 'cp', keyOf(ctx)),
      near: ctx => (isFile(ctx, keyCopyOf(ctx)) && !ctx.node(keyOf(ctx))
        ? 'That moved the key, so it left the cave. Put it back with mv ~/camp/ancient_key.txt ~/forest/cave/deep, then copy it with cp.' : null),
    },
    {
      goal: 'Carry the glowing mushroom `~/forest/clearing/mushroom.txt` into your tent (`mv` works like `cp`)',
      tip: '`mv` takes the same two paths as `cp`, but the file leaves its old place.',
      hints: [
        'This time the mushroom should leave the clearing, not be copied.',
        'After `mv`, give the mushroom\'s path, then the tent\'s path.',
        'mv ~/forest/clearing/mushroom.txt ~/camp/tent',
      ],
      done: ctx => isFile(ctx, tentMushroomOf(ctx)) && !ctx.node(mushroomOf(ctx)) && ctx.ran('mv'),
      near: ctx => (isFile(ctx, tentMushroomOf(ctx)) && isFile(ctx, mushroomOf(ctx))
        ? 'That made a copy: the mushroom is still in the clearing. mv moves it.' : null),
    },
    {
      goal: 'Rename your supply list `~/camp/supplies.txt` to `~/camp/pack.txt`',
      tip: 'Moving a file to a new name in the same directory renames it.',
      hints: [
        'Renaming is moving a file to a new name.',
        'The command that moved the mushroom renames too: the old path first, then the new one.',
        'mv ~/camp/supplies.txt ~/camp/pack.txt',
      ],
      done: ctx => isFile(ctx, packOf(ctx)) && !ctx.node(suppliesOf(ctx)) && ctx.ran('mv'),
      near: ctx => (isFile(ctx, packOf(ctx)) && isFile(ctx, suppliesOf(ctx)) && ctx.ran('cp')
        ? 'That made a copy, and supplies.txt is still there. mv renames it instead.' : null),
    },
  ],
  solve: [
    'mkdir camp',
    'mkdir camp/tent',
    'touch camp/supplies.txt',
    'echo wood > camp/supplies.txt',
    'cp forest/cave/deep/ancient_key.txt camp',
    'mv forest/clearing/mushroom.txt camp/tent',
    'mv camp/supplies.txt camp/pack.txt',
  ],
  boss: {
    title: 'The Fire Pit',
    briefing: `<p>Night is falling, and your camp needs a fire. A flint lies by the river: a file in <code>~/forest/river</code> whose name starts with <code>flint_</code>. Make a directory <code>~/camp/firepit</code>, move the flint into it, and write the word <code>lit</code> into a new file <code>~/camp/firepit/fire.txt</code>.</p>`,
    setup: setupBoss,
    hints: [
      'First learn the flint\'s full name: `ls ~/forest/river`.',
      'Use `mkdir` for the fire pit, `mv` for the flint, and `echo lit >` for fire.txt.',
      ({ flint }) => `mkdir ~/camp/firepit; mv ${flint.replace(/^\/home\/[^/]+/, '~')} ~/camp/firepit; echo lit > ~/camp/firepit/fire.txt`,
    ],
    done: bossDone,
    near: bossNear,
    hidden: ({ flint }) => [flint],
    solve: solveBoss,
  },
  recap: [
    ['mkdir camp', 'make a directory'],
    ['touch camp/list.txt', 'make an empty file'],
    ['echo wood > camp/list.txt', 'write into a file, replacing what was there'],
    ['cp ~/forest/cave/deep/ancient_key.txt ~/camp', 'copy a file into a directory; the original stays'],
    ['mv ~/camp/list.txt ~/camp/tent', 'move a file; it leaves its old place'],
    ['mv ~/camp/tent/list.txt ~/camp/tent/pack.txt', 'rename a file'],
  ],
  why: `<p>Why does <code>></code> replace a file? Bash opens the file for writing and empties it before <code>echo</code> even runs. Chapter 9 teaches <code>>></code>, which adds to the end instead.</p>
<p>Why is renaming the same as moving? A file's name is just an entry in a directory. <code>mv</code> changes that entry, so moving a file within the same file system (often, the same disk) is instant, however big the file is: its contents stay where they are. Between file systems, <code>mv</code> has to copy the file and then delete the original.</p>
<p>Why is it called <code>touch</code>? Its real job is to set a file's time to now, as if you had just touched it. Making the file when it does not exist is a side effect people find handy.</p>`,
  field: [
    ['mkdir -p a/b/c', 'make every missing directory on the way'],
    ['cp -r DIR COPY', 'copy a whole directory with everything in it'],
    ['cp -i FROM TO', 'ask before replacing a file that exists'],
  ],
  spells: [
    { name: 'mkdir', summary: 'Make a directory.', examples: [['mkdir camp', 'a new, empty directory'], ['mkdir ~/camp/tent', 'with a path, from anywhere']] },
    { name: 'touch', summary: 'Make an empty file, or update the time of one that exists.', examples: [['touch notes.txt', 'an empty file']] },
    { name: 'echo >', summary: 'Write text into a file, replacing what was in it.', examples: [['echo hello > notes.txt', 'the file now holds hello']] },
    { name: 'cp', summary: 'Copy a file. The original stays.', examples: [['cp notes.txt copy.txt', 'a copy with a new name'], ['cp notes.txt ~/camp', 'a copy inside a directory']] },
    { name: 'mv', summary: 'Move or rename a file.', examples: [['mv notes.txt ~/camp', 'move it into a directory'], ['mv notes.txt diary.txt', 'rename it']] },
  ],
};
