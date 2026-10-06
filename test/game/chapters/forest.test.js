import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/forest.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

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

test('the Tab task\'s last hint is the key sequence, not a line to paste', () => {
  assert.equal(chapter.tasks[GOAL['Walk into the forest again, and let Tab finish the name']].hints[2], 'Type cd fo, press Tab, then press Enter.');
});

test('the lesson bridges Linux\'s "up" toward / with the map\'s stairs down into the dungeon', () => {
  const text = chapter.lesson.replace(/<[^>]+>/g, '');
  assert.match(text, /\bup\b/);
  assert.match(text, /\bdown\b/);
  assert.match(text, /\bdungeon\b/);
});

test('everything but the lesson says deeper and back out, keeping up for the one sentence that explains it', () => {
  const words = [
    ...chapter.tasks.flatMap(task => [task.goal, task.tip, ...task.hints]),
    ...chapter.boss.hints.filter(hint => typeof hint === 'string'),
    ...chapter.spells.flatMap(spell => [spell.summary, ...spell.examples.map(([, note]) => note)]),
    ...[...chapter.recap, ...chapter.field].map(([, meaning]) => meaning),
  ];
  for (const text of words) assert.doesNotMatch(text, /\b(up|down)\b/i, text);
});

test('Tab completes cd fo to cd forest/, as the lesson says', async () => {
  const backend = await startChapter(chapter);
  assert.equal((await backend.complete('cd fo')).line, 'cd forest/');
});

const NEAR_MISSES = [
  ['Enter the forest', [], 'ls forest', 'cd forest'],
  ['Enter the forest', [], 'cd junk', 'cd forest/cave'],
  ['Go deeper into the cave, all the way to `forest/cave/deep`', ['cd forest'], 'cd cave', 'cd cave/deep'],
  ['Read what glitters in there', ['cd forest/cave/deep'], 'ls', 'cat ancient_key.txt'],
  ['From deep, step back out into the cave with `..`', ['cd forest/cave/deep'], 'cd ~/forest/cave', 'cd ..'],
  ['From deep, step back out into the cave with `..`', ['cd forest/cave/deep'], 'cd ../..', 'cd ../'],
  ['Jump to the river with an absolute path', ['cd forest/cave'], 'cd ../river', 'cd /home/hero/forest/river'],
  ['Jump to the river with an absolute path', ['cd forest/cave'], 'cd /home/hero/forest/clearing', 'cd ~/forest/river'],
  ['Jump back to where you were with `cd -`', ['cd forest/cave', 'cd /home/hero/forest/river'], 'cd ..', 'cd -'],
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

const NEAR_NOTES = [
  ['Enter the forest', [], 'ls forest', /cd forest/],
  ['Enter the forest', [], 'cd forest', null],
  ['Enter the forest', ['cd forest'], 'ls ~/forest', null],
  ['Go deeper into the cave, all the way to `forest/cave/deep`', ['cd forest'], 'cd forest/cave/deep', { coach: /already in forest.*cave\/deep/ }],
  ['Go deeper into the cave, all the way to `forest/cave/deep`', [], 'cd /forest/cave/deep', { coach: /\/home\/hero\/forest/ }],
  ['Go deeper into the cave, all the way to `forest/cave/deep`', ['cd forest'], 'cd cave/deep', null],
  ['Go deeper into the cave, all the way to `forest/cave/deep`', [], 'cd forest/caev/deep', null],
  ['From deep, step back out into the cave with `..`', ['cd forest/cave/deep'], 'cd ~/forest/cave', /\.\./],
  ['From deep, step back out into the cave with `..`', ['cd forest/cave/deep'], 'cd ..', null],
  ['Jump to the river with an absolute path', ['cd forest/cave'], 'cd ../river', /relative/],
  ['Jump to the river with an absolute path', ['cd forest/cave'], 'cd /forest/river', { coach: /\/home\/hero\/forest/ }],
  ['Jump to the river with an absolute path', ['cd forest/cave'], 'cd /home/hero/forest/river', null],
  ['Jump to the river with an absolute path', ['cd forest/river'], 'cd .', /relative/],
  ['Jump to the river with an absolute path', ['cd forest/river', 'cd ../cave'], 'cd -', null],
  ['Go home with the shortest command there is', ['cd forest'], 'cd ~', /cd on its own/],
  ['Go home with the shortest command there is', ['cd forest'], 'cd /home/hero', /cd on its own/],
  ['Go home with the shortest command there is', ['cd forest'], 'cd', null],
  ['Go home with the shortest command there is', [], 'cd ~', /cd on its own/],
  ['Walk into the forest again, and let Tab finish the name', [], 'cd forest', /Tab/],
  ['Walk into the forest again, and let Tab finish the name', [], 'cd fo\t', null],
  ['Walk into the forest again, and let Tab finish the name', [], 'ls', null],
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

test('climbing into the cave with .. from the river, not from deep, does not count', async () => {
  assert.equal(await passes('From deep, step back out into the cave with `..`', ['cd forest/river'], 'cd ../cave'), false);
});

test('using Tab while already in the forest does not count as walking in with Tab', async () => {
  assert.equal(await passes('Walk into the forest again, and let Tab finish the name', ['cd forest'], 'ls ca\t'), false);
});

test('cd - counts even when the previous directory was this same room, because cd - did its job', async () => {
  assert.equal(await passes('Jump back to where you were with `cd -`', ['cd forest', 'cd .'], 'cd -'), true);
});

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

test('an absolute jump to the wrong room does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 5);
  const wrong = secret.target.endsWith('/clearing') ? '/home/hero/forest/river' : '/home/hero/forest/clearing';
  assert.equal(chapter.boss.done((await type(backend, `cd ${wrong}`)).ctx, secret), false);
});

test('on a line of several commands, the jump that lands on the beacon is the one judged', async () => {
  const { backend, secret, obs } = await startBoss(chapter, 6);
  assert.equal(chapter.boss.done((await type(backend, `cd /tmp; cd ${relative('/tmp', secret.target)}`)).ctx, secret), false);
  await type(backend, `cd ${obs.cwd}`);
  assert.equal(chapter.boss.done((await type(backend, `cd /etc; cd ${secret.target}`)).ctx, secret), true);
});

test('the beacon\'s flame does not claim how the player got there', async () => {
  const { obs, secret } = await startBoss(chapter, 1);
  assert.doesNotMatch(nodeAt(obs.tree, `${secret.target}/flame.txt`).content, /absolute|relative|path/);
});

test('a near note says the path was relative when a relative cd reaches the beacon', async () => {
  const { backend, secret, obs } = await startBoss(chapter, 7);
  const { ctx } = await type(backend, `cd ${relative(obs.cwd, secret.target)}`);
  assert.match(chapter.boss.near(ctx, secret), /relative/);
});

test('a near note says the jump must start in the dungeon when it starts inside the home', async () => {
  const { backend, secret } = await startBoss(chapter, 8);
  await type(backend, 'cd ~/forest');
  const { ctx } = await type(backend, `cd ${secret.target}`);
  assert.match(chapter.boss.near(ctx, secret), /dungeon/);
  assert.match(chapter.boss.near((await type(backend, `cd ${secret.target}`)).ctx, secret), /dungeon/);
});

test('the boss gives no near note for a winning jump or for looking around', async () => {
  const { backend, secret } = await startBoss(chapter, 9);
  assert.equal(chapter.boss.near((await type(backend, 'ls ~/forest')).ctx, secret), null);
  assert.equal(chapter.boss.near((await type(backend, `cd ${secret.target}`)).ctx, secret), null);
});

test('the exact boss hint beats the boss from the dungeon, from home and from the beacon itself', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}, dungeon: ${line}`);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}, beacon: ${line}`);
    await type(backend, 'cd');
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}, home: ${line}`);
  }
});

const NOT_COMMANDS = new Set(['/', '/home/hero', '..', '~', 'cd forest/', '~/forest/river']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]).filter(hint => !hint.startsWith('Type cd fo, press Tab')),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
