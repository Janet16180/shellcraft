import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/mirrors.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const HALL = `${HOME}/mirrors`;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [STAR, SHARDS, QUESTION, BRACKETS, MAGIC, SWEEP] = chapter.tasks.map(task => task.goal);
const SETUP_NAMES = [
  'magic mirror.txt', 'mirror1.txt', 'mirror12.txt', 'mirror2.txt', 'mirror3.txt', 'mirror30.txt', 'mirror4.txt', 'mirror5.txt',
  'portrait.txt', 'shard_a.shard', 'shard_b.shard', 'shard_c.shard',
];

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const namesIn = (obs, path) => Object.keys(nodeAt(obs.tree, path)?.children ?? {}).sort();

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('each new pattern gets a clue in its first goal, and later goals name only the target', () => {
  assert.equal(chapter.tasks.length, 6);
  assert.match(STAR, /`\*` matches any characters: `ls ~\/mirrors\/mirror\*`/);
  assert.match(QUESTION, /`\?` matches exactly one character/);
  assert.match(BRACKETS, /`\[1-3\]` matches one character/);
  assert.match(MAGIC, /`~\/mirrors\/magic mirror\.txt`.*quotes/);
  assert.match(SHARDS, /`\.shard`/);
  for (const goal of [SHARDS, QUESTION, BRACKETS, MAGIC, SWEEP]) assert.doesNotMatch(goal, /`ls\b/, goal);
  assert.doesNotMatch(SHARDS, /`\*/, 'the second use of * names only the target');
});

test('the solve finishes every task on the base world without an error', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

test('the setup makes the hall with its twelve files and brings the player home', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(namesIn(obs, HALL), SETUP_NAMES);
  assert.match(nodeAt(obs.tree, `${HALL}/magic mirror.txt`).content, /Quotes/);
});

test('the setup rebuilds the hall after the solve and after a boss room', async () => {
  const { backend } = await startBoss(chapter, 2);
  await type(backend, 'cd /etc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(namesIn(obs, HALL), SETUP_NAMES);
});

test('the tasks are checked against the names bash expanded, so the pattern may be typed from inside the hall', async () => {
  const backend = await startChapter(chapter);
  const lines = ['cd mirrors', 'ls mirror*', 'ls *.shard', 'ls mirror?.txt', 'ls mirror[1-3].txt', 'cat "magic mirror.txt"', 'rm *.shard'];
  const { done, errors } = await play(chapter, backend, lines);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

const NEAR_MISSES = [
  [STAR, [], 'ls ~/mirrors', 'ls ~/mirrors/mirror*'],
  [STAR, [], 'ls ~/mirrors/m*', 'ls ~/mirrors/mirror*.txt'],
  [STAR, [], 'echo ~/mirrors/mirror*', 'ls mirrors/mirror*'],
  [STAR, [], 'ls "~/mirrors/mirror*"', 'ls ~/mirrors/mirror*'],
  [SHARDS, [], 'ls ~/mirrors/shard_a.shard', 'ls ~/mirrors/*.shard'],
  [SHARDS, [], 'ls ~/mirrors/*', 'ls ~/mirrors/shard*'],
  [SHARDS, [], 'ls ~/mirrors/"*.shard"', 'ls ~/mirrors/*.shard'],
  [QUESTION, [], 'ls ~/mirrors/mirror*', 'ls ~/mirrors/mirror?.txt'],
  [QUESTION, [], 'ls ~/mirrors/mirror??.txt', 'ls ~/mirrors/mirror?.*'],
  [BRACKETS, [], 'ls ~/mirrors/mirror[1-3]*', 'ls ~/mirrors/mirror[1-3].txt'],
  [BRACKETS, [], 'ls ~/mirrors/mirror?.txt', 'ls ~/mirrors/mirror[123].txt'],
  [MAGIC, [], 'cat ~/mirrors/magic mirror.txt', 'cat ~/mirrors/"magic mirror.txt"'],
  [MAGIC, [], 'cat "~/mirrors/magic mirror.txt"', 'cat ~/mirrors/magic\\ mirror.txt'],
  [MAGIC, [], 'ls ~/mirrors/"magic mirror.txt"', 'cat "/home/hero/mirrors/magic mirror.txt"'],
  [SWEEP, [], 'rm ~/mirrors/shard_a.shard', 'rm ~/mirrors/*.shard'],
  [SWEEP, [], 'rm ~/mirrors/*', 'rm ~/mirrors/shard_*'],
  [SWEEP, [], 'ls ~/mirrors/*.shard', 'rm ~/mirrors/shard_a.shard ~/mirrors/shard_b.shard ~/mirrors/shard_c.shard'],
  [SWEEP, [], 'rm ~/mirrors/*.shard ~/mirrors/mirror30.txt', 'rm ~/mirrors/*.shard'],
  [SWEEP, ['rm ~/mirrors/shard_a.shard'], 'rm ~/mirrors/*.shard', 'echo nothing'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)} after ${JSON.stringify(prefix)}, but is by ${JSON.stringify(hit)} on a fresh hall`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (prefix.length === 0) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [STAR, [], 'ls ~/mirrors', /whole hall.*mirror\*/],
  [STAR, [], 'ls ~/mirrors/m*', /listed 8 names.*wants 7/],
  [STAR, [], 'echo ~/mirrors/mirror*', /echo.*ls/],
  [STAR, [], 'ls ~/mirrors/zz*', /pattern itself.*nothing matched.*quotes/],
  [STAR, [], 'ls "~/mirrors/mirror*"', /Inside quotes, ~/],
  [STAR, [], 'ls ~/mirrors/mirror*', null],
  [STAR, ['rm ~/mirrors/mirror1.txt'], 'ls ~/mirrors/mirror*', /gone.*Restart the chapter/],
  [SHARDS, [], 'ls ~/mirrors/"*.shard"', /pattern itself.*quotes/],
  [SHARDS, [], 'ls ~/mirrors/shard_a.shard', /listed 1 name,.*wants 3.*\*\.shard/],
  [SHARDS, ['rm ~/mirrors/*.shard'], 'ls ~/mirrors/*.shard', /gone.*Restart the chapter/],
  [QUESTION, [], 'ls ~/mirrors/mirror*', /listed 7 names.*wants 5.*\?/],
  [BRACKETS, [], 'ls ~/mirrors/mirror[1-3]*', /listed 5 names.*wants 3.*\[1-3\]/],
  [MAGIC, [], 'cat ~/mirrors/magic mirror.txt', /split the name at the space.*quotes/],
  [MAGIC, [], 'cd mirrors; cat magic mirror.txt', /split the name at the space/],
  [MAGIC, [], 'cat "~/mirrors/magic mirror.txt"', /Inside quotes, ~ is just a character.*~\/mirrors\/"magic mirror\.txt"/],
  [MAGIC, ['rm ~/mirrors/m*'], 'cat ~/mirrors/"magic mirror.txt"', /gone.*Restart the chapter/],
  [MAGIC, [], 'cat ~/mirrors/"magic mirror.txt"', null],
  [SWEEP, [], 'rm ~/mirrors/*', /mirrors too.*no undo.*Restart the chapter/],
  [SWEEP, [], 'rm ~/mirrors/shard_a.shard', /one pattern.*Restart the chapter/],
  [SWEEP, [], 'rm "~/mirrors/*.shard"', /pattern itself/],
  [SWEEP, [], 'ls ~/mirrors/*.shard', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)} after ${JSON.stringify(prefix)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

const TOKEN = '[acdefhjkmnprtuvwxy34679]{2}';

test('the boss room rebuilds the hall with 4 to 6 whole and 3 to 5 cracked mirrors under random names, and brings the player home', async () => {
  const names = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    const inHall = namesIn(obs, HALL);
    const whole = inHall.filter(name => name.startsWith('whole_'));
    const cracked = inHall.filter(name => name.startsWith('cracked_'));
    assert.equal(whole.length + cracked.length, inHall.length, `seed ${seed}: only whole and cracked mirrors`);
    assert.ok(whole.length >= 4 && whole.length <= 6, `seed ${seed}: ${whole.length} whole`);
    assert.ok(cracked.length >= 3 && cracked.length <= 5, `seed ${seed}: ${cracked.length} cracked`);
    for (const name of whole) assert.match(name, new RegExp(`^whole_${TOKEN}\\.mirror$`));
    for (const name of cracked) assert.match(name, new RegExp(`^cracked_${TOKEN}\\.mirror$`));
    const tokens = inHall.map(name => name.replace(/^(whole|cracked)_/, ''));
    assert.equal(new Set(tokens).size, tokens.length, `seed ${seed}: tokens are distinct`);
    assert.deepEqual([...secret.whole, ...secret.cracked].sort(), inHall.map(name => `${HALL}/${name}`).sort());
    cracked.forEach(name => names.add(name));
  }
  assert.ok(names.size >= 12, [...names].join(', '));
});

test('the boss is beaten by listing the hall, previewing the pattern and removing it, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    for (const line of lines) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, false, true], `seed ${seed}: ${lines.join('; ')}`);
    const { tree } = await backend.observe();
    assert.ok(secret.whole.every(path => nodeAt(tree, path)), `seed ${seed}: whole mirrors stay`);
  }
});

test('removing the cracked mirrors one by one also beats the boss, on the last one', async () => {
  const { backend, secret } = await startBoss(chapter, 3);
  const results = [];
  for (const path of secret.cracked) results.push(chapter.boss.done((await type(backend, `rm ${path}`)).ctx, secret));
  assert.deepEqual(results, secret.cracked.map((_, i) => i === secret.cracked.length - 1));
});

test('removing whole mirrors too does not beat the boss, and says how to get them back', async () => {
  const { backend, secret } = await startBoss(chapter, 4);
  const { ctx } = await type(backend, 'rm ~/mirrors/*');
  assert.equal(chapter.boss.done(ctx, secret), false);
  assertNear(chapter.boss.near(ctx, secret), ctx, /whole mirror is gone.*Restart the chapter/);
});

test('a changed whole mirror does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 5);
  await type(backend, `echo broken > ${secret.whole[0]}`);
  const { ctx } = await type(backend, 'rm ~/mirrors/cracked_*');
  assert.equal(chapter.boss.done(ctx, secret), false);
  assertNear(chapter.boss.near(ctx, secret), ctx, /gone or changed/);
});

test('removing only some cracked mirrors says how many are left', async () => {
  const { backend, secret } = await startBoss(chapter, 6);
  const { ctx } = await type(backend, `rm ${secret.cracked[0]}`);
  assert.equal(chapter.boss.done(ctx, secret), false);
  const left = secret.cracked.length - 1;
  assertNear(chapter.boss.near(ctx, secret), ctx, new RegExp(`^${left} cracked mirrors are still there.*cracked_\\*`));
});

test('a quoted pattern does not beat the boss, and the note explains why', async () => {
  const { backend, secret } = await startBoss(chapter, 7);
  const { ctx } = await type(backend, 'rm "~/mirrors/cracked_*"');
  assert.equal(chapter.boss.done(ctx, secret), false);
  assertNear(chapter.boss.near(ctx, secret), ctx, /pattern itself.*quotes/);
});

test('a plain listing of the hall points at the pattern, and a preview gets no note', async () => {
  const { backend, secret } = await startBoss(chapter, 8);
  assertNear(chapter.boss.near((await type(backend, 'ls ~/mirrors')).ctx, secret), null, /cracked_.*ls.*rm/);
  assert.equal(chapter.boss.near((await type(backend, 'ls ~/mirrors/cracked_*')).ctx, secret), null);
});

test('the exact boss hint beats the boss from home', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2];
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

test('every mirror in the boss room is kept off the map until an ls lists the hall', () => {
  const secret = { whole: [`${HALL}/whole_aa.mirror`], cracked: [`${HALL}/cracked_cc.mirror`] };
  assert.deepEqual(chapter.boss.hidden(secret), [`${HALL}/whole_aa.mirror`, `${HALL}/cracked_cc.mirror`]);
});

const NOT_COMMANDS = new Set([
  '*', '?', '[1-3]', '[ac]', 'a', 'c', 'mirror*', '*.shard', '.shard', 'mirror?.txt', 'mirror1.txt', 'mirror30.txt', 'mirror4.txt',
  'mirror12.txt', 'magic', 'mirror.txt', '~', '~/mirrors', 'whole_', 'cracked_', 'magic\\ mirror.txt', '_',
]);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...codeSnippets(chapter.why).filter(snippet => !NOT_COMMANDS.has(snippet)),
    chapter.boss.hints[2],
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
