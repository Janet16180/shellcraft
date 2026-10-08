import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/errands.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [BACKGROUND, JOBS, PAUSE, RESUME, INTERRUPT, KILL, DONE] = chapter.tasks.map(task => task.goal);

const Z = { keys: ['ctrl-z'] };
const C = { keys: ['ctrl-c'] };

async function passes(goal, prefix, line, opts = {}) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line, opts);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
  assert.equal(chapter.tasks.length, 7);
});

test('new commands and keys get a clue in their first goal', () => {
  assert.match(BACKGROUND, /`sleep 300 &`/);
  assert.match(JOBS, /`jobs`/);
  assert.match(PAUSE, /`sleep 200`.*Ctrl\+Z/);
  assert.match(RESUME, /`bg`/);
  assert.match(INTERRUPT, /`fg`.*Ctrl\+C/);
  assert.match(KILL, /`kill %1`/);
  assert.match(DONE, /`sleep 5 &`/);
});

test('the lesson covers &, jobs, Ctrl+Z, bg, fg, Ctrl+C and kill %N', () => {
  for (const word of ['&amp;', 'jobs', 'bg', 'fg', 'kill %1']) assert.ok(chapter.lesson.includes(`<code>${word}`), word);
  assert.match(chapter.lesson, /<kbd>Ctrl<\/kbd>\+<kbd>Z<\/kbd>/);
  assert.match(chapter.lesson, /<kbd>Ctrl<\/kbd>\+<kbd>C<\/kbd>/);
});

test('the setup makes the workshop and brings the player home', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.ok(nodeAt(obs.tree, `${HOME}/workshop/sign.txt`));
});

test('the solve finishes every task and leaves no jobs behind', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
  assert.deepEqual((await backend.observe()).jobs, []);
});

const NEAR_MISSES = [
  [BACKGROUND, [], 'sleep 1', 'sleep 300 &'],
  [JOBS, [], 'jobs', null],
  [JOBS, ['sleep 300 &'], 'ps', 'jobs'],
  [PAUSE, [], 'sleep 200', null, C],
  [RESUME, ['sleep 300 &'], 'bg', null],
  [RESUME, ['sleep 200\u001a'], 'fg', null, C],
  [INTERRUPT, ['sleep 300 &'], 'fg', null, Z],
  [INTERRUPT, ['sleep 300 &'], 'sleep 9', null, C],
  [KILL, ['sleep 300 &'], 'kill %7', 'kill %1'],
  [KILL, ['sleep 300 &'], 'jobs', 'kill -9 %1'],
  [DONE, ['sleep 300 &'], 'kill %1', null],
];

for (const [goal, prefix, miss, hit, opts] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${opts ? ` ${JSON.stringify(opts.keys)}` : ''}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss, opts), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

test('the keys complete their tasks: Ctrl+Z pauses, bg resumes, fg then Ctrl+C interrupts', async () => {
  assert.equal(await passes(PAUSE, [], 'sleep 200', Z), true);
  assert.equal(await passes(RESUME, ['sleep 200\u001a'], 'bg'), true);
  assert.equal(await passes(INTERRUPT, ['sleep 300 &'], 'fg', C), true);
  assert.equal(await passes(INTERRUPT, ['sleep 300 &'], 'fg %1', C), true);
  assert.equal(await passes(DONE, ['sleep 5 &'], 'sleep 6'), true);
});

const NEAR_NOTES = [
  [JOBS, [], 'jobs', /sleep 300 &/],
  [PAUSE, [], 'sleep 200', /Ctrl\+Z/, C],
  [RESUME, ['sleep 300 &'], 'bg', /Ctrl\+Z/],
  [INTERRUPT, ['sleep 300 &'], 'fg', /Ctrl\+C/, Z],
  [KILL, ['sleep 300 &'], 'kill %7', /jobs/],
  [KILL, ['sleep 300 &'], 'kill 1', /%/],
];

for (const [goal, prefix, line, note, opts] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}${opts ? ` ${JSON.stringify(opts.keys)}` : ''}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line, opts ?? {});
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss orders name two random tasks and the one to cancel', async () => {
  const seen = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    const orders = nodeAt(obs.tree, `${HOME}/workshop/orders.txt`).content;
    assert.notEqual(secret.cancel, secret.keep);
    assert.ok(orders.includes(`sleep ${secret.cancel}`) && orders.includes(`sleep ${secret.keep}`));
    seen.add(`${secret.cancel}-${secret.keep}`);
  }
  assert.ok(seen.size >= 5);
});

test('the boss is beaten with two jobs, fg then Ctrl+Z, then kill %N, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    let won = false;
    for (const line of chapter.boss.solve(obs)) won = chapter.boss.done((await type(backend, line)).ctx, secret);
    assert.equal(won, true, `seed ${seed}`);
  }
});

test('the boss is not won if the cancelled task never started', async () => {
  const { backend, secret } = await startBoss(chapter, 2);
  await type(backend, `sleep ${secret.keep} &`);
  const { ctx } = await type(backend, 'fg', Z);
  assert.equal(chapter.boss.done(ctx, secret), false);
  assert.match(chapter.boss.near(ctx, secret), new RegExp(`sleep ${secret.cancel}`));
});

const BOSS_NOTES = [
  [s => [`sleep ${s.cancel} &`, `sleep ${s.keep} &`], 'fg', Z, /kill/],
  [s => [`sleep ${s.cancel} &`, `sleep ${s.keep} &`, 'kill %2'], 'jobs', {}, /cancel/],
  [s => [`sleep ${s.cancel} &`, `sleep ${s.keep} &`, 'kill %1'], 'jobs', {}, /fg/],
];

for (const [prefix, line, opts, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} after ${prefix({ cancel: 'C', keep: 'K' }).join('; ')}; ${line}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    for (const before of prefix(secret)) await type(backend, before);
    const { ctx } = await type(backend, line, opts);
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

const NOT_COMMANDS = new Set(['&amp;', '&', '%1', 'sleep', '~/workshop/orders.txt', 'Done', 'Stopped', 'Running', '[1] 2345', '[1]+  Done   sleep 5', '+', 'sleep 300', '%']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...codeSnippets(chapter.why).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  for (const line of lines) {
    const backend = await startChapter(chapter);
    const long = /^sleep \d+$/.test(line);
    assert.equal(notFound((await type(backend, line, long ? { keys: ['ctrl-c'] } : {})).result), false, line);
  }
});
