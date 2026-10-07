import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/unseen.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [REVEAL, MAP, FIND, READ, LONG, BOTH, SIZE] = chapter.tasks.map(task => task.goal);
const CAVE = `${HOME}/forest/cave`;
const FAIRY = `${HOME}/forest/clearing/.fairy_ring.txt`;

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

test('the chapter has seven tasks, in the order of the design', () => {
  assert.equal(chapter.tasks.length, 7);
  assert.match(REVEAL, /`ls` with `-a`/);
  assert.match(LONG, /`ls` with `-l`/);
  assert.match(BOTH, /`-la`/);
});

test('the solve finishes every task on the base world without an error', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

test('the setup restores the forest and the secret map, hides a fairy ring in the clearing and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'rm -r forest .secret_map');
  await type(backend, 'cd /etc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.equal(nodeAt(obs.tree, `${HOME}/.secret_map`).type, 'file');
  assert.equal(nodeAt(obs.tree, FAIRY).type, 'file');
  assert.equal(nodeAt(obs.tree, `${CAVE}/deep/ancient_key.txt`).type, 'file');
});

test('plain ls in the clearing does not show the fairy ring, and ls -a does', async () => {
  const backend = await startChapter(chapter);
  assert.doesNotMatch((await type(backend, 'ls ~/forest/clearing')).result.output.map(c => c.text).join(''), /fairy/);
  assert.match((await type(backend, 'ls -a ~/forest/clearing')).result.output.map(c => c.text).join(''), /\.fairy_ring\.txt/);
});

const NEAR_MISSES = [
  [REVEAL, [], 'ls', 'ls -a'],
  [REVEAL, [], 'ls -a forest', 'ls -A ~'],
  [REVEAL, ['cd forest'], 'ls -a', 'ls -a ~'],
  [MAP, [], 'cat secret_map', 'cat .secret_map'],
  [MAP, [], 'ls -a', 'cat ~/.secret_map'],
  [FIND, [], 'ls forest/clearing', 'ls -a forest/clearing'],
  [FIND, [], 'ls -a forest', 'ls -a ~/forest/clearing'],
  [FIND, ['cd forest/clearing'], 'ls', 'ls -a'],
  [READ, [], 'cat forest/clearing/fairy_ring.txt', 'cat forest/clearing/.fairy_ring.txt'],
  [READ, ['cd forest/clearing'], 'cat mushroom.txt', 'cat .fairy_ring.txt'],
  [LONG, [], 'ls', 'ls -l'],
  [LONG, [], 'ls -l forest', 'ls -l ~'],
  [BOTH, [], 'ls -l', 'ls -la'],
  [BOTH, [], 'ls -a', 'ls -l -a'],
  [SIZE, [], 'cat forest/cave/deep/ancient_key.txt', 'ls -l forest/cave/deep/ancient_key.txt'],
  [SIZE, [], 'ls -l forest/cave', 'ls -l ~/forest/cave/deep'],
  [SIZE, [], 'ls forest/cave/deep', 'ls -la forest/cave/deep'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}, but is by ${JSON.stringify(hit)}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [REVEAL, [], 'ls', /-a/],
  [REVEAL, [], 'ls -a', null],
  [REVEAL, [], 'ls forest', null],
  [MAP, [], 'cat secret_map', /dot.*\.secret_map/],
  [MAP, [], 'cat .secret_map', null],
  [FIND, [], 'ls forest/clearing', /-a/],
  [FIND, ['cd forest/clearing'], 'ls', /-a/],
  [FIND, [], 'ls forest', null],
  [READ, [], 'cat forest/clearing/fairy_ring.txt', /dot.*\.fairy_ring\.txt/],
  [READ, [], 'cat forest/clearing/.fairy_ring.txt', null],
  [SIZE, [], 'cat forest/cave/deep/ancient_key.txt', /ls -l/],
  [SIZE, [], 'ls -l forest/cave/deep/ancient_key.txt', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    assert.ok(goal in GOAL, `no task named ${goal}`);
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

const nameOf = path => path.slice(path.lastIndexOf('/') + 1);

test('the boss room brings the player home and hides one .tunnel_ directory with a treasure in the cave', async () => {
  const names = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.match(secret.target, /^\/home\/hero\/forest\/cave\/\.tunnel_[acdefhjkmnprtuvwxy34679]{3}$/);
    assert.equal(nodeAt(obs.tree, `${secret.target}/treasure.txt`).type, 'file');
    const tunnels = Object.keys(nodeAt(obs.tree, CAVE).children).filter(name => name.startsWith('.tunnel_'));
    assert.deepEqual(tunnels, [nameOf(secret.target)], `seed ${seed}`);
    names.add(tunnels[0]);
  }
  assert.ok(names.size >= 3, [...names].join(', '));
});

test('the boss is beaten by ls -a, walking into the tunnel and reading the treasure, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    for (const line of lines) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, false, true], `seed ${seed}: ${lines.join('; ')}`);
  }
});

test('reading the treasure from outside the tunnel does not beat the boss, and says to walk in', async () => {
  const { backend, secret } = await startBoss(chapter, 4);
  const { ctx } = await type(backend, `cat ${secret.target}/treasure.txt`);
  assert.equal(chapter.boss.done(ctx, secret), false);
  assertNear(chapter.boss.near(ctx, secret), ctx, /cd/);
});

test('walking into the tunnel alone does not beat the boss yet', async () => {
  const { backend, secret } = await startBoss(chapter, 7);
  assert.equal(chapter.boss.done((await type(backend, `cd ${secret.target}`)).ctx, secret), false);
});

test('a plain ls of the cave earns a near note about the dot', async () => {
  const { backend, secret } = await startBoss(chapter, 8);
  const { ctx } = await type(backend, 'ls forest/cave');
  assertNear(chapter.boss.near(ctx, secret), ctx, /dot.*ls -a/);
});

test('the boss gives no near note for ls -a of the cave or walking in', async () => {
  const { backend, secret } = await startBoss(chapter, 9);
  for (const line of ['ls -a forest/cave', `cd ${secret.target}`]) {
    assert.equal(chapter.boss.near((await type(backend, line)).ctx, secret), null, line);
  }
});

test('the exact boss hint beats the boss from home and from inside the tunnel', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}, home: ${line}`);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}, tunnel: ${line}`);
  }
});

const NOT_COMMANDS = new Set(['.', '..', '.secret_map', 'd', '-', '~/forest/cave', '.tunnel_', 'treasure.txt']);

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
