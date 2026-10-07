/**
 * Chapter 7, The Great Library: head, tail, the -n option and wc -l (less and
 * more in the lesson only). The boss room lays a long tome with a random name
 * in the library; its last line holds a random password, and the player
 * prints only that line with tail -n 1.
 */
import { put, cd, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { pick, token } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const TOME = 'tome_';
const TOME_LINES = 150;

const BOOKS = [
  'The Kernel and the Crown', 'A Field Guide to Daemons', 'Pipes of the Northern Market',
  'The Silent Shell', 'Seven Signals and How to Send Them', 'The Dragon of /dev/null',
  'Paths Absolute and Relative', 'A Short History of root', 'The Hidden Files of the Elders',
  'Cron and the Clockwork Chores', 'Recipes for a Tidy Home', 'The Lost Tunnels of the Cave',
  'Permissions for Beginners', 'The Tower of Echoes', 'Songs of the River',
  'The Mushroom Who Knew pwd', 'Ballads of the Third Mage', 'The Book of Plain Text',
  'How to Read a Long Scroll', 'The Shadow Daemon Rises', 'Maps of Kernelia',
  'The Gatekeeper of sshd', 'One Hundred Useful Spells', 'Tales from the Junkyard',
  'The Last Line of the Last Book',
];
const CATALOGUE = `${BOOKS.join('\n')}\n`;

const OPENERS = ['The ink', 'A shadow', 'The old mage', 'A candle', 'The dragon', 'A whisper', 'The scribe', 'An owl'];
const VERBS = ['drifts across', 'hides behind', 'guards', 'circles', 'forgets', 'reads', 'mends', 'watches over'];
const ENDINGS = ['the dusty shelves.', 'a forgotten page.', 'the silent kernel.', 'the long corridor.', 'a locked chest.', 'the midnight bell.'];

const scrollOf = ctx => `${ctx.home}/library/scroll_of_ages.txt`;
const catalogueOf = ctx => `${ctx.home}/library/catalogue.txt`;

const linesOf = text => text.split(/(?<=\n)/).filter(Boolean);
const firstLines = (text, n) => linesOf(text).slice(0, n).join('');
const lastLines = (text, n) => linesOf(text).slice(-n).join('');
const contentOf = (ctx, path) => ctx.node(path)?.content ?? null;

const readsFile = (ctx, record, path) => ctx.hasPath(record, path) || record.redirects.some(r => r.op === '<' && r.target === path);
const byLines = (ctx, record) => !ctx.flag(record, 'c');
const reading = (ctx, name, path) => ctx.ran(name, record => readsFile(ctx, record, path) && byLines(ctx, record));
// stdout must be exactly the wanted lines: this accepts -n 3, -n3 and -3 alike, and nothing longer.
const printed = (ctx, name, path, text) => text !== null && ctx.ran(name, record => readsFile(ctx, record, path) && byLines(ctx, record) && record.stdout === text);
const counted = (ctx, path) => ctx.ran('wc', record => readsFile(ctx, record, path) && ctx.flag(record, 'l'));
const countedAll = (ctx, path) => ctx.ran('wc', record => readsFile(ctx, record, path) && !ctx.flag(record, 'l'));
const catted = (ctx, path) => ctx.ran('cat', record => readsFile(ctx, record, path));

const headThree = ctx => printed(ctx, 'head', scrollOf(ctx), firstLines(contentOf(ctx, scrollOf(ctx)) ?? '', 3));
const tailOne = ctx => printed(ctx, 'tail', scrollOf(ctx), lastLines(contentOf(ctx, scrollOf(ctx)) ?? '', 1));

const CAT_NOTE = 'cat prints the whole scroll; head and tail print only part of it.';
const WC_NOTE = 'Those three numbers are lines, words and bytes: add -l to print only the lines.';

function headNear(ctx, wanted) {
  let note = null;
  if (catted(ctx, scrollOf(ctx))) note = CAT_NOTE;
  else if (reading(ctx, 'tail', scrollOf(ctx))) note = 'tail prints the end of a file; the beginning is head\'s job.';
  else if (wanted && reading(ctx, 'head', scrollOf(ctx)) && !headThree(ctx)) note = 'That printed a different number of lines: give head -n 3 and the scroll\'s path.';
  return note;
}

function tailNear(ctx, wanted) {
  let note = null;
  if (catted(ctx, scrollOf(ctx))) note = CAT_NOTE;
  else if (reading(ctx, 'head', scrollOf(ctx))) note = 'head prints the beginning of a file; the end is tail\'s job.';
  else if (wanted && reading(ctx, 'tail', scrollOf(ctx)) && !tailOne(ctx)) note = 'That printed a different number of lines: give tail -n 1 and the scroll\'s path.';
  return note;
}

function countNear(ctx, path) {
  let note = null;
  if (countedAll(ctx, path)) note = WC_NOTE;
  else if (catted(ctx, path)) note = 'cat prints the lines; wc with -l counts them.';
  return note;
}

function tomeText(random, password) {
  const filler = Array.from({ length: TOME_LINES - 1 }, () => `${pick(random, OPENERS)} ${pick(random, VERBS)} ${pick(random, ENDINGS)}`);
  return `${[...filler, `The password is ${password}`].join('\n')}\n`;
}

function setupBoss(random, player) {
  const tome = `${player.home}/library/${TOME}${token(random, 3)}.txt`;
  const password = token(random, 4);
  const patch = [
    ...restore('library', player),
    put(`${player.home}/library/catalogue.txt`, file(CATALOGUE, { owner: player.user })),
    put(tome, file(tomeText(random, password), { owner: player.user })),
    cd(player.home),
  ];
  return { patch, secret: { tome } };
}

function bossDone(ctx, { tome }) {
  const text = contentOf(ctx, tome);
  return text !== null && printed(ctx, 'tail', tome, lastLines(text, 1));
}

function bossNear(ctx, { tome }) {
  let note = null;
  if (catted(ctx, tome)) note = 'The tome is far too long for cat: tail -n 1 prints only its last line.';
  else if (reading(ctx, 'head', tome)) note = 'head prints the beginning of the tome, but the password is in its last line: use tail -n 1.';
  else if (reading(ctx, 'tail', tome) && !bossDone(ctx, { tome })) note = 'That did not print just the last line: give tail the option -n 1.';
  return note;
}

function solveBoss(obs) {
  const library = `${obs.home}/library`;
  const name = Object.keys(nodeAt(obs.tree, library).children).find(child => child.startsWith(TOME));
  return ['ls ~/library', `tail -n 1 ~/library/${name}`];
}

export default {
  id: 'library',
  act: 1,
  title: 'The Great Library',
  setup: (_random, player) => [
    ...restore('library', player),
    put(`${player.home}/library/catalogue.txt`, file(CATALOGUE, { owner: player.user })),
    cd(player.home),
  ],
  lesson: `<p>Some files are long. <code>cat</code> prints every line, and the start scrolls away before you can read it. These commands print only part of a file, or count it:</p>
<ul>
<li><code>head ~/library/scroll_of_ages.txt</code> prints the first 10 lines of a file.</li>
<li><code>tail ~/library/scroll_of_ages.txt</code> prints the last 10 lines.</li>
<li>The option <code>-n</code> (number) chooses how many lines: <code>head -n 3 ~/library/scroll_of_ages.txt</code> prints the first 3, and <code>tail -n 1 ~/library/scroll_of_ages.txt</code> prints only the last one.</li>
<li><code>wc ~/library/scroll_of_ages.txt</code> (word count) prints three numbers, then the name: the lines, the words and the bytes of the file.</li>
<li><code>wc -l ~/library/scroll_of_ages.txt</code> prints only the number of lines. In a list with one item per line, that is the number of items.</li>
</ul>
<p>To read a long file page by page, a real machine has <code>less ~/library/scroll_of_ages.txt</code>: Space moves one page down, and <b>q</b> quits. <code>more</code> is a simpler viewer of the same kind. Here in the game, both just print the whole file.</p>`,
  tasks: [
    {
      goal: 'Print the first 10 lines of the Scroll of Ages `~/library/scroll_of_ages.txt` (`head` shows the top of a file)',
      tip: '`head` and a file\'s path prints the first 10 lines of the file.',
      hints: [
        'The scroll is long. You only want its beginning.',
        'Type `head`, a space, and the path of the scroll.',
        'head ~/library/scroll_of_ages.txt',
      ],
      done: ctx => reading(ctx, 'head', scrollOf(ctx)),
      near: ctx => headNear(ctx, false),
    },
    {
      goal: 'Print only its first 3 lines (`-n 3`, for number)',
      tip: 'The option `-n` and a number tells `head` how many lines to print.',
      hints: [
        'Same command as before, with an option that chooses how many lines.',
        'Put `-n 3` between `head` and the path of the scroll.',
        'head -n 3 ~/library/scroll_of_ages.txt',
      ],
      done: headThree,
      near: ctx => headNear(ctx, true),
    },
    {
      goal: 'Print the last 10 lines of the scroll (`tail`)',
      tip: '`tail` works like `head`, but prints the last 10 lines of a file.',
      hints: [
        'This time you want the end of the scroll, not its beginning.',
        'Type `tail`, a space, and the path of the scroll.',
        'tail ~/library/scroll_of_ages.txt',
      ],
      done: ctx => reading(ctx, 'tail', scrollOf(ctx)),
      near: ctx => tailNear(ctx, false),
    },
    {
      goal: 'Print only the very last line of the scroll',
      tip: '`tail` takes the same option as `head` to choose how many lines it prints.',
      hints: [
        'You want the end of the scroll, and just one line of it.',
        'Give `tail` the option `-n` with the number of lines you want.',
        'tail -n 1 ~/library/scroll_of_ages.txt',
      ],
      done: tailOne,
      near: ctx => tailNear(ctx, true),
    },
    {
      goal: 'Count the lines of the scroll (`wc` with `-l`, for lines)',
      tip: '`wc -l` and a file\'s path prints how many lines the file has.',
      hints: [
        'No need to read the scroll: one command counts it for you.',
        'Type `wc -l` and the path of the scroll.',
        'wc -l ~/library/scroll_of_ages.txt',
      ],
      done: ctx => counted(ctx, scrollOf(ctx)),
      near: ctx => countNear(ctx, scrollOf(ctx)),
    },
    {
      goal: 'Count the books in the catalogue `~/library/catalogue.txt`, one per line',
      tip: 'With one book per line, the number of lines is the number of books.',
      hints: [
        'Each line of the catalogue is one book, so count its lines.',
        'Use the same command and option that counted the scroll\'s lines.',
        'wc -l ~/library/catalogue.txt',
      ],
      done: ctx => counted(ctx, catalogueOf(ctx)),
      near: ctx => countNear(ctx, catalogueOf(ctx)),
    },
  ],
  solve: [
    'head library/scroll_of_ages.txt',
    'head -n 3 library/scroll_of_ages.txt',
    'tail library/scroll_of_ages.txt',
    'tail -n 1 library/scroll_of_ages.txt',
    'wc -l library/scroll_of_ages.txt',
    'wc -l library/catalogue.txt',
  ],
  boss: {
    title: 'The Forbidden Tome',
    briefing: `<p>A forbidden tome has appeared in <code>~/library</code>: a file whose name starts with <code>tome_</code> and ends with random letters. It is far too long to read whole, and its password is written in its last line. Print only the last line of the tome.</p>`,
    setup: setupBoss,
    hints: [
      'First learn the tome\'s full name: `ls ~/library`.',
      'The command that prints the end of a file, with the option that sets how many lines: `tail -n 1`.',
      ({ tome }) => `tail -n 1 ${tome.replace(/^\/home\/[^/]+/, '~')}`,
    ],
    done: bossDone,
    near: bossNear,
    hidden: ({ tome }) => [tome],
    solve: solveBoss,
  },
  recap: [
    ['head ~/library/scroll_of_ages.txt', 'print the first 10 lines of a file'],
    ['head -n 3 ~/library/scroll_of_ages.txt', 'print the first 3 lines'],
    ['tail ~/library/scroll_of_ages.txt', 'print the last 10 lines'],
    ['tail -n 1 ~/library/scroll_of_ages.txt', 'print only the last line'],
    ['wc ~/library/scroll_of_ages.txt', 'count lines, words and bytes'],
    ['wc -l ~/library/catalogue.txt', 'count only the lines'],
  ],
  why: `<p>Why read the end of a file? Programs write their logs by adding lines to the end, so the newest news is always at the bottom. <code>tail</code> shows what just happened without making you scroll through years of history.</p>
<p>On a real machine, <code>tail -f</code> (follow) keeps watching the file and prints each new line as it is added. It is how people watch a server while it runs; Ctrl+C stops it.</p>
<p>Why count lines? Many files keep one thing per line: one book, one user, one log entry. Then <code>wc -l</code> answers "how many?" at once, even for a file with a million lines.</p>`,
  field: [
    ['tail -f FILE', 'keep printing new lines as the file grows; Ctrl+C stops'],
    ['less FILE', 'page through a file; type `/` and a word to search, `q` to quit'],
    ['wc -w FILE', 'count only the words'],
    ['head -c 20 FILE', 'print the first 20 bytes instead of lines'],
  ],
  spells: [
    { name: 'head', summary: 'Print the first lines of a file (10 unless -n says otherwise).', examples: [['head ~/library/scroll_of_ages.txt', 'the first 10 lines'], ['head -n 3 ~/library/scroll_of_ages.txt', 'the first 3 lines']] },
    { name: 'tail', summary: 'Print the last lines of a file (10 unless -n says otherwise).', examples: [['tail ~/library/scroll_of_ages.txt', 'the last 10 lines'], ['tail -n 1 ~/library/scroll_of_ages.txt', 'only the last line']] },
    { name: 'wc', summary: 'Count the lines, words and bytes of a file.', examples: [['wc ~/library/scroll_of_ages.txt', 'lines, words and bytes'], ['wc -l ~/library/catalogue.txt', 'only the lines']] },
  ],
};
