import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/forest.js';
import { NOTES } from '../../../src/game/chapters/awakening.js';
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


test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('the solve finishes every task on the base world without an error', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

test('the setup restores the forest, clears the note of chapter 1 and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'rm -r forest/cave');
  await type(backend, `touch ${NOTES[2]}`);
  await type(backend, 'cd /etc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.equal(nodeAt(obs.tree, `${HOME}/forest/cave/deep/ancient_key.txt`).type, 'file');
  assert.equal(nodeAt(obs.tree, `${HOME}/${NOTES[2]}`), null);
});

test('the Tab task\'s last hint is the key sequence, not a line to paste', () => {
  assert.equal(chapter.tasks[GOAL['Walk into the forest again, and let Tab finish the name']].hints[2], 'Type cd fo, press Tab, then press Enter.');
});

test('the lesson bridges Linux\'s "up" toward / with the map\'s stairs down into the dungeon', () => {
  const text = chapter.lesson;
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
  ['From deep, step back out to its parent, the cave', ['cd forest/cave/deep'], 'cd ~/forest/cave', 'cd ..'],
  ['From deep, step back out to its parent, the cave', ['cd forest/cave/deep'], 'cd ../..', 'cd ../'],
  ['Jump to the river with an absolute path `~/forest/river`', ['cd forest/cave'], 'cd ../river', 'cd /home/hero/forest/river'],
  ['Jump to the river with an absolute path `~/forest/river`', ['cd forest/cave'], 'cd /home/hero/forest/clearing', 'cd ~/forest/river'],
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
  ['From deep, step back out to its parent, the cave', ['cd forest/cave/deep'], 'cd ~/forest/cave', /\.\./],
  ['From deep, step back out to its parent, the cave', ['cd forest/cave/deep'], 'cd ..', null],
  ['Jump to the river with an absolute path `~/forest/river`', ['cd forest/cave'], 'cd ../river', /relative/],
  ['Jump to the river with an absolute path `~/forest/river`', ['cd forest/cave'], 'cd /forest/river', { coach: /\/home\/hero\/forest/ }],
  ['Jump to the river with an absolute path `~/forest/river`', ['cd forest/cave'], 'cd /home/hero/forest/river', null],
  ['Jump to the river with an absolute path `~/forest/river`', ['cd forest/river'], 'cd .', /relative/],
  ['Jump to the river with an absolute path `~/forest/river`', ['cd forest/river', 'cd ../cave'], 'cd -', null],
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
  assert.equal(await passes('From deep, step back out to its parent, the cave', ['cd forest/river'], 'cd ../cave'), false);
});

test('using Tab while already in the forest does not count as walking in with Tab', async () => {
  assert.equal(await passes('Walk into the forest again, and let Tab finish the name', ['cd forest'], 'ls ca\t'), false);
});

test('cd - counts even when the previous directory was this same room, because cd - did its job', async () => {
  assert.equal(await passes('Jump back to where you were with `cd -`', ['cd forest', 'cd .'], 'cd -'), true);
});

const RIVER = `${HOME}/forest/river`;
const nameOf = path => path.slice(path.lastIndexOf('/') + 1);

test('the boss room brings the player home and puts one lantern_ directory by the river', async () => {
  const names = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.match(secret.target, /^\/home\/hero\/forest\/river\/lantern_[acdefhjkmnprtuvwxy34679]{3}$/);
    assert.equal(nodeAt(obs.tree, secret.target).type, 'dir');
    const lanterns = Object.keys(nodeAt(obs.tree, RIVER).children).filter(name => name.startsWith('lantern_'));
    assert.deepEqual(lanterns, [nameOf(secret.target)], `seed ${seed}`);
    names.add(lanterns[0]);
  }
  assert.ok(names.size >= 3, [...names].join(', '));
});

test('the boss is beaten by finding the lantern with ls, walking in and going home, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    for (const line of lines) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, false, true], `seed ${seed}: ${lines.join('; ')}`);
  }
});

test('any one command that goes home from the lantern beats the boss', async () => {
  for (const home of ['cd', 'cd ~', `cd ${HOME}`, 'cd ../../..']) {
    const { backend, secret } = await startBoss(chapter, 5);
    await type(backend, `cd ${secret.target}`);
    assert.ok(chapter.boss.done((await type(backend, home)).ctx, secret), home);
  }
});

test('going home without walking into the lantern does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 6);
  await type(backend, 'cd forest/river');
  assert.equal(chapter.boss.done((await type(backend, 'cd')).ctx, secret), false);
  await type(backend, 'cd forest/river/../..');
  assert.equal(chapter.boss.done((await type(backend, 'cd')).ctx, secret), false);
});

test('walking into the lantern alone does not beat the boss yet', async () => {
  const { backend, secret } = await startBoss(chapter, 7);
  assert.equal(chapter.boss.done((await type(backend, `cd ${secret.target}`)).ctx, secret), false);
});

test('going home from the river instead of the lantern earns a near note that names lantern_', async () => {
  const { backend, secret } = await startBoss(chapter, 8);
  await type(backend, 'cd forest/river');
  const { ctx } = await type(backend, 'cd');
  assertNear(chapter.boss.near(ctx, secret), ctx, /lantern_.*ls ~\/forest\/river/);
});

test('the boss gives no near note for looking around, walking in, a winning step home, or cd at home', async () => {
  const { backend, secret } = await startBoss(chapter, 9);
  for (const line of ['cd', 'ls ~/forest/river', `cd ${secret.target}`, 'cd']) {
    assert.equal(chapter.boss.near((await type(backend, line)).ctx, secret), null, line);
  }
});

test('the exact boss hint beats the boss from home, from the river and from the lantern itself', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}, home: ${line}`);
    await type(backend, 'cd forest/river');
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}, river: ${line}`);
    await type(backend, `cd ${secret.target}`);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}, lantern: ${line}`);
  }
});

const NOT_COMMANDS = new Set(['/', '/home/hero', '..', '~', 'cd forest/', '~/forest/river']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]).filter(hint => !hint.startsWith('Type cd fo, press Tab')),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !['~/forest/river', 'lantern_'].includes(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
