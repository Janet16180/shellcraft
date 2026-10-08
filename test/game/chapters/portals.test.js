import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/portals.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [TYPES, MAKE, WHERE, STEP, HARD, INODES, SURVIVE, BROKEN, FIX] = chapter.tasks.map(task => task.goal);

const PORTAL = ['ln -s ~/forest/cave/deep ~/portal'];
const LINKED = ['ln ~/portals/scroll.txt ~/portals/copy.txt'];
const REMOVED = [...LINKED, 'rm ~/portals/scroll.txt'];

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

test('the chapter follows the authoring contract and shows the links explainer', () => {
  assertChapter(chapter);
  assert.equal(chapter.tasks.length, 9);
  assert.equal(chapter.explainer, 'links');
});

test('new commands and options get a clue in their first goal', () => {
  assert.match(TYPES, /`ls -l ~`/);
  assert.match(MAKE, /`~\/portal`.*`~\/forest\/cave\/deep`.*`ln -s`/);
  assert.match(HARD, /`~\/portals\/scroll\.txt`.*`~\/portals\/copy\.txt`.*`ln`/);
  assert.match(INODES, /`ls -li ~\/portals`/);
  assert.match(FIX, /`~\/portals\/old_portal`.*`ln -sf`/);
});

test('the lesson explains the type character, soft links, hard links and inodes', () => {
  assert.match(chapter.lesson, /<code>l<\/code>/);
  assert.match(chapter.lesson, /<b>soft link<\/b>/);
  assert.match(chapter.lesson, /<b>hard link<\/b>/);
  assert.match(chapter.lesson, /<b>inode<\/b>/);
});

test('the setup makes the portals area with a scroll and a link to it, and no portal yet', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.equal(nodeAt(obs.tree, `${HOME}/portal`, { follow: false }), null);
  assert.equal(nodeAt(obs.tree, `${HOME}/portals/old_portal`, { follow: false }).target, `${HOME}/portals/scroll.txt`);
});

test('the setup can run again over a finished chapter and its boss room', async () => {
  const { backend } = await startBoss(chapter, 3);
  await type(backend, 'cd');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${HOME}/portals`).children).sort(), ['old_portal', 'scroll.txt']);
  assert.equal(nodeAt(obs.tree, `${HOME}/portal`, { follow: false }), null);
  assert.equal(nodeAt(obs.tree, `${HOME}/maze`), null);
});

test('the solve finishes every task, and fails only where the tasks expect it', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, ['cat ~/portals/old_portal: cat: /home/hero/portals/old_portal: No such file or directory\n']);
});

const NEAR_MISSES = [
  [TYPES, [], 'ls ~', 'ls -l ~'],
  [TYPES, [], 'ls -l /etc', 'ls -la'],
  [MAKE, [], 'ln ~/forest/cave/deep ~/portal', 'ln -s ~/forest/cave/deep ~/portal'],
  [MAKE, [], 'ln -s ~/forest/cave ~/portal', 'ln -s forest/cave/deep portal'],
  [MAKE, [], 'cp -r ~/forest/cave/deep ~/portal', null],
  [WHERE, PORTAL, 'ls ~/portal', 'ls -l ~/portal'],
  [WHERE, PORTAL, 'ls -l ~/forest/cave/deep', 'readlink ~/portal'],
  [STEP, PORTAL, 'cd ~/forest/cave/deep', 'cd ~/portal'],
  [HARD, [], 'cp ~/portals/scroll.txt ~/portals/copy.txt', 'ln ~/portals/scroll.txt ~/portals/copy.txt'],
  [HARD, [], 'ln -s ~/portals/scroll.txt ~/portals/copy.txt', null],
  [INODES, LINKED, 'ls -l ~/portals', 'ls -li ~/portals'],
  [INODES, LINKED, 'ls -i ~/forest', 'ls -i ~/portals'],
  [SURVIVE, LINKED, 'rm ~/portals/copy.txt', null],
  [SURVIVE, REMOVED, 'ls ~/portals', 'cat ~/portals/copy.txt'],
  [SURVIVE, LINKED, 'cat ~/portals/copy.txt', null],
  [BROKEN, [], 'cat ~/portals/old_portal', null],
  [BROKEN, REMOVED, 'ls -l ~/portals/old_portal', 'cat ~/portals/old_portal'],
  [FIX, REMOVED, 'ln -s ~/portals/copy.txt ~/portals/old_portal', 'ln -sf ~/portals/copy.txt ~/portals/old_portal'],
  [FIX, REMOVED, 'cp ~/portals/copy.txt ~/portals/old_portal', null],
  [FIX, [], 'ln ~/portals/scroll.txt ~/portals/copy.txt', 'ln -sf copy.txt ~/portals/old_portal'],
  [FIX, REMOVED, 'rm ~/portals/old_portal', 'rm ~/portals/old_portal && ln -s ~/portals/copy.txt ~/portals/old_portal'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [TYPES, [], 'ls ~', /-l/],
  [MAKE, [], 'ln ~/forest/cave/deep ~/portal', /-s/],
  [MAKE, [], 'ln -s ~/portal ~/forest/cave/deep', /target comes first/],
  [MAKE, [], 'cp -r ~/forest/cave/deep ~/portal', /copy/],
  [WHERE, PORTAL, 'ls ~/portal', /-l/],
  [STEP, PORTAL, 'cd ~/forest/cave/deep', /through/],
  [HARD, [], 'cp ~/portals/scroll.txt ~/portals/copy.txt', /separate copy/],
  [HARD, [], 'ln -s ~/portals/scroll.txt ~/portals/copy.txt', /without -s/],
  [SURVIVE, LINKED, 'rm ~/portals/copy.txt', /scroll\.txt/],
  [BROKEN, [], 'cat ~/portals/old_portal', /rm ~\/portals\/scroll\.txt/],
  [FIX, REMOVED, 'ln -s ~/portals/copy.txt ~/portals/old_portal', /-f/],
  [FIX, REMOVED, 'cp ~/portals/copy.txt ~/portals/old_portal', /link/],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss maze has random gates, one broken, and a vaults directory that cannot be listed', async () => {
  const words = new Set();
  for (const seed of SEEDS) {
    const { obs, secret, backend } = await startBoss(chapter, seed);
    const maze = nodeAt(obs.tree, `${HOME}/maze`);
    const gates = Object.keys(maze.children).filter(name => name.startsWith('gate_'));
    assert.ok(gates.length >= 3 && gates.length <= 4, `seed ${seed}`);
    assert.ok(gates.includes(secret.gate.split('/').pop()));
    assert.equal(nodeAt(obs.tree, secret.gate), null, 'the broken gate leads nowhere');
    assert.equal(nodeAt(obs.tree, `${HOME}/maze/vaults`).mode & 0o777, 0o311);
    assert.match((await type(backend, 'ls ~/maze/vaults')).result.output.map(c => c.text).join(''), /Permission denied/);
    words.add(secret.word);
  }
  assert.ok(words.size >= 10);
});

test('the boss is beaten by repairing the gate and writing the treasure word, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    let won = false;
    for (const line of chapter.boss.solve(obs)) won = chapter.boss.done((await type(backend, line)).ctx, secret);
    assert.equal(won, true, `seed ${seed}`);
  }
});

test('the exact hint repairs the gate from anywhere', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    await type(backend, chapter.boss.hints[2](secret));
    const { ctx } = await type(backend, `echo ${secret.word} > ~/maze/answer.txt`);
    assert.ok(chapter.boss.done(ctx, secret), `seed ${seed}`);
  }
});

const BOSS_NOTES = [
  [s => `echo ${s.word} > ~/maze/answer.txt`, /broken gate/],
  [s => `ln -sf ${s.vault} ${s.gate}`, /answer\.txt/],
  [s => `ln -sf ${s.vault} ${s.gate} && echo nope > ~/maze/answer.txt`, /treasure\.txt/],
  [s => `rm ${s.gate} && mkdir ${s.gate}`, /link/],
  [s => `ln -sf ${HOME}/maze ${s.gate}`, /map\.txt/],
];

for (const [line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${line({ gate: 'GATE', vault: 'VAULT', word: 'WORD' })}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    const { ctx } = await type(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

const NOT_COMMANDS = new Set(['-', 'd', 'l', '~/maze/map.txt', '~/maze/answer.txt', 'gate_', '~/maze', '->', 'TARGET', 'NAME', '-s', '-f', '-i', '~/maze/vaults', 'treasure.txt', 'current']);

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
    assert.equal(notFound((await type(backend, line)).result), false, line);
  }
});
