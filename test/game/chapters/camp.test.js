import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/camp.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const CAMP = `${HOME}/camp`;
const RIVER = `${HOME}/forest/river`;
const PIT = `${CAMP}/firepit`;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [PITCH, TENT, TOUCH, WRITE, COPY, MOVE, RENAME] = chapter.tasks.map(task => task.goal);

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('simple commands get a hint in the goal, and the lines with two paths or a redirection are shown in full', () => {
  assert.match(PITCH, /`mkdir`/);
  assert.match(TOUCH, /`touch`/);
  assert.match(WRITE, /`echo wood > ~\/camp\/supplies\.txt`/);
  assert.match(COPY, /`cp ~\/forest\/cave\/deep\/ancient_key\.txt ~\/camp`/);
  assert.match(MOVE, /`mv`/);
  for (const goal of [TENT, RENAME]) assert.doesNotMatch(goal, /`(mkdir|touch|echo|cp|mv)\b/, goal);
});

test('the solve finishes every task on the base world without an error', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

test('the setup clears an old camp, restores the forest and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, chapter.solve);
  await type(backend, 'cd /etc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.equal(nodeAt(obs.tree, CAMP), null);
  assert.equal(nodeAt(obs.tree, `${HOME}/forest/clearing/mushroom.txt`).type, 'file');
});

const NEAR_MISSES = [
  [PITCH, [], 'touch camp', 'mkdir camp'],
  [PITCH, [], 'mkdir tent', 'mkdir ~/camp'],
  [TENT, ['mkdir camp'], 'mkdir tent', 'mkdir camp/tent'],
  [TENT, ['mkdir camp'], 'touch camp/tent', 'mkdir ~/camp/tent'],
  [TOUCH, ['mkdir camp'], 'touch supplies.txt', 'touch camp/supplies.txt'],
  [TOUCH, ['mkdir camp'], 'mkdir camp/supplies.txt', 'touch ~/camp/supplies.txt'],
  [WRITE, ['mkdir camp'], 'echo wood', 'echo wood > camp/supplies.txt'],
  [WRITE, ['mkdir camp'], 'echo food > camp/supplies.txt', 'echo wood > ~/camp/supplies.txt'],
  [COPY, ['mkdir camp'], 'cp forest/cave/deep/ancient_key.txt .', 'cp forest/cave/deep/ancient_key.txt camp'],
  [COPY, ['mkdir camp'], 'mv forest/cave/deep/ancient_key.txt camp', 'cp ~/forest/cave/deep/ancient_key.txt ~/camp/'],
  [MOVE, ['mkdir -p camp/tent'], 'cp forest/clearing/mushroom.txt camp/tent', 'mv forest/clearing/mushroom.txt camp/tent'],
  [MOVE, ['mkdir -p camp/tent'], 'mv forest/clearing/mushroom.txt camp', 'mv ~/forest/clearing/mushroom.txt ~/camp/tent/'],
  [RENAME, ['mkdir camp', 'touch camp/supplies.txt'], 'cp camp/supplies.txt camp/pack.txt', 'mv camp/supplies.txt camp/pack.txt'],
  [RENAME, ['mkdir camp', 'touch camp/supplies.txt'], 'mv camp/supplies.txt camp/bag.txt', 'mv ~/camp/supplies.txt ~/camp/pack.txt'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}, but is by ${JSON.stringify(hit)}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [PITCH, [], 'touch camp', /file.*rm camp.*mkdir/],
  [PITCH, [], 'mkdir camp', null],
  [WRITE, ['mkdir camp'], 'echo food > camp/supplies.txt', /exactly.*wood/],
  [WRITE, ['mkdir camp'], 'echo wood', />/],
  [WRITE, ['mkdir camp'], 'echo wood > camp/supplies.txt', null],
  [COPY, ['mkdir camp'], 'mv forest/cave/deep/ancient_key.txt camp', /mv ~\/camp\/ancient_key\.txt ~\/forest\/cave\/deep.*cp/],
  [MOVE, ['mkdir -p camp/tent'], 'cp forest/clearing/mushroom.txt camp/tent', /still in the clearing.*mv/],
  [MOVE, ['mkdir -p camp/tent'], 'mv forest/clearing/mushroom.txt camp/tent', null],
  [RENAME, ['mkdir camp', 'touch camp/supplies.txt'], 'cp camp/supplies.txt camp/pack.txt', /mv/],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

const flintsBy = obs => Object.keys(nodeAt(obs.tree, RIVER).children).filter(name => name.startsWith('flint_'));

test('the boss room brings the player home, keeps the camp and lays one flint_ file by the river', async () => {
  const names = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.match(secret.flint, /^\/home\/hero\/forest\/river\/flint_[acdefhjkmnprtuvwxy34679]{3}\.txt$/);
    assert.equal(nodeAt(obs.tree, `${CAMP}/pack.txt`).type, 'file', 'the camp the player built stays');
    assert.equal(nodeAt(obs.tree, PIT), null);
    assert.deepEqual(flintsBy(obs).map(name => `${RIVER}/${name}`), [secret.flint], `seed ${seed}`);
    names.add(flintsBy(obs)[0]);
  }
  assert.ok(names.size >= 3, [...names].join(', '));
});

test('the boss is beaten by finding the flint, making the pit, moving the flint and lighting the fire, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    for (const line of lines) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, false, false, true], `seed ${seed}: ${lines.join('; ')}`);
  }
});

test('the steps may come in any order', async () => {
  const { backend, secret } = await startBoss(chapter, 3);
  const flint = secret.flint.replace(HOME, '~');
  for (const line of ['mkdir camp/firepit', 'echo lit > camp/firepit/fire.txt']) assert.equal(chapter.boss.done((await type(backend, line)).ctx, secret), false, line);
  assert.equal(chapter.boss.done((await type(backend, `mv ${flint} camp/firepit`)).ctx, secret), true);
});

test('copying the flint instead of moving it does not beat the boss, and says so', async () => {
  const { backend, secret } = await startBoss(chapter, 4);
  await type(backend, 'mkdir camp/firepit; echo lit > camp/firepit/fire.txt');
  const { ctx } = await type(backend, `cp ${secret.flint} camp/firepit`);
  assert.equal(chapter.boss.done(ctx, secret), false);
  assertNear(chapter.boss.near(ctx, secret), ctx, /still by the river.*mv/);
});

test('a fire.txt with other words does not beat the boss, and says what it should hold', async () => {
  const { backend, secret } = await startBoss(chapter, 5);
  await type(backend, `mkdir camp/firepit; mv ${secret.flint} camp/firepit`);
  const { ctx } = await type(backend, 'echo fire > camp/firepit/fire.txt');
  assert.equal(chapter.boss.done(ctx, secret), false);
  assertNear(chapter.boss.near(ctx, secret), ctx, /exactly.*lit/);
});

test('a missing camp gets a near note that says to make it first', async () => {
  const { backend, secret } = await startBoss(chapter, 6);
  await type(backend, 'rm -r camp');
  const { ctx } = await type(backend, 'mkdir camp/firepit');
  assertNear(chapter.boss.near(ctx, secret), ctx, /mkdir ~\/camp/);
});

test('the boss gives no near note for looking around or making the pit', async () => {
  const { backend, secret } = await startBoss(chapter, 9);
  for (const line of ['ls ~/forest/river', 'mkdir camp/firepit']) {
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

test('the flint is kept off the map until an ls lists the river', () => {
  assert.deepEqual(chapter.boss.hidden({ flint: `${RIVER}/flint_abc.txt` }), [`${RIVER}/flint_abc.txt`]);
});

const NOT_COMMANDS = new Set(['~/forest/river', 'flint_', '~/camp/firepit', '~/camp/firepit/fire.txt', 'lit', '>', 'cp FROM TO', 'mv FROM TO']);

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
