/**
 * Chapter 8, The Tower of Echoes: grep (inside files), grep -i, grep -r, and
 * find -name (by name, through every subdirectory, with the pattern quoted).
 * The boss room hides a dragon scale with a random name deep in one floor: the
 * player finds it with find, then greps the scale file for the dragon's NAME line.
 */
import { put, cd, dir, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { pick, token } from '../rng.js';
import { nodeAt, isInside } from '../../backend/tree.js';
import { operands, resolvePath } from '../checks.js';
import { directoriesUnder } from './kit.js';

const SCALE = '.scale';
const NAME = 'NAME: ';
const ROOMS = ['alcove', 'attic', 'cellar', 'chest', 'closet', 'crate', 'crypt', 'nook', 'shelf', 'cupboard'];
const COLOURS = ['dark green', 'pale green', 'bronze', 'copper', 'ash grey', 'deep red', 'black', 'smoky blue'];
const FEELS = ['warm to the touch', 'cold as stone', 'rough at the edge', 'smooth as glass', 'scratched', 'cracked down the middle', 'faintly glowing'];
const MIN_FILLER = 60;
const MORE_FILLER = 41;

const PASSWORD_LINE = 'Day 14: the password to the vault is penguin42';
const VAULT_LINE = 'Day 15: I forgot where I put the vault.';
const DRAGON_LINES = [
  'Tomas: I heard a dragon roar on the third floor.',
  'Old Wen: The Dragon sleeps on a pile of gems, they say.',
  'Pip: RUN. A DRAGON. I AM NOT JOKING.',
  'Bryn: the dragon was only a shadow on the wall. Or was it?',
];
const GUESTBOOK = `Welcome, traveller. Sign the book before you climb.
Mira: the stairs are steep, but the view is worth it.
${DRAGON_LINES[0]}
${DRAGON_LINES[1]}
Ash: lost my hat somewhere on floor two.
${DRAGON_LINES[2]}
${DRAGON_LINES[3]}
Keeper: please do not feed the echoes.
`;
const GOLD_LINES = ['Worth 300 gold.', 'Worth 450 gold.', 'Worth 500 gold.', 'Worth 1000 gold.'];
const GEMS = ['floor1/ruby.gem', 'floor2/sapphire.gem', 'floor3/emerald.gem', 'floor3/.opal.gem'];
const TEXTS = ['floor1/note.txt', 'floor1/guestbook.txt', 'floor2/diary.txt', 'floor3/bones.txt'];

const towerOf = ctx => `${ctx.home}/tower`;
const diaryOf = ctx => `${ctx.home}/tower/floor2/diary.txt`;
const guestbookOf = ctx => `${ctx.home}/tower/floor1/guestbook.txt`;

const isDir = (ctx, path) => ctx.node(path)?.type === 'dir';
const outLines = record => record.stdout.split('\n').filter(Boolean);
const recursive = (ctx, record) => ctx.flag(record, 'r') || ctx.flag(record, 'R');
const tildeOf = (path, home) => (isInside(path, home) ? `~${path.slice(home.length)}` : path);

// grep's first operand is its pattern, unless the pattern came with -e.
const grepFiles = record => {
  const all = operands(record.args);
  return record.args.includes('-e') ? all : all.slice(1);
};
const grepPaths = (ctx, record) => grepFiles(record).map(arg => resolvePath(arg, record.cwd, ctx.home));

// Every wanted line is shown, and every line shown has the word: the line is the word's, not a whole file.
function shows(record, word, wanted) {
  const lines = outLines(record);
  return wanted.every(w => lines.some(line => line.includes(w))) && lines.every(line => line.toLowerCase().includes(word));
}

const grepShows = (ctx, path, word, wanted, pred = () => true) => ctx.ran('grep', r => ctx.hasPath(r, path) && pred(r) && shows(r, word, wanted));

function findShows(ctx, ext, names) {
  return ctx.ran('find', record => {
    const lines = outLines(record);
    return ctx.hasPath(record, towerOf(ctx)) && lines.every(line => line.endsWith(ext))
      && names.every(name => lines.some(line => line.endsWith(`/${name}`)));
  });
}

function grepDirectoryNote(ctx) {
  const record = ctx.commands.find(r => r.name === 'grep' && !recursive(ctx, r) && grepPaths(ctx, r).some(path => isDir(ctx, path)));
  const arg = record && grepFiles(record).find(a => isDir(ctx, resolvePath(a, record.cwd, ctx.home)));
  return record ? `${arg} is a directory, and grep reads files. Give it a file's path, or add -r to search everything inside.` : null;
}

function noMatchNote(ctx, path, word) {
  const missed = ctx.tried('grep', r => ctx.hasPath(r, path) && r.status === 1);
  return missed ? `No line matched. grep matches the word exactly as you typed it: try ${word}.` : null;
}

const readNote = (ctx, path, what, line) => (ctx.read(path) ? `cat prints the whole ${what}. ${line} prints only the lines you need.` : null);

function caseNote(ctx) {
  const plain = ctx.tried('grep', r => ctx.hasPath(r, guestbookOf(ctx)) && !ctx.flag(r, 'i'));
  return plain ? 'That missed the lines that write it as Dragon or DRAGON. Add -i to ignore case: grep -i dragon.' : null;
}

function searchNote(ctx) {
  const tower = towerOf(ctx);
  const record = ctx.commands.find(r => r.name === 'grep' && recursive(ctx, r) && grepPaths(ctx, r).length > 0 && !ctx.hasPath(r, tower));
  const elsewhere = record && `That searched ${grepFiles(record).join(' ')}, not the tower. Give grep -r the tower's path: ~/tower.`;
  const plain = ctx.tried('grep', r => !recursive(ctx, r) && grepPaths(ctx, r).some(path => isInside(path, tower)));
  return grepDirectoryNote(ctx) ?? elsewhere ?? (plain ? 'grep -r searches every floor at once, hidden files too: give it the tower, ~/tower.' : null);
}

function findNote(ctx, ext) {
  const tower = towerOf(ctx);
  const record = ctx.commands.find(r => r.name === 'find' && ctx.paths(r).some(path => isInside(tower, path)));
  const at = record ? record.args.indexOf('-name') : -1;
  const value = record?.args[at + 1];
  let note = null;
  if (!record) note = null;
  else if (!ctx.hasPath(record, tower)) note = `That searched more than the tower. Give find the tower's path: find ~/tower -name "*${ext}".`;
  else if (at < 0) note = `That lists every name in the tower. Add -name "*${ext}" to keep only the names that end in ${ext}.`;
  else if (value === undefined) note = `-name needs a pattern after it: -name "*${ext}".`;
  else if (record.status !== 0 || !/[*?[]/.test(value)) note = `find looked for the exact name ${value}. Without quotes, bash swaps *${ext} for names in your directory first: write -name "*${ext}".`;
  return note;
}

function guestbook(player) {
  return put(`${player.home}/tower/floor1/guestbook.txt`, file(GUESTBOOK, { owner: player.user }));
}

const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1);

function scaleText(random, dragon) {
  const count = MIN_FILLER + Math.floor(random() * MORE_FILLER);
  const at = 5 + Math.floor(random() * (count - 10));
  const lines = Array.from({ length: count }, (_, i) => `Ring ${i + 1}: ${pick(random, COLOURS)}, ${pick(random, FEELS)}.`);
  lines.splice(at, 0, `${NAME}${dragon}`);
  return `${lines.join('\n')}\n`;
}

function setupBoss(random, player) {
  const { home, user } = player;
  const floor = `${home}/tower/floor${1 + Math.floor(random() * 3)}`;
  const outer = pick(random, ROOMS);
  const inner = pick(random, ROOMS.filter(room => room !== outer));
  const name = `${token(random, 4)}${SCALE}`;
  const dragon = capitalize(token(random, 6));
  const owned = { owner: user };
  const scaleNode = file(scaleText(random, dragon), owned);
  const patch = [
    ...restore('tower', player),
    guestbook(player),
    put(`${floor}/${outer}`, dir({ [inner]: dir({ [name]: scaleNode }, owned) }, owned)),
    cd(home),
  ];
  return { patch, secret: { scale: `${floor}/${outer}/${inner}/${name}`, dragon } };
}

const nameLine = dragon => `${NAME}${dragon}`;

function bossDone(ctx, { scale, dragon }) {
  return ctx.ran('grep', record => {
    const paths = grepPaths(ctx, record);
    return paths.length > 0 && paths.every(path => path === scale) && record.stdout.includes(nameLine(dragon));
  });
}

function bossNear(ctx, { scale, dragon }) {
  const scaleName = scale.slice(scale.lastIndexOf('/') + 1);
  let note = null;
  if (ctx.read(scale)) note = 'cat prints every line of the scale. grep NAME and the file\'s path prints only the line you need.';
  else if (ctx.ran('grep', r => recursive(ctx, r) && r.stdout.includes(nameLine(dragon)))) note = 'There is the line. Now grep the scale file itself: grep NAME and the path that grep printed before the colon.';
  else if (ctx.tried('grep', r => ctx.hasPath(r, scale) && r.status === 1)) note = 'No line matched. The line you want starts with NAME, in capital letters.';
  else if (ctx.ran('find', r => outLines(r).some(line => line.endsWith(`/${scaleName}`)))) note = 'Found it. Now use grep on that path to show the line that starts with NAME.';
  return note ?? grepDirectoryNote(ctx);
}

function solveBoss(obs) {
  const tower = `${obs.home}/tower`;
  const holder = directoriesUnder(obs.tree, tower).find(path => Object.keys(nodeAt(obs.tree, path).children).some(n => n.endsWith(SCALE)));
  const name = Object.keys(nodeAt(obs.tree, holder).children).find(n => n.endsWith(SCALE));
  return ['find ~/tower -name "*.scale"', `grep NAME ${tildeOf(`${holder}/${name}`, obs.home)}`];
}

export default {
  id: 'tower',
  act: 1,
  title: 'The Tower of Echoes',
  setup: (_random, player) => [
    ...restore('tower', player),
    guestbook(player),
    cd(player.home),
  ],
  lesson: `<p>The tower is full of notes, diaries and gems. Reading every file to find one line is slow, so two commands search for you.</p>
<p><code>grep WORD FILE</code> looks <b>inside</b> a file and prints only the lines that contain WORD: <code>grep password ~/tower/floor2/diary.txt</code>. A plain word matches exactly as you typed it, capitals included, so <code>dragon</code> does not match <code>Dragon</code>. Two options help:</p>
<ul>
<li><code>-i</code> (ignore case) matches capitals and small letters alike: <code>grep -i dragon ~/tower/floor1/guestbook.txt</code>.</li>
<li><code>-r</code> (recursive) searches a whole directory: every file in it and in the directories below it, hidden files too. Each line starts with the file it came from: <code>grep -r gold ~/tower</code>. Without <code>-r</code>, grep answers that the directory "Is a directory".</li>
</ul>
<p><code>find DIR -name "PATTERN"</code> looks at <b>names</b>, not inside files. It walks DIR and every directory below it, and prints the path of every name that matches the pattern, hidden names too: <code>find ~/tower -name "*.gem"</code>.</p>
<p>Put the pattern in quotes. As in chapter 6, bash expands an unquoted <code>*.gem</code> before the command runs, into the matching names in the directory you stand in. If nothing there matches, bash leaves it as it is and it works by luck; if names there match, find gets those names instead of the pattern. In quotes, the pattern reaches find unchanged, and find matches it against the names on every floor.</p>
<p>In short: <code>grep</code> searches what files say, <code>find</code> searches what files are called.</p>`,
  tasks: [
    {
      goal: 'Find the line about the password in the diary `~/tower/floor2/diary.txt` (`grep`, a word, then the file)',
      tip: '`grep` prints only the lines of a file that contain the word you give it.',
      hints: [
        'Reading the whole diary is slow. Search it for one word.',
        'Type `grep`, the word `password`, then the diary\'s path.',
        'grep password ~/tower/floor2/diary.txt',
      ],
      done: ctx => grepShows(ctx, diaryOf(ctx), 'password', [PASSWORD_LINE]),
      near: ctx => readNote(ctx, diaryOf(ctx), 'diary', 'grep password and the diary\'s path') ?? grepDirectoryNote(ctx) ?? noMatchNote(ctx, diaryOf(ctx), 'password'),
    },
    {
      goal: 'Find the line about the vault in the same diary',
      tip: 'Give `grep` a different word and the same file.',
      hints: [
        'Same diary, different word.',
        'Give `grep` the word `vault` and the diary\'s path.',
        'grep vault ~/tower/floor2/diary.txt',
      ],
      done: ctx => grepShows(ctx, diaryOf(ctx), 'vault', [VAULT_LINE]),
      near: ctx => readNote(ctx, diaryOf(ctx), 'diary', 'grep vault and the diary\'s path') ?? grepDirectoryNote(ctx) ?? noMatchNote(ctx, diaryOf(ctx), 'vault'),
    },
    {
      goal: 'Find every line about the dragon in the guestbook `~/tower/floor1/guestbook.txt`, whatever the case (`grep` with `-i`)',
      tip: '`grep -i` matches a word whatever its capitals: dragon, Dragon and DRAGON alike.',
      hints: [
        'Some guests wrote Dragon or DRAGON, and plain `grep dragon` misses those.',
        'Add `-i` after `grep`, then the word and the guestbook\'s path.',
        'grep -i dragon ~/tower/floor1/guestbook.txt',
      ],
      done: ctx => grepShows(ctx, guestbookOf(ctx), 'dragon', DRAGON_LINES, r => ctx.flag(r, 'i')),
      near: ctx => readNote(ctx, guestbookOf(ctx), 'guestbook', 'grep -i dragon and the guestbook\'s path') ?? grepDirectoryNote(ctx) ?? caseNote(ctx),
    },
    {
      goal: 'Search all three floors at once for the word `gold` (`grep` with `-r`, and the tower `~/tower`)',
      tip: '`grep -r` searches every file in a directory and below it, and starts each line with the file it came from.',
      hints: [
        'The word could be in any file on any floor. Search the whole tower in one go.',
        'Add `-r` after `grep`, then the word `gold`, then the tower\'s path.',
        'grep -r gold ~/tower',
      ],
      done: ctx => grepShows(ctx, towerOf(ctx), 'gold', GOLD_LINES, r => recursive(ctx, r)),
      near: searchNote,
    },
    {
      goal: 'Find every `.gem` file in the tower by its name (`find ~/tower -name "*.gem"`)',
      tip: '`find` prints every path below a directory whose name matches; the quotes stop bash expanding the `*` first.',
      hints: [
        '`grep` looks inside files. To search by name, there is `find`.',
        'Give `find` the tower\'s path, then `-name` and the pattern `"*.gem"`, quotes included.',
        'find ~/tower -name "*.gem"',
      ],
      done: ctx => findShows(ctx, '.gem', GEMS),
      near: ctx => findNote(ctx, '.gem'),
    },
    {
      goal: 'Find every `.txt` file in the tower, on all floors',
      tip: 'In the tower, text files have names that end in `.txt`: same `find`, another pattern.',
      hints: [
        'The text files in the tower have names that end in `.txt`.',
        'Use `find` on the tower as for the gems, with the pattern `"*.txt"` in quotes.',
        'find ~/tower -name "*.txt"',
      ],
      done: ctx => findShows(ctx, '.txt', TEXTS),
      near: ctx => findNote(ctx, '.txt'),
    },
  ],
  solve: [
    'grep password tower/floor2/diary.txt',
    'grep vault tower/floor2/diary.txt',
    'grep -i dragon tower/floor1/guestbook.txt',
    'grep -r gold tower',
    'find tower -name "*.gem"',
    'find tower -name "*.txt"',
  ],
  boss: {
    title: 'The Dragon\'s Scale',
    briefing: `<p>A dragon scale is hidden somewhere in the tower: a file whose name ends in <code>.scale</code>, deep inside one of the floors. Find it with <code>find</code>. Then use <code>grep</code> on that file to show the line with the dragon's name, the line that starts with <code>NAME:</code>.</p>`,
    setup: setupBoss,
    hints: [
      'You know the end of the name, `.scale`, but not the floor. `find` walks every floor for you.',
      'Run `find ~/tower -name "*.scale"`, then `grep NAME` and the path it printed.',
      ({ scale }) => `grep NAME ${scale.replace(/^\/home\/[^/]+/, '~')}`,
    ],
    done: bossDone,
    near: bossNear,
    hidden: ({ scale }) => {
      const inner = scale.slice(0, scale.lastIndexOf('/'));
      return [inner.slice(0, inner.lastIndexOf('/')), inner, scale];
    },
    solve: solveBoss,
  },
  recap: [
    ['grep password ~/tower/floor2/diary.txt', 'print the lines of a file that contain a word'],
    ['grep -i dragon ~/tower/floor1/guestbook.txt', 'ignore case: dragon, Dragon and DRAGON'],
    ['grep -r gold ~/tower', 'search every file in a directory and below it'],
    ['find ~/tower -name "*.gem"', 'print every path below a directory whose name matches; quote the pattern'],
  ],
  why: `<p>Why is <code>grep</code> everywhere? On Linux, settings and logs are mostly plain text: <code>/etc/passwd</code> lists the users, and the files in <code>/var/log</code> record what the system did. One search tool works on all of them, so "which line says that?" is one <code>grep</code> away.</p>
<p>Why does <code>find</code> walk the whole tree? Directories hold directories, as deep as you like, and a file can be anywhere below. <code>find</code> visits every directory under the one you give it, so you need to know what the name looks like, not where it is.</p>
<p>Why the quotes? Bash expands patterns before any command runs, using the names where you stand. <code>ls *.gem</code> wants that. <code>find</code> wants the pattern itself, to test it against every name it visits, so you quote it and bash leaves it alone.</p>`,
  field: [
    ['grep -n WORD FILE', 'put the line number before each matching line'],
    ['grep -v WORD FILE', 'print the lines that do not contain the word'],
    ['grep -rl WORD DIR', 'print only the names of the files that contain the word'],
    ['find DIR -type d', 'list only directories'],
    ['find DIR -mtime -1', 'list what changed in the last 24 hours'],
  ],
  spells: [
    {
      name: 'grep',
      summary: 'Print the lines of files that contain a pattern.',
      examples: [
        ['grep password ~/tower/floor2/diary.txt', 'the lines with the word'],
        ['grep -i dragon ~/tower/floor1/guestbook.txt', 'whatever the capitals'],
        ['grep -r gold ~/tower', 'every file in a directory and below it'],
      ],
    },
    {
      name: 'find',
      summary: 'Walk a directory and everything below it, and print the paths whose names match.',
      examples: [
        ['find ~/tower -name "*.gem"', 'names that end in .gem, on every floor'],
        ['find ~/tower', 'every path in the tower'],
      ],
    },
  ],
};
