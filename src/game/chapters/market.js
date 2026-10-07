/**
 * Chapter 9, The Market of Pipes: sort, the pipe |, uniq, uniq -c and >>
 * (append). The boss room writes a merchant's ledger of sales in random order
 * with repeats: the player writes each item once, in order, into sold.txt with
 * one line, sort piped into uniq.
 */
import { put, cd, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { shuffle, pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const STOCK = 'apple\nmap\npotion\nrope\nshield\nsword\ntorch\n';
const GOODS = ['amber', 'barley', 'candle', 'cloak', 'dagger', 'honey', 'incense', 'pepper', 'saddle', 'salt', 'silk', 'wool'];
const LEDGER_LINES = 30;
const SAVE_STOCK = 'sort ~/market/inventory.txt | uniq > ~/market/stock.txt';
const SAVE_SOLD = 'sort ~/market/ledger.txt | uniq > ~/market/sold.txt';

const inventoryOf = ctx => `${ctx.home}/market/inventory.txt`;
const stockOf = ctx => `${ctx.home}/market/stock.txt`;
const ledgerOf = home => `${home}/market/ledger.txt`;
const soldOf = ctx => `${ctx.home}/market/sold.txt`;

const textIn = (tree, path) => (nodeAt(tree, path)?.type === 'file' ? nodeAt(tree, path).content : null);
const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;

const isWrite = (redirect, ops) => ops.includes(redirect.op.replace(/^1/, ''));
const writes = (record, path, ops = ['>', '>>']) => record.redirects.some(r => isWrite(r, ops) && r.target === path);
const wroteTo = (ctx, path) => ctx.commands.some(record => writes(record, path));
const stageOf = (ctx, record, offset) => ctx.commands.find(r => r.pipeline === record.pipeline && r.stage === record.stage + offset) ?? null;
const plainUniq = (ctx, record) => !['c', 'd', 'u'].some(letter => ctx.flag(record, letter));

// A uniq that reads its input straight after a successful sort of the file, without -u.
function sortThenUniq(ctx, path, pred) {
  return ctx.ran('uniq', record => {
    const before = stageOf(ctx, record, -1);
    return ctx.paths(record).length === 0 && pred(record)
      && before?.name === 'sort' && before.status === 0 && ctx.hasPath(before, path) && !ctx.flag(before, 'u');
  });
}

// uniq on a file, or on input that sort did not prepare: the repeats are not neighbours.
const unsortedUniq = ctx => ctx.tried('uniq', record => ctx.paths(record).length > 0 || (record.stage > 0 && stageOf(ctx, record, -1)?.name !== 'sort'));
const sortedUnique = (ctx, path) => ctx.ran('sort', record => ctx.flag(record, 'u') && ctx.hasPath(record, path));
const neighbours = path => `uniq only joins equal lines that are next to each other, and here the repeats are apart. Sort first: sort ${path} | uniq.`;

function appendTask(word, goal, tip, hints) {
  const line = `${word}\n`;
  const echoes = (ctx, ops, path) => ctx.ran('echo', record => record.args.join(' ') === word && writes(record, path, ops));
  const listBefore = ctx => textIn(ctx.before.tree, stockOf(ctx));
  const keptList = ctx => listBefore(ctx)?.startsWith(STOCK) ?? false;
  return {
    goal,
    tip,
    hints,
    done: ctx => echoes(ctx, ['>>'], stockOf(ctx)) && keptList(ctx) && ctx.node(stockOf(ctx))?.content === listBefore(ctx) + line,
    near: ctx => firstNote([
      [() => echoes(ctx, ['>'], stockOf(ctx)), `The > replaced the whole list with ${word}. Save the list again (${SAVE_STOCK}), then add ${word} with >>.`],
      [() => echoes(ctx, ['>>'], stockOf(ctx)) && !keptList(ctx), `stock.txt did not hold the saved stock list. Save it first (${SAVE_STOCK}), then add ${word} with >>.`],
      [() => ctx.ran('echo', record => record.args.join(' ') === word && record.redirects.length === 0 && record.stage === record.stages - 1), `echo printed ${word} on the screen. Add >> and the stock list's path to add it to the end of the file.`],
      [() => ctx.ran('echo', record => record.args.join(' ') === word && record.redirects.some(r => isWrite(r, ['>>']) && r.target !== stockOf(ctx))), `That added ${word} to another file. The stock list is ~/market/stock.txt.`],
    ]),
  };
}

function savedStock(ctx) {
  return sortThenUniq(ctx, inventoryOf(ctx), record => plainUniq(ctx, record) && writes(record, stockOf(ctx)))
    && ctx.node(stockOf(ctx))?.content === STOCK;
}

function countsPotions(ctx) {
  return ctx.ran('grep', record => {
    const next = stageOf(ctx, record, 1);
    return record.args.includes('potion') && ctx.hasPath(record, inventoryOf(ctx))
      && next?.name === 'wc' && next.status === 0 && ctx.flag(next, 'l') && ctx.paths(next).length === 0;
  });
}

function setupBoss(random, { home, user }) {
  const goods = shuffle(random, GOODS).slice(0, 6 + Math.floor(random() * 3));
  const lines = [...goods, ...goods];
  while (lines.length < LEDGER_LINES) lines.push(pick(random, goods));
  const ledger = ledgerOf(home);
  const patch = [
    ...restore('market', { home, user }),
    put(ledger, file(`${shuffle(random, lines).join('\n')}\n`, { owner: user })),
    cd(home),
  ];
  return { patch, secret: { ledger, items: [...goods].sort() } };
}

const soldText = items => `${items.join('\n')}\n`;

function bossDone(ctx, { ledger, items }) {
  const sold = soldOf(ctx);
  return sortThenUniq(ctx, ledger, record => plainUniq(ctx, record) && writes(record, sold)) && ctx.node(sold)?.content === soldText(items);
}

function bossNear(ctx, secret) {
  const sold = soldOf(ctx);
  const right = ctx.node(sold)?.content === soldText(secret.items) && wroteTo(ctx, sold);
  return bossDone(ctx, secret) ? null : firstNote([
    [() => right && sortedUnique(ctx, secret.ledger), 'sold.txt is right, and sort -u works too, but this room asks for sort and uniq joined by a |.'],
    [() => right, 'sold.txt is right, but this room asks for one line: sort the ledger, | uniq, then > into sold.txt.'],
    [() => unsortedUniq(ctx), neighbours('~/market/ledger.txt')],
    [() => wroteTo(ctx, sold), 'sold.txt should hold each item once, in order: sort the ledger, then | uniq, then > ~/market/sold.txt.'],
    [() => sortThenUniq(ctx, secret.ledger, record => plainUniq(ctx, record) && !wroteTo(ctx, sold)), 'That printed the list on the screen. Add > ~/market/sold.txt at the end to write it into the file.'],
  ]);
}

function solveBoss(obs) {
  const market = `${obs.home}/market`;
  const ledger = Object.keys(nodeAt(obs.tree, market).children).find(name => name === 'ledger.txt');
  return ['ls ~/market', `sort ~/market/${ledger} | uniq > ~/market/sold.txt`];
}

export default {
  id: 'market',
  act: 1,
  title: 'The Market of Pipes',
  setup: (_random, player) => [
    ...restore('market', player),
    cd(player.home),
  ],
  lesson: `<p>The merchant's inventory is a mess: one item per line, in no order, with many repeats. New tools tidy it up:</p>
<ul>
<li><code>sort inventory.txt</code> prints the file's lines in order, from A to Z. The file itself does not change.</li>
<li>The <b>pipe</b> <code>|</code> sends what one command prints into the next command, instead of onto the screen. The next command reads it as if it were a file: <code>sort inventory.txt | uniq</code>.</li>
<li><code>uniq</code> joins equal lines that are <b>next to each other</b> into one. It only compares each line with the one just before it, so repeats that are far apart stay apart. That is why <code>sort</code> comes first: it puts equal lines side by side.</li>
<li><code>uniq -c</code> (count) also writes how many times each line came, in front of it.</li>
</ul>
<p>A pipe can end in a redirection: <code>sort inventory.txt | uniq > stock.txt</code> saves the tidy list in a file. Remember from chapter 4: <code>></code> replaces everything that was in the file.</p>
<p><code>>></code> adds to the end of the file instead, and keeps what was there: <code>echo lantern >> stock.txt</code>. Like <code>></code>, it makes the file if there is none.</p>
<p>Any command that prints can feed a pipe: <code>grep potion inventory.txt | wc -l</code> counts the lines that <code>grep</code> found.</p>`,
  tasks: [
    {
      goal: 'Sort the inventory `~/market/inventory.txt` (`sort` prints its lines in order)',
      tip: '`sort` and a file name prints the lines of the file in order, from A to Z, and leaves the file as it was.',
      hints: [
        'The inventory is a jumble of items. One command prints it in order.',
        'Type `sort`, a space, and the path of the inventory.',
        'sort ~/market/inventory.txt',
      ],
      done: ctx => ctx.ran('sort', record => ctx.hasPath(record, inventoryOf(ctx))),
      near: ctx => (ctx.read(inventoryOf(ctx)) ? 'cat prints the lines as they are. sort prints them in order.' : null),
    },
    {
      goal: 'Show each item once (`sort ~/market/inventory.txt | uniq`: the `|` sends what `sort` prints into `uniq`)',
      tip: '`uniq` joins equal lines that are next to each other, so sort first to bring the repeats together.',
      hints: [
        'Sorting puts equal items side by side. Another command can then join them.',
        'Put `| uniq` after the `sort` line you typed before.',
        'sort ~/market/inventory.txt | uniq',
      ],
      done: ctx => sortThenUniq(ctx, inventoryOf(ctx), record => plainUniq(ctx, record)),
      near: ctx => firstNote([
        [() => unsortedUniq(ctx), neighbours('~/market/inventory.txt')],
        [() => sortedUnique(ctx, inventoryOf(ctx)), 'sort -u works too, but this chapter practises sort | uniq.'],
        [() => sortThenUniq(ctx, inventoryOf(ctx), record => ctx.flag(record, 'c')), 'uniq -c counts them as well. To show each item once, use plain uniq.'],
      ]),
    },
    {
      goal: 'Count how many of each item there are in the inventory (`sort`, then `uniq -c`, for count)',
      tip: '`uniq -c` writes in front of each line how many times it came.',
      hints: [
        'The same pipe as before, with one option added to its second command.',
        'Add `-c` (count) to `uniq` in the pipe.',
        'sort ~/market/inventory.txt | uniq -c',
      ],
      done: ctx => sortThenUniq(ctx, inventoryOf(ctx), record => ctx.flag(record, 'c')),
      near: ctx => firstNote([
        [() => unsortedUniq(ctx), neighbours('~/market/inventory.txt')],
        [() => sortThenUniq(ctx, inventoryOf(ctx), record => !ctx.flag(record, 'c')), 'Add -c to uniq to count each item: uniq -c.'],
      ]),
    },
    {
      goal: 'Save each item once, in order, into `~/market/stock.txt`',
      tip: 'A `>` at the end of a pipe sends what its last command prints into a file, replacing what was in it.',
      hints: [
        'You already printed this list on the screen. Now send it into a file.',
        'Take the line with `sort` and `uniq`, and add `>` and the path of the stock list at its end.',
        'sort ~/market/inventory.txt | uniq > ~/market/stock.txt',
      ],
      done: savedStock,
      near: ctx => {
        const stock = stockOf(ctx);
        const wrote = wroteTo(ctx, stock);
        const right = wrote && ctx.node(stock)?.content === STOCK;
        return savedStock(ctx) ? null : firstNote([
          [() => right, `stock.txt is right, but this chapter practises the pipe: ${SAVE_STOCK}.`],
          [() => unsortedUniq(ctx), neighbours('~/market/inventory.txt')],
          [() => ctx.commands.some(record => writes(record, stock, ['>>'])), '>> added the list to the end of what stock.txt already held. Use > to replace it.'],
          [() => wrote, 'stock.txt should hold each item once, in order: sort, then | uniq, then > and the path.'],
          [() => sortThenUniq(ctx, inventoryOf(ctx), record => plainUniq(ctx, record)), 'That printed the list on the screen. Add > ~/market/stock.txt at the end to save it.'],
        ]);
      },
    },
    appendTask(
      'lantern',
      'Add `lantern` to the end of the stock list without erasing it (`echo lantern >> ~/market/stock.txt`)',
      '`>>` adds to the end of a file and keeps what was there, while `>` would replace it all.',
      [
        'A single `>` would replace the whole list with one word.',
        'Use `echo lantern`, then two arrows `>>` and the path of the stock list.',
        'echo lantern >> ~/market/stock.txt',
      ],
    ),
    appendTask(
      'compass',
      'Add `compass` to the end of the stock list `~/market/stock.txt` too',
      'Each `>>` adds one more line to the end of the file.',
      [
        'Add it the same way you added the lantern.',
        '`echo` the word, then `>>` and the path of the stock list.',
        'echo compass >> ~/market/stock.txt',
      ],
    ),
    {
      goal: 'Count the potions in the inventory `~/market/inventory.txt` with one line (`grep`, a `|`, then `wc -l`)',
      tip: '`grep` prints only the matching lines, and a pipe can send them on to `wc -l` to be counted.',
      hints: [
        'First pick out the potion lines, then count them.',
        '`grep potion` and the path of the inventory, then `| wc -l`.',
        'grep potion ~/market/inventory.txt | wc -l',
      ],
      done: countsPotions,
      near: ctx => {
        const inventory = inventoryOf(ctx);
        return firstNote([
          [() => ctx.ran('grep', record => ctx.flag(record, 'c') && ctx.hasPath(record, inventory)), 'grep -c counts too, but this task practises the pipe: grep, a |, then wc -l.'],
          [() => ctx.ran('wc', record => ctx.hasPath(record, inventory)), 'wc -l counted every line of the inventory. Let grep pick the potion lines first: grep, a |, then wc -l.'],
          [() => ctx.ran('wc', record => !ctx.flag(record, 'l') && record.stage > 0), 'Add -l to wc so that it counts only lines.'],
          [() => ctx.ran('grep', record => ctx.hasPath(record, inventory) && record.stages === 1), 'That printed the potion lines. Send them into wc -l with a |.'],
        ]);
      },
    },
  ],
  solve: [
    'cd market',
    'sort inventory.txt',
    'sort inventory.txt | uniq',
    'sort inventory.txt | uniq -c',
    'sort inventory.txt | uniq > stock.txt',
    'echo lantern >> stock.txt',
    'echo compass >> stock.txt',
    'grep potion inventory.txt | wc -l',
  ],
  boss: {
    title: 'The Merchant\'s Ledger',
    briefing: `<p>The merchant's ledger <code>~/market/ledger.txt</code> lists every sale, one item per line, with many repeats. In one line, use <code>sort</code> and <code>uniq</code> to write each item once, in order, into <code>~/market/sold.txt</code>.</p>`,
    setup: setupBoss,
    hints: [
      'Look at the ledger first: `cat ~/market/ledger.txt`. The same items come again and again, far apart.',
      'Sort the ledger, send it through `uniq` with a `|`, and end the line with `>` and the path of sold.txt.',
      SAVE_SOLD,
    ],
    done: bossDone,
    near: bossNear,
    hidden: ({ ledger }) => [ledger],
    solve: solveBoss,
  },
  recap: [
    ['sort inventory.txt', 'print the lines in order'],
    ['sort inventory.txt | uniq', 'the `|` sends what `sort` prints into `uniq`; each line once'],
    ['sort inventory.txt | uniq -c', 'count how many times each line comes'],
    ['sort inventory.txt | uniq > stock.txt', 'save what the pipe prints in a file, replacing what was there'],
    ['echo lantern >> stock.txt', 'add to the end of a file, keeping what was there'],
    ['grep potion inventory.txt | wc -l', 'count the lines that `grep` finds'],
  ],
  why: `<p>Why so many small tools? Unix was built on the idea that each program does one job well, and that programs work together: what one prints becomes what the next reads. <code>sort</code> knows nothing about counting and <code>uniq</code> nothing about order, yet joined by a pipe they count your items.</p>
<p>Why does <code>uniq</code> need sorted input? It only compares each line with the one before it, so it remembers just one line at a time and can handle input of any length, even a stream that never ends. <code>sort</code> has to read every line before it can print the first.</p>
<p>Why does <code>>></code> exist? Many programs keep a log: a line for each thing that happens, added to the end of a file that keeps growing. <code>></code> would wipe the history each time; <code>>></code> keeps it.</p>`,
  field: [
    ['sort -n FILE', 'sort by number value, so `10` comes after `9`'],
    ['sort FILE | uniq -c | sort -rn', 'count the lines, most common first (`-r` reverses, `-n` compares numbers)'],
    ['sort -u FILE', 'sort and drop the repeats in one command'],
    ['sort FILE | tee sorted.txt', '`tee` shows what it reads on the screen and saves it in a file too'],
  ],
  spells: [
    { name: 'sort', summary: 'Print the lines of a file in order.', examples: [['sort inventory.txt', 'from A to Z']] },
    { name: '|', summary: 'The pipe: send what one command prints into the next command.', examples: [['sort inventory.txt | uniq', 'sort, then uniq'], ['grep potion inventory.txt | wc -l', 'count the lines grep finds']] },
    { name: 'uniq', summary: 'Join equal lines that are next to each other; sort first.', examples: [['sort inventory.txt | uniq', 'each line once'], ['sort inventory.txt | uniq -c', 'each line once, with its count']] },
    { name: '>>', summary: 'Add to the end of a file, keeping what was there.', examples: [['echo lantern >> stock.txt', 'one more line at the end']] },
  ],
};
