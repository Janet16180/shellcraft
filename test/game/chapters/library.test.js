import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/library.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const LIBRARY = `${HOME}/library`;
const SCROLL = 'library/scroll_of_ages.txt';
const CATALOGUE = 'library/catalogue.txt';
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [HEAD, HEAD3, TAIL, TAIL1, COUNT, BOOKS] = chapter.tasks.map(task => task.goal);

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const textOf = result => result.output.filter(c => c.stream !== 'err').map(c => c.text).join('');

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('new commands and options get a clue in their first goal, and later goals name only the target', () => {
  assert.equal(chapter.tasks.length, 6);
  assert.match(HEAD, /`~\/library\/scroll_of_ages\.txt`.*`head`/);
  assert.match(HEAD3, /`-n 3`/);
  assert.match(TAIL, /`tail`/);
  assert.match(COUNT, /`wc` with `-l`/);
  assert.match(BOOKS, /`~\/library\/catalogue\.txt`/);
  for (const goal of [TAIL1, BOOKS]) assert.doesNotMatch(goal, /`(head|tail|wc|-n|-l)\b/, goal);
});

test('the solve finishes every task on the base world without an error', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

test('the scroll ends with the word of power, has 40 lines, and the catalogue lists 25 books', async () => {
  const backend = await startChapter(chapter);
  assert.equal(textOf((await type(backend, `tail -n 1 ${SCROLL}`)).result), 'Word of power: TUX\n');
  assert.equal(textOf((await type(backend, `wc -l ${SCROLL}`)).result), `40 ${SCROLL}\n`);
  assert.equal(textOf((await type(backend, `wc -l ${CATALOGUE}`)).result), `25 ${CATALOGUE}\n`);
});

test('the setup restores the library with its secret passage, adds the catalogue and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, chapter.solve);
  await type(backend, 'rm library/scroll_of_ages.txt library/catalogue.txt; echo junk > library/extra.txt; cd /etc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.equal(nodeAt(obs.tree, `${LIBRARY}/scroll_of_ages.txt`).type, 'file');
  assert.equal(nodeAt(obs.tree, `${LIBRARY}/catalogue.txt`).type, 'file');
  assert.equal(nodeAt(obs.tree, `${LIBRARY}/.secret_passage`).type, 'dir');
  assert.equal(nodeAt(obs.tree, `${LIBRARY}/extra.txt`), null);
  const { done } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
});

const NEAR_MISSES = [
  [HEAD, [], `cat ${SCROLL}`, `head ${SCROLL}`],
  [HEAD, [], `tail ${SCROLL}`, 'head ~/library/scroll_of_ages.txt'],
  [HEAD, [], 'head library/librarian.txt', `head -n 5 ${SCROLL}`],
  [HEAD, [], `head -c 20 ${SCROLL}`, `cd library; head scroll_of_ages.txt`],
  [HEAD3, [], `head ${SCROLL}`, `head -n 3 ${SCROLL}`],
  [HEAD3, [], `head -n 4 ${SCROLL}`, `head -n3 ${SCROLL}`],
  [HEAD3, [], `tail -n 3 ${SCROLL}`, `head -3 ${SCROLL}`],
  [HEAD3, [], `head --lines=4 ${SCROLL}`, `head --lines=3 ~/${SCROLL}`],
  [TAIL, [], `cat ${SCROLL}`, `tail ${SCROLL}`],
  [TAIL, [], `head ${SCROLL}`, `tail -n 2 ~/${SCROLL}`],
  [TAIL1, [], `tail ${SCROLL}`, `tail -n 1 ${SCROLL}`],
  [TAIL1, [], `head -n 1 ${SCROLL}`, `tail -n1 ${SCROLL}`],
  [TAIL1, [], `tail -n 2 ${SCROLL}`, `tail -1 ${SCROLL}`],
  [TAIL1, [], `tail -c 19 ${SCROLL}`, `tail -n 1 ~/${SCROLL}`],
  [COUNT, [], `wc ${SCROLL}`, `wc -l ${SCROLL}`],
  [COUNT, [], `wc -w ${SCROLL}`, `wc -lw ${SCROLL}`],
  [COUNT, [], `wc -l ${CATALOGUE}`, `wc -l ~/${SCROLL}`],
  [BOOKS, [], `wc ${CATALOGUE}`, `wc -l ${CATALOGUE}`],
  [BOOKS, [], `cat ${CATALOGUE}`, `wc -l ~/${CATALOGUE}`],
  [BOOKS, [], `wc -l ${SCROLL}`, `cd library; wc -l catalogue.txt`],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}, but is by ${JSON.stringify(hit)}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [HEAD, [], `cat ${SCROLL}`, /cat prints the whole.*head and tail print only part/],
  [HEAD, [], `tail ${SCROLL}`, /beginning is head/],
  [HEAD, [], `head ${SCROLL}`, null],
  [HEAD3, [], `head ${SCROLL}`, /head -n 3/],
  [HEAD3, [], `cat ${SCROLL}`, /only part/],
  [HEAD3, [], `head -n 3 ${SCROLL}`, null],
  [TAIL, [], `head ${SCROLL}`, /end is tail/],
  [TAIL, [], `cat ${SCROLL}`, /only part/],
  [TAIL, [], `tail ${SCROLL}`, null],
  [TAIL1, [], `tail ${SCROLL}`, /tail -n 1/],
  [TAIL1, [], `head -n 1 ${SCROLL}`, /end is tail/],
  [TAIL1, [], `tail -n 1 ${SCROLL}`, null],
  [COUNT, [], `wc ${SCROLL}`, /lines, words and bytes.*-l/],
  [COUNT, [], `cat ${SCROLL}`, /wc with -l/],
  [COUNT, [], `wc -l ${SCROLL}`, null],
  [BOOKS, [], `wc ${CATALOGUE}`, /lines, words and bytes.*-l/],
  [BOOKS, [], `cat ${CATALOGUE}`, /wc with -l/],
  [BOOKS, [], `wc -l ${CATALOGUE}`, null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the tasks may come in any order', async () => {
  const backend = await startChapter(chapter);
  const { done } = await play(chapter, backend, [...chapter.solve].reverse());
  assert.deepEqual(done, chapter.tasks.map(() => true));
});

const tomesBy = obs => Object.keys(nodeAt(obs.tree, LIBRARY).children).filter(name => name.startsWith('tome_'));

test('the boss room brings the player home and lays one long tome_ file whose last line holds a password', async () => {
  const names = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.match(secret.tome, /^\/home\/hero\/library\/tome_[acdefhjkmnprtuvwxy34679]{3}\.txt$/);
    assert.deepEqual(tomesBy(obs).map(name => `${LIBRARY}/${name}`), [secret.tome], `seed ${seed}`);
    const lines = nodeAt(obs.tree, secret.tome).content.split('\n');
    assert.equal(lines.length, 151, '150 lines, each ending in a newline');
    assert.match(lines[149], /^The password is [acdefhjkmnprtuvwxy34679]{4}$/);
    assert.equal(lines.filter(line => line.startsWith('The password')).length, 1);
    names.add(tomesBy(obs)[0]);
  }
  assert.ok(names.size >= 3, [...names].join(', '));
});

test('a second boss room replaces the old tome', async () => {
  const { backend } = await startBoss(chapter, 1);
  const { patch } = chapter.boss.setup(Math.random, PLAYER);
  await backend.load(patch);
  assert.equal(tomesBy(await backend.observe()).length, 1);
});

test('the boss is beaten by listing the library and printing only the tome\'s last line, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    for (const line of lines) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, true], `seed ${seed}: ${lines.join('; ')}`);
  }
});

const BOSS_MISSES = [
  ['cat', /too long for cat.*tail -n 1/],
  ['head', /head.*last line.*tail -n 1/],
  ['head -n 1', /head.*last line.*tail -n 1/],
  ['tail', /-n 1/],
  ['tail -n 2', /-n 1/],
  ['tail -c 20', null],
];

for (const [command, note] of BOSS_MISSES) {
  test(`${command} on the tome does not beat the boss, and ${note ? 'gives a near note' : 'stays silent'}`, async () => {
    const { backend, secret } = await startBoss(chapter, 7);
    const { ctx } = await type(backend, `${command} ${secret.tome}`);
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

test('tail -n 1 on another file does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 8);
  assert.equal(chapter.boss.done((await type(backend, `tail -n 1 ${SCROLL}`)).ctx, secret), false);
});

test('the boss gives no near note for looking around or for the winning line', async () => {
  const { backend, secret } = await startBoss(chapter, 9);
  for (const line of ['ls ~/library', `tail -n 1 ${secret.tome}`]) {
    assert.equal(chapter.boss.near((await type(backend, line)).ctx, secret), null, line);
  }
});

test('the exact boss hint beats the boss from home', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

test('the tome is kept off the map until an ls lists the library', () => {
  assert.deepEqual(chapter.boss.hidden({ tome: `${LIBRARY}/tome_abc.txt` }), [`${LIBRARY}/tome_abc.txt`]);
});

const NOT_COMMANDS = new Set(['-n', '~/library', 'tome_']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
