/**
 * Chapter 17, Portals: file types and links. The first character of ls -l
 * (- file, d directory, l link), ln -s for a soft link (a name that points at
 * another name: a portal), cd through it, ln for a hard link (a second name
 * for the same data, the same inode), rm of one name, a dangling soft link,
 * and ln -sf to repair it. The boss maze hides its vaults behind a directory
 * that cannot be listed: the player repairs the broken gate to the vault the
 * map names, goes through it and writes down the treasure's word.
 */
import { put, remove, cd, dir, file, symlink } from '../../backend/spec.js';
import { token, shuffle } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';
import { resolvePath } from '../checks.js';

const SCROLL_TEXT = 'The Scroll of Two Names. Whatever name you read me by, I am the same scroll.\n';

const portalOf = ctx => `${ctx.home}/portal`;
const deepOf = ctx => `${ctx.home}/forest/cave/deep`;
const areaOf = ctx => `${ctx.home}/portals`;
const scrollOf = ctx => `${areaOf(ctx)}/scroll.txt`;
const copyOf = ctx => `${areaOf(ctx)}/copy.txt`;
const oldOf = ctx => `${areaOf(ctx)}/old_portal`;
const tilde = path => path.replace(/^\/home\/[^/]+/, '~');

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;
const isLink = (ctx, path) => ctx.linkTarget(path) !== null;
// The path a soft link's target text names, read from the link's own directory.
const pointsAt = (ctx, path) => (isLink(ctx, path) ? resolvePath(ctx.linkTarget(path), path.slice(0, path.lastIndexOf('/')), ctx.home) : null);
const sameData = (ctx, a, b) => ctx.inode(a) !== null && ctx.inode(a) === ctx.inode(b);
const listed = (ctx, record) => (ctx.paths(record).length > 0 ? ctx.paths(record) : [record.cwd]);
const failedRead = (ctx, path) => ctx.commands.some(r => ['cat', 'less', 'more', 'head', 'tail'].includes(r.name) && r.status !== 0 && ctx.hasPath(r, path));

function setupBoss(random, { home, user }) {
  const maze = `${home}/maze`;
  const [treasure, ...decoys] = Array.from({ length: 4 }, () => `vault_${token(random, 3)}`);
  const lost = `vault_${token(random, 3)}`;
  const word = token(random, 5);
  const mine = { owner: user };
  const vaults = {
    [treasure]: dir({ 'treasure.txt': file(`The treasure of the maze. Its word is:\n${word}\n`, mine) }, mine),
    ...Object.fromEntries(decoys.slice(0, 2).map(name => [name, dir({ 'dust.txt': file('Only dust here.\n', mine) }, mine)])),
  };
  const targets = [`${maze}/vaults/${lost}`, ...decoys.slice(0, 2).map(name => `${maze}/vaults/${name}`)];
  if (random() < 0.5) targets.push(`${home}/forest`);
  const gates = targets.map(target => [`gate_${token(random, 3)}`, target]);
  const map = `THE MAP OF THE MAZE
The treasure is in ~/maze/vaults/${treasure}.
Its gate broke when the vault got a new name.
ls -l ~/maze shows where each gate leads. Try each gate with ls: the broken one says No such file or directory.\nPoint the broken gate at the vault again.
Then go through it and write the word you find into ~/maze/answer.txt.
`;
  const children = {
    'map.txt': file(map, mine),
    vaults: dir(vaults, { owner: user, mode: 0o311 }),
    ...Object.fromEntries(shuffle(random, gates).map(([name, target]) => [name, symlink(target, mine)])),
  };
  return {
    patch: [remove(maze), put(maze, dir(children, mine)), cd(home)],
    secret: { gate: `${maze}/${gates[0][0]}`, vault: `${maze}/vaults/${treasure}`, word },
  };
}

// ln -sf onto a gate that leads to a directory puts a new link inside that directory.
const linkInVault = ctx => {
  const vaults = `${ctx.home}/maze/vaults`;
  return Object.keys(ctx.node(vaults)?.children ?? {}).some(name => Object.keys(ctx.node(`${vaults}/${name}`)?.children ?? {})
    .some(child => isLink(ctx, `${vaults}/${name}/${child}`)));
};
const answerOf = ctx => `${ctx.home}/maze/answer.txt`;
const answered = ctx => (ctx.node(answerOf(ctx))?.type === 'file' ? ctx.node(answerOf(ctx)).content.trim() : null);
const repaired = (ctx, { gate, vault }) => isLink(ctx, gate) && sameData(ctx, gate, vault);
const bossDone = (ctx, secret) => repaired(ctx, secret) && answered(ctx) === secret.word;

function bossNear(ctx, secret) {
  const { gate, vault, word } = secret;
  if (bossDone(ctx, secret)) return null;
  const fixed = repaired(ctx, secret);
  return firstNote([
    [() => ctx.node(gate) !== null && !isLink(ctx, gate), `The gate must stay a link. Remove it (rm -r ${tilde(gate)}), then ln -s ${tilde(vault)} ${tilde(gate)}.`],
    [() => !fixed && isLink(ctx, gate) && ctx.node(gate) !== null, `That gate now leads to ${ctx.linkTarget(gate)}, but map.txt names ${tilde(vault)}.`],
    [() => linkInVault(ctx), 'That gate already led to a directory, so ln put the new link inside it, and the gate is unchanged. The broken gate is the one that leads nowhere.'],
    [() => !fixed && answered(ctx) === word, 'That is the word, but the broken gate still leads nowhere. Find it (the gate that ls cannot go through) and point it at the vault with ln -sf.'],
    [() => fixed && answered(ctx) === null, `The gate works now. Go through it, read treasure.txt, and write its word into ~/maze/answer.txt.`],
    [() => fixed && answered(ctx) !== word, `answer.txt should hold only the word on the last line of treasure.txt: cat ${tilde(gate)}/treasure.txt.`],
  ]);
}

function solveBoss(obs) {
  const maze = `${obs.home}/maze`;
  const map = nodeAt(obs.tree, `${maze}/map.txt`).content;
  const vault = map.match(/treasure is in (\S+)\./)[1];
  const names = Object.keys(nodeAt(obs.tree, maze).children);
  const gate = names.find(name => name.startsWith('gate_') && nodeAt(obs.tree, `${maze}/${name}`) === null);
  const word = nodeAt(obs.tree, `${maze}/vaults/${vault.split('/').pop()}/treasure.txt`).content.trim().split('\n').pop();
  return ['cat ~/maze/map.txt', 'ls -l ~/maze', `ln -sf ${vault} ~/maze/${gate}`, `cat ~/maze/${gate}/treasure.txt`, `echo ${word} > ~/maze/answer.txt`];
}

export default {
  id: 'portals',
  act: 3,
  title: 'Portals',
  explainer: 'links',
  setup: (_random, { home, user }) => {
    const mine = { owner: user };
    return [
      remove(`${home}/portal`),
      remove(`${home}/maze`),
      put(`${home}/portals`, dir({
        'scroll.txt': file(SCROLL_TEXT, mine),
        old_portal: symlink(`${home}/portals/scroll.txt`, mine),
      }, mine)),
      cd(home),
    ];
  },
  lesson: `<p>The first character of each <code>ls -l</code> line is the <b class="perm-type">type</b>:</p>
<table class="chmod-ways">
<tr><th>Type</th><th>Means</th><th>Example</th></tr>
<tr><td><code>-</code></td><td>a file</td><td class="mono">-rw-r--r-- ... readme.txt</td></tr>
<tr><td><code>d</code></td><td>a directory</td><td class="mono">drwxr-xr-x ... forest</td></tr>
<tr><td><code>l</code></td><td>a link</td><td class="mono">lrwxrwxrwx ... portal -&gt; /home/hero/forest/cave/deep</td></tr>
</table>
<p>A name is only a pointer. The data of a file sits on the disk with a number, its <b>inode</b>; <code>ls -i</code> shows it. There are two kinds of links:</p>
<ul>
<li>A <b>soft link</b> (<code>ln -s TARGET NAME</code>) is a name that points at another name, a path. It works like a portal: <code>cd</code> into it and you are in the target. If the target is removed or renamed, the link points at nothing: it is broken.</li>
<li>A <b>hard link</b> (<code>ln TARGET NAME</code>, without <code>-s</code>) is a second name for the same data: both names have the same inode. Removing one name leaves the data, as long as another name points at it. The second column of <code>ls -l</code> counts the names.</li>
</ul>
<p><code>ln -sf TARGET NAME</code> replaces a link that is already there (<code>-f</code> means force). A soft link may point at a directory; a hard link may not.</p>`,
  tasks: [
    {
      goal: 'Look at the type of everything in your home (`ls -l ~`: the first character of each line)',
      tip: 'In `ls -l`, a line that starts with `-` is a file, and one that starts with `d` is a directory.',
      hints: [
        'The long listing starts each line with the type, then the permissions.',
        'Use `ls -l` with your home, `~`.',
        'ls -l ~',
      ],
      done: ctx => ctx.ran('ls', record => ctx.flag(record, 'l') && listed(ctx, record).includes(ctx.home)),
      near: ctx => (ctx.ran('ls', record => !ctx.flag(record, 'l') && listed(ctx, record).includes(ctx.home)) ? 'Add -l: the long listing starts each line with the type.' : null),
    },
    {
      goal: 'Make a portal `~/portal` that leads to `~/forest/cave/deep` (`ln -s`: the target first, then the new name)',
      tip: '`ln -s TARGET NAME` makes NAME a soft link that points at TARGET.',
      hints: [
        'A soft link is a new name that points at a path you already have.',
        '`ln -s`, then the target `~/forest/cave/deep`, then the new name `~/portal`.',
        'ln -s ~/forest/cave/deep ~/portal',
      ],
      done: ctx => ctx.ran('ln') && isLink(ctx, portalOf(ctx)) && sameData(ctx, portalOf(ctx), deepOf(ctx)),
      near: ctx => firstNote([
        [() => ctx.tried('ln', record => !ctx.flag(record, 's') && record.status !== 0), 'Without -s, ln makes a hard link, and a directory cannot have one. Add -s.'],
        [() => isLink(ctx, `${deepOf(ctx)}/portal`), 'The target comes first, then the new name: ln -s ~/forest/cave/deep ~/portal. Remove the wrong link with rm ~/forest/cave/deep/portal.'],
        [() => ctx.node(portalOf(ctx))?.type === 'dir' && !isLink(ctx, portalOf(ctx)), 'That made a copy, not a portal. Remove it with rm -r ~/portal, then use ln -s.'],
        [() => isLink(ctx, portalOf(ctx)) && !sameData(ctx, portalOf(ctx), deepOf(ctx)), `~/portal leads to ${ctx.linkTarget(portalOf(ctx))}. Replace it: ln -sf ~/forest/cave/deep ~/portal.`],
      ]),
    },
    {
      goal: 'See where `~/portal` points, in a long listing',
      tip: '`ls -l` shows a link as `l...`, its name, an arrow `->` and its target.',
      hints: [
        'The same long listing you used before, on the portal itself.',
        '`ls -l` and the path `~/portal`.',
        'ls -l ~/portal',
      ],
      // The arrow must reach the screen: ls -l ~/portal/ (with a slash) lists the cave instead.
      done: ctx => isLink(ctx, portalOf(ctx)) && (ctx.ran('ls', record => ctx.flag(record, 'l') && /(^|\/| )portal -> /m.test(record.stdout))
        || ctx.ran('readlink', record => ctx.hasPath(record, portalOf(ctx)))),
      near: ctx => firstNote([
        [() => isLink(ctx, `${deepOf(ctx)}/deep`), '~/portal already existed, so ln put a new link inside the cave. Remove it: rm ~/forest/cave/deep/deep.'],
        [() => ctx.ran('ls', record => ctx.paths(record).includes(portalOf(ctx))), 'That listed what is through the portal. ls -l ~/portal, with no / at the end, shows the portal itself.'],
      ]),
    },
    {
      goal: 'Step through the portal: go into `~/portal`',
      tip: 'A soft link to a directory works like the directory, so `cd` goes through it.',
      hints: [
        'Go into it like any directory.',
        '`cd` and the portal\'s path.',
        'cd ~/portal',
      ],
      done: ctx => ctx.cwd === portalOf(ctx),
      near: ctx => (ctx.cwd === deepOf(ctx) && ctx.before.cwd !== deepOf(ctx) && isLink(ctx, portalOf(ctx))
        ? 'You reached the cave the long way. Go through the portal instead: cd ~/portal.' : null),
    },
    {
      goal: 'Give the scroll `~/portals/scroll.txt` a second name, `~/portals/copy.txt` (`ln`, without `-s`: a hard link)',
      tip: '`ln TARGET NAME` makes NAME a second name for the same data.',
      hints: [
        'A hard link is made like a soft link, without `-s`.',
        '`ln`, the scroll\'s path, then the new name.',
        'ln ~/portals/scroll.txt ~/portals/copy.txt',
      ],
      done: ctx => ctx.ran('ln') && !isLink(ctx, copyOf(ctx)) && sameData(ctx, copyOf(ctx), scrollOf(ctx)),
      near: ctx => firstNote([
        [() => isLink(ctx, copyOf(ctx)), 'That is a soft link. Remove it (rm ~/portals/copy.txt), then use ln without -s.'],
        [() => ctx.node(copyOf(ctx)) && !sameData(ctx, copyOf(ctx), scrollOf(ctx)), 'That is a separate file, with its own inode. Remove it (rm ~/portals/copy.txt), then use ln.'],
      ]),
    },
    {
      goal: 'Compare both names with `ls -li ~/portals`: the same inode number in front, and 2 in the second column',
      tip: '`-i` shows the inode number of each name, and the second column of `-l` counts the names.',
      hints: [
        'Add `-i` to the long listing.',
        '`ls -li` and the path `~/portals`.',
        'ls -li ~/portals',
      ],
      done: ctx => sameData(ctx, copyOf(ctx), scrollOf(ctx)) && !isLink(ctx, copyOf(ctx))
        && ctx.ran('ls', record => ctx.flag(record, 'i') && ctx.flag(record, 'l') && listed(ctx, record).some(path => [areaOf(ctx), scrollOf(ctx), copyOf(ctx)].includes(path))),
    },
    {
      goal: 'Remove the first name, `~/portals/scroll.txt`, then read `~/portals/copy.txt`',
      tip: 'The data stays while any name points at it, so `copy.txt` still works.',
      hints: [
        'Two steps: `rm` one name, then `cat` the other.',
        '`rm ~/portals/scroll.txt`, then `cat ~/portals/copy.txt`.',
        'rm ~/portals/scroll.txt && cat ~/portals/copy.txt',
      ],
      done: ctx => ctx.node(scrollOf(ctx)) === null && !isLink(ctx, copyOf(ctx)) && ctx.read(copyOf(ctx)),
      near: ctx => (ctx.node(copyOf(ctx)) === null && ctx.node(scrollOf(ctx)) !== null
        ? 'That removed copy.txt. This task removes scroll.txt: make copy.txt again with ln, then rm ~/portals/scroll.txt.' : null),
    },
    {
      goal: 'Try to read through `~/portals/old_portal`, a soft link to `scroll.txt`, and read why it fails',
      tip: 'A soft link points at a name, and that name is gone, so the link leads nowhere.',
      hints: [
        'Look at it with `ls -l ~/portals` first: it still points at `scroll.txt`.',
        'Read it with `cat`. It will fail, and that is the point.',
        'cat ~/portals/old_portal',
      ],
      done: ctx => failedRead(ctx, oldOf(ctx)) && isLink(ctx, oldOf(ctx)) && ctx.node(oldOf(ctx)) === null,
      near: ctx => (ctx.read(oldOf(ctx)) ? 'It still works, because scroll.txt is still there. First rm ~/portals/scroll.txt.' : null),
    },
    {
      goal: 'Repair `~/portals/old_portal`: make it point at `~/portals/copy.txt` (`ln -sf`: `-f` replaces the old link)',
      tip: '`ln -sf TARGET NAME` replaces the link NAME with one that points at TARGET.',
      hints: [
        'The link is still there, so `ln -s` alone refuses. Force it.',
        '`ln -sf`, the new target `~/portals/copy.txt`, then the link\'s name.',
        'ln -sf ~/portals/copy.txt ~/portals/old_portal',
      ],
      done: ctx => ctx.ran('ln') && pointsAt(ctx, oldOf(ctx)) === copyOf(ctx),
      near: ctx => firstNote([
        [() => ctx.tried('ln', record => record.status !== 0 && ctx.hasPath(record, oldOf(ctx))), 'old_portal is already there, so ln refuses. Add -f to replace it: ln -sf.'],
        [() => ctx.tried('cp', record => ctx.hasPath(record, oldOf(ctx))), 'cp copies data. old_portal must stay a link: ln -sf ~/portals/copy.txt ~/portals/old_portal.'],
        [() => isLink(ctx, oldOf(ctx)) && pointsAt(ctx, oldOf(ctx)) !== copyOf(ctx) && resolvePath(ctx.linkTarget(oldOf(ctx)), ctx.cwd, ctx.home) === copyOf(ctx),
          `A link's target is read from the link's own directory, ~/portals: there, ${ctx.linkTarget(oldOf(ctx))} means another place. Use copy.txt or ~/portals/copy.txt.`],
      ]),
    },
  ],
  solve: [
    'ls -l ~',
    'ln -s ~/forest/cave/deep ~/portal',
    'ls -l ~/portal',
    'cd ~/portal',
    'ln ~/portals/scroll.txt ~/portals/copy.txt',
    'ls -li ~/portals',
    'rm ~/portals/scroll.txt',
    'cat ~/portals/copy.txt',
    'cat ~/portals/old_portal',
    'ln -sf ~/portals/copy.txt ~/portals/old_portal',
  ],
  boss: {
    title: 'The Portal Maze',
    briefing: `<p>A maze of portals stands in <code>~/maze</code>. Its vaults sit in <code>~/maze/vaults</code>, a directory you may go through but not list. Read the map, <code>~/maze/map.txt</code>: it names the vault with the treasure. Its gate, one of the <code>gate_</code> links, is broken. Point that gate at the vault, go through it, and write the word in <code>treasure.txt</code> into <code>~/maze/answer.txt</code>.</p>`,
    setup: setupBoss,
    hints: [
      'Read `~/maze/map.txt`, then `ls -l ~/maze`: the broken gate points at a vault that is not there.',
      'Repair it with `ln -sf VAULT GATE`, read `treasure.txt` through it, and save the word with `echo WORD > ~/maze/answer.txt`.',
      ({ gate, vault }) => `ln -sf ${tilde(vault)} ${tilde(gate)}`,
    ],
    done: bossDone,
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['ls -l ~', 'the first character: - a file, d a directory, l a link'],
    ['ln -s ~/forest/cave/deep ~/portal', 'a soft link: a name that points at another name'],
    ['cd ~/portal', 'go through a soft link to a directory'],
    ['ln ~/portals/scroll.txt ~/portals/copy.txt', 'a hard link: a second name for the same data'],
    ['ls -li ~/portals', 'inode numbers, and how many names each has'],
    ['ln -sf ~/portals/copy.txt ~/portals/old_portal', 'replace a link'],
  ],
  why: `<p>Why two kinds of links? A hard link is a second name for the same data, so it cannot break, but it cannot point at a directory, and it must stay on the same disk. A soft link is only a path, so it can point at anything, anywhere, even at nothing.</p>
<p>Where are links used? Real systems use soft links everywhere: <code>ls -l /usr/bin</code> on a real machine shows many commands that are links to others, and a link named <code>current</code> often points at the newest version of a program.</p>`,
  field: [
    ['readlink -f NAME', 'the full real path a link leads to'],
    ['pwd -P', 'the real directory, not the link you came through'],
    ['find ~ -type l', 'every soft link in your home'],
    ['find ~ -xtype l', 'every broken soft link (GNU find)'],
  ],
  spells: [
    { name: 'ln -s', summary: 'Make a soft link: a name that points at a path.', examples: [['ln -s ~/forest/cave/deep ~/portal', 'a portal to the cave'], ['ln -sf ~/portals/copy.txt ~/portals/old_portal', 'replace a link']] },
    { name: 'ln', summary: 'Make a hard link: a second name for the same data.', examples: [['ln ~/portals/scroll.txt ~/portals/copy.txt', 'two names, one inode']] },
    { name: 'ls -li', summary: 'Long listing with inode numbers.', examples: [['ls -li ~/portals', 'the same number means the same data']] },
    { name: 'readlink', summary: 'Print where a soft link points.', examples: [['readlink ~/portal', 'prints its target']] },
  ],
};
