import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/forest.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/game/checks.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const relative = (from, to) => {
  const up = from.split('/').filter(Boolean).map(() => '..').join('/');
  return `${up}${to}`;
};

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('the solve finishes every task on the base world without an error', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

test('the setup restores the forest, clears the letters of chapter 1 and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'rm -r forest/cave');
  await type(backend, 'touch letter3.txt');
  await type(backend, 'cd /etc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.equal(nodeAt(obs.tree, `${HOME}/forest/cave/deep/ancient_key.txt`).type, 'file');
  assert.equal(nodeAt(obs.tree, `${HOME}/letter3.txt`), null);
});

test('Tab completes cd fo to cd forest/, as the lesson says', async () => {
  const backend = await startChapter(chapter);
  assert.equal((await backend.complete('cd fo')).line, 'cd forest/');
});

const NEAR_MISSES = [
  ['Enter the forest', [], 'ls forest', 'cd forest'],
  ['Enter the forest', [], 'cd junk', 'cd forest/cave'],
  ['Walk down to the deepest part of the cave: forest/cave/deep', ['cd forest'], 'cd cave', 'cd cave/deep'],
  ['Read what glitters down there', ['cd forest/cave/deep'], 'ls', 'cat ancient_key.txt'],
  ['From deep, climb back up into the cave with ..', ['cd forest/cave/deep'], 'cd ~/forest/cave', 'cd ..'],
  ['From deep, climb back up into the cave with ..', ['cd forest/cave/deep'], 'cd ../..', 'cd ../'],
  ['Jump to the river with an absolute path', ['cd forest/cave'], 'cd ../river', 'cd /home/hero/forest/river'],
  ['Jump to the river with an absolute path', ['cd forest/cave'], 'cd /home/hero/forest/clearing', 'cd ~/forest/river'],
  ['Jump back to where you were with cd -', ['cd forest/cave', 'cd /home/hero/forest/river'], 'cd ..', 'cd -'],
  ['Go home with the shortest command there is', ['cd forest'], 'cd /home/hero', 'cd'],
  ['Go home with the shortest command there is', ['cd forest'], 'cd ~', 'cd'],
  ['Walk into the forest again, and let Tab finish the name', [], 'cd forest', 'cd fo\t'],
  ['Walk into the forest again, and let Tab finish the name', [], 'cd ju\t', 'cd fo\t'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}, but is by ${JSON.stringify(hit)}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

test('the trapdoor drops the player in the dungeon and lights one beacon in the forest', async () => {
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.ok(!obs.cwd.startsWith(`${HOME}/`) && obs.cwd !== HOME, `seed ${seed}: landed in ${obs.cwd}`);
    assert.match(secret.target, /^\/home\/hero\/forest(\/[a-z]+)*\/beacon_[acdefhjkmnprtuvwxy34679]{3}$/);
    assert.equal(nodeAt(obs.tree, secret.target).type, 'dir');
  }
});

test('the beacon is in different places for different seeds', async () => {
  const targets = new Set();
  for (const seed of SEEDS) targets.add((await startBoss(chapter, seed)).secret.target.replace(/beacon_\w+$/, ''));
  assert.ok(targets.size >= 3, [...targets].join(', '));
});

test('the boss is beaten by one absolute cd from the dungeon, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    assert.equal(lines.length, 1);
    assert.ok(chapter.boss.done((await type(backend, lines[0])).ctx, secret), `seed ${seed}: ${lines[0]}`);
  }
});

test('a ~ path counts as absolute, because bash expands it before cd runs', async () => {
  const { backend, secret } = await startBoss(chapter, 1);
  const line = `cd ${secret.target.replace(HOME, '~')}`;
  assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), line);
});

test('a relative path from the dungeon does not beat the boss, though it reaches the beacon', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const { ctx } = await type(backend, `cd ${relative(obs.cwd, secret.target)}`);
    assert.equal(ctx.cwd, secret.target, `seed ${seed}`);
    assert.equal(chapter.boss.done(ctx, secret), false, `seed ${seed}`);
  }
});

test('walking to the beacon in two steps does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 3);
  await type(backend, 'cd ~/forest');
  const { ctx } = await type(backend, `cd ${secret.target.slice(`${HOME}/forest/`.length)}`);
  assert.equal(ctx.cwd, secret.target);
  assert.equal(chapter.boss.done(ctx, secret), false);
});

test('an absolute jump taken from inside the home does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 4);
  await type(backend, 'cd');
  const { ctx } = await type(backend, `cd ${secret.target}`);
  assert.equal(chapter.boss.done(ctx, secret), false);
});

test('an absolute jump to the wrong room, or two commands on one line, does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 5);
  const wrong = secret.target.endsWith('/clearing') ? '/home/hero/forest/river' : '/home/hero/forest/clearing';
  assert.equal(chapter.boss.done((await type(backend, `cd ${wrong}`)).ctx, secret), false);
  await type(backend, 'cd /tmp');
  assert.equal(chapter.boss.done((await type(backend, `cd /etc; cd ${secret.target}`)).ctx, secret), false);
});

test('the exact boss hint is the line that beats the boss', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

const NOT_COMMANDS = new Set(['/', '/home/hero', '..', '.', '~', 'cd forest/', '~/forest/river']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
