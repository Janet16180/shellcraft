import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/market.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const MARKET = `${HOME}/market`;
const LEDGER = `${MARKET}/ledger.txt`;
const SOLD = `${MARKET}/sold.txt`;
const STOCK = 'apple\nmap\npotion\nrope\nshield\nsword\ntorch\n';
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [SORT, ONCE, COUNT, SAVE, LANTERN, COMPASS, POTIONS] = chapter.tasks.map(task => task.goal);
const SAVED = ['cd market', 'sort inventory.txt | uniq > stock.txt'];

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const textOf = result => result.output.map(c => c.text).join('');

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('new commands get a clue in their first goal, the pipe lines are shown in full, and later goals name only the target', () => {
  assert.equal(chapter.tasks.length, 7);
  assert.match(SORT, /`sort`/);
  assert.match(ONCE, /`sort ~\/market\/inventory\.txt \| uniq`/);
  assert.match(COUNT, /`uniq -c`/);
  assert.match(LANTERN, /`echo lantern >> ~\/market\/stock\.txt`/);
  assert.match(POTIONS, /`grep`.*`\|`.*`wc -l`/);
  for (const goal of [SAVE, COMPASS]) assert.doesNotMatch(goal, /`(sort|uniq|echo|>>?|\|)/, goal);
  for (const goal of [SORT, SAVE, COMPASS, POTIONS]) assert.match(goal, /`~\/market\/[a-z]+\.txt`/, goal);
});

test('the lesson says plainly what the pipe does, why sort comes before uniq, and how > and >> differ', () => {
  assert.match(chapter.lesson, /sends what one command prints into the next command/);
  assert.match(chapter.lesson, /next to each other.*sort<\/code> comes first/s);
  assert.match(chapter.lesson, /replaces everything.*adds to the end/s);
});

test('the solve finishes every task on the base world without an error', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
  const obs = await backend.observe();
  assert.equal(nodeAt(obs.tree, `${MARKET}/stock.txt`).content, `${STOCK}lantern\ncompass\n`);
});

test('the pipes print what a real bash prints', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'cd market');
  assert.equal(textOf((await type(backend, 'sort inventory.txt | uniq')).result), STOCK);
  assert.equal(textOf((await type(backend, 'sort inventory.txt | uniq -c')).result),
    '      3 apple\n      1 map\n      4 potion\n      1 rope\n      1 shield\n      2 sword\n      2 torch\n');
  assert.equal(textOf((await type(backend, 'grep potion inventory.txt | wc -l')).result), '4\n');
});

test('the setup restores the market, clears the stock, sold and ledger files, and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, [...chapter.solve, 'echo x > sold.txt', 'echo x > ledger.txt', 'echo x > inventory.txt', 'cd /etc']);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(Object.keys(nodeAt(obs.tree, MARKET).children).sort(), ['inventory.txt', 'merchant.txt']);
  assert.match(nodeAt(obs.tree, `${MARKET}/inventory.txt`).content, /^potion\nsword\n/);
});

test('the tasks with >> can come before saving the list, and the chapter can still be finished', async () => {
  const backend = await startChapter(chapter);
  const lines = ['cd market', 'echo lantern >> stock.txt', 'sort inventory.txt | uniq > stock.txt', 'echo compass >> stock.txt', 'echo lantern >> stock.txt'];
  const { done } = await play({ tasks: [chapter.tasks[GOAL[LANTERN]], chapter.tasks[GOAL[COMPASS]], chapter.tasks[GOAL[SAVE]]] }, backend, lines);
  assert.deepEqual(done, [true, true, true]);
});

test('erasing the list with > can be mended: save it again, then >> works', async () => {
  const backend = await startChapter(chapter);
  const task = chapter.tasks[GOAL[LANTERN]];
  await play(chapter, backend, SAVED);
  assert.equal(task.done((await type(backend, 'echo lantern > stock.txt')).ctx), false);
  assert.equal(task.done((await type(backend, 'echo lantern >> stock.txt')).ctx), false);
  await type(backend, 'sort inventory.txt | uniq > stock.txt');
  assert.equal(task.done((await type(backend, 'echo lantern >> stock.txt')).ctx), true);
});

const NEAR_MISSES = [
  [SORT, [], 'cat market/inventory.txt', 'sort market/inventory.txt'],
  [SORT, [], 'sort market/merchant.txt', 'sort ~/market/inventory.txt'],
  [ONCE, [], 'uniq market/inventory.txt', 'sort market/inventory.txt | uniq'],
  [ONCE, [], 'sort -u market/inventory.txt', 'sort ~/market/inventory.txt | uniq'],
  [ONCE, [], 'cat market/inventory.txt | uniq', 'sort market/inventory.txt | uniq'],
  [ONCE, [], 'sort market/inventory.txt', 'sort market/inventory.txt | uniq'],
  [COUNT, [], 'uniq -c market/inventory.txt', 'sort market/inventory.txt | uniq -c'],
  [COUNT, [], 'sort market/inventory.txt | uniq', 'sort ~/market/inventory.txt | uniq -c'],
  [SAVE, ['cd market'], 'sort inventory.txt | uniq', 'sort inventory.txt | uniq > stock.txt'],
  [SAVE, ['cd market'], 'sort -u inventory.txt > stock.txt', 'sort inventory.txt | uniq > stock.txt'],
  [SAVE, ['cd market'], 'uniq inventory.txt > stock.txt', 'sort inventory.txt | uniq > ~/market/stock.txt'],
  [SAVE, ['cd market'], 'sort inventory.txt > stock.txt', 'sort inventory.txt | uniq > stock.txt'],
  [SAVE, ['cd market'], 'sort inventory.txt | uniq -c > stock.txt', 'sort inventory.txt | uniq > stock.txt'],
  [SAVE, SAVED, 'sort inventory.txt | uniq >> stock.txt', 'sort inventory.txt | uniq > stock.txt'],
  [LANTERN, SAVED, 'echo lantern > stock.txt', 'echo lantern >> stock.txt'],
  [LANTERN, SAVED, 'echo lantern', 'echo lantern >> ~/market/stock.txt'],
  [LANTERN, SAVED, 'echo lantern >> inventory.txt', 'echo lantern >> stock.txt'],
  [LANTERN, SAVED, 'echo compass >> stock.txt', 'echo lantern >> stock.txt'],
  [LANTERN, ['cd market'], 'echo lantern >> stock.txt', null],
  [COMPASS, SAVED, 'echo compass > stock.txt', 'echo compass >> stock.txt'],
  [COMPASS, SAVED, 'echo lantern >> stock.txt', 'echo compass >> ~/market/stock.txt'],
  [POTIONS, ['cd market'], 'grep potion inventory.txt', 'grep potion inventory.txt | wc -l'],
  [POTIONS, ['cd market'], 'grep -c potion inventory.txt', 'grep potion ~/market/inventory.txt | wc -l'],
  [POTIONS, ['cd market'], 'wc -l inventory.txt', 'grep potion inventory.txt | wc -l'],
  [POTIONS, ['cd market'], 'grep potion inventory.txt | wc', 'grep potion inventory.txt | wc -l'],
  [POTIONS, ['cd market'], 'grep sword inventory.txt | wc -l', 'grep potion inventory.txt | wc -l'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [SORT, [], 'cat market/inventory.txt', /sort prints them in order/],
  [SORT, [], 'sort market/inventory.txt', null],
  [ONCE, [], 'uniq market/inventory.txt', /next to each other.*Sort first/],
  [ONCE, [], 'cat market/inventory.txt | uniq', /next to each other.*Sort first/],
  [ONCE, [], 'sort -u market/inventory.txt', /sort -u works.*sort \| uniq/],
  [ONCE, [], 'sort market/inventory.txt | uniq -c', /plain uniq/],
  [ONCE, [], 'sort market/inventory.txt | uniq', null],
  [COUNT, [], 'uniq -c market/inventory.txt', /next to each other.*Sort first/],
  [COUNT, [], 'sort market/inventory.txt | uniq', /-c/],
  [COUNT, [], 'sort market/inventory.txt | uniq -c', null],
  [SAVE, ['cd market'], 'sort -u inventory.txt > stock.txt', /right.*sort ~\/market\/inventory\.txt \| uniq > ~\/market\/stock\.txt/],
  [SAVE, ['cd market'], 'uniq inventory.txt > stock.txt', /next to each other/],
  [SAVE, SAVED, 'sort inventory.txt | uniq >> stock.txt', />> added.*Use > to replace/],
  [SAVE, ['cd market'], 'sort inventory.txt > stock.txt', /each item once, in order.*\| uniq/],
  [SAVE, ['cd market'], 'sort inventory.txt | uniq', /on the screen.*> ~\/market\/stock\.txt/],
  [SAVE, ['cd market'], 'sort inventory.txt | uniq > stock.txt', null],
  [LANTERN, SAVED, 'echo lantern > stock.txt', /replaced the whole list.*sort ~\/market\/inventory\.txt \| uniq > ~\/market\/stock\.txt.*>>/],
  [LANTERN, ['cd market'], 'echo lantern >> stock.txt', /did not hold the saved stock list.*sort .*\| uniq >/],
  [LANTERN, SAVED, 'echo lantern', /on the screen.*>>/],
  [LANTERN, SAVED, 'echo lantern >> inventory.txt', /another file.*~\/market\/stock\.txt/],
  [LANTERN, SAVED, 'echo lantern >> stock.txt', null],
  [COMPASS, SAVED, 'echo compass > stock.txt', /replaced the whole list with compass/],
  [COMPASS, SAVED, 'echo compass >> stock.txt', null],
  [POTIONS, ['cd market'], 'grep -c potion inventory.txt', /grep -c counts too.*\|/],
  [POTIONS, ['cd market'], 'wc -l inventory.txt', /every line.*grep/],
  [POTIONS, ['cd market'], 'grep potion inventory.txt | wc', /-l/],
  [POTIONS, ['cd market'], 'grep potion inventory.txt', /wc -l with a \|/],
  [POTIONS, ['cd market'], 'grep potion inventory.txt | wc -l', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

const linesOf = text => text.slice(0, -1).split('\n');
const uniqOf = lines => lines.filter((line, i) => line !== lines[i - 1]);

test('the boss room writes a ledger of about 30 sales with repeats in random order, and no sold.txt', async () => {
  const ledgers = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.equal(secret.ledger, LEDGER);
    assert.equal(nodeAt(obs.tree, SOLD), null);
    const sales = linesOf(nodeAt(obs.tree, LEDGER).content);
    assert.equal(sales.length, 30, `seed ${seed}`);
    assert.deepEqual([...new Set(sales)].sort(), secret.items, `seed ${seed}`);
    assert.ok(secret.items.length >= 6 && secret.items.length <= 8, `seed ${seed}`);
    assert.ok(secret.items.every(item => /^[a-z]+$/.test(item)), `seed ${seed}`);
    assert.notDeepEqual(uniqOf(sales), secret.items, `seed ${seed}: uniq alone must not be enough`);
    ledgers.add(sales.join(','));
  }
  assert.equal(ledgers.size, SEEDS.length);
});

test('the boss is beaten by looking at the market, then sort | uniq > sold.txt, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    for (const line of lines) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, true], `seed ${seed}: ${lines.join('; ')}`);
    assert.equal(nodeAt((await backend.observe()).tree, SOLD).content, `${secret.items.join('\n')}\n`);
  }
});

const BOSS_MISSES = [
  ['sort -u market/ledger.txt > market/sold.txt', /right.*sort -u works.*\|/],
  ['uniq market/ledger.txt > market/sold.txt', /next to each other.*Sort first: sort ~\/market\/ledger\.txt \| uniq/],
  ['cat market/ledger.txt | uniq > market/sold.txt', /next to each other/],
  ['sort market/ledger.txt | uniq', /on the screen.*> ~\/market\/sold\.txt/],
  ['sort market/ledger.txt > market/sold.txt', /each item once, in order/],
  ['sort market/ledger.txt | uniq -c > market/sold.txt', /each item once, in order/],
  ['sort market/inventory.txt | uniq > market/sold.txt', /each item once, in order/],
];

for (const [line, note] of BOSS_MISSES) {
  test(`the boss is not beaten by ${JSON.stringify(line)}, and says why`, async () => {
    const { backend, secret } = await startBoss(chapter, 2);
    const { ctx } = await type(backend, line);
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

test('the right sold.txt written by hand does not beat the boss, and asks for the one line', async () => {
  const { backend, secret } = await startBoss(chapter, 3);
  const [first, ...rest] = secret.items;
  await type(backend, `echo ${first} > market/sold.txt`);
  let ctx = null;
  for (const item of rest) ({ ctx } = await type(backend, `echo ${item} >> market/sold.txt`));
  assert.equal(chapter.boss.done(ctx, secret), false);
  assertNear(chapter.boss.near(ctx, secret), ctx, /right.*one line.*\| uniq/);
});

test('the boss gives no near note for looking around or for the winning line', async () => {
  const { backend, secret } = await startBoss(chapter, 9);
  for (const line of ['ls ~/market', 'cat ~/market/ledger.txt', 'sort ~/market/ledger.txt']) {
    assert.equal(chapter.boss.near((await type(backend, line)).ctx, secret), null, line);
  }
  assert.equal(chapter.boss.near((await type(backend, 'sort market/ledger.txt | uniq > market/sold.txt')).ctx, secret), null);
});

test('the exact boss hint beats the boss from anywhere', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    const line = chapter.boss.hints[2];
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

test('the ledger is kept off the map until an ls lists the market', () => {
  assert.deepEqual(chapter.boss.hidden({ ledger: LEDGER, items: [] }), [LEDGER]);
});

const NOT_COMMANDS = new Set(['|', '>>', '~/market/ledger.txt', '~/market/sold.txt']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    chapter.boss.hints[2],
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  await type(backend, 'cd market');
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
