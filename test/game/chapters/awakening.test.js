import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter, { NOTES } from '../../../src/game/chapters/awakening.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
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

test('the setup puts the readme back, clears an old note and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'rm readme.txt');
  await type(backend, `touch ${NOTES[1]}`);
  await type(backend, 'cd /tmp');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, PLAYER.home);
  assert.match(nodeAt(obs.tree, `${PLAYER.home}/readme.txt`).content, /The Guardian of Root/);
  assert.equal(nodeAt(obs.tree, `${PLAYER.home}/${NOTES[1]}`), null);
});

const NEAR_MISSES = [
  ['Ask the terminal who you are (`whoami`)', [], 'Whoami', 'whoami'],
  ['Find out where you are standing (`pwd`)', [], 'PWD', 'pwd'],
  ['Look around your home (`ls`)', [], 'ls forest', 'ls'],
  ['Look around your home (`ls`)', ['cd /tmp'], 'ls', 'ls ~'],
  ['Read the letter left for you (`cat`)', [], 'ls readme.txt', 'cat readme.txt'],
  ['Read the letter left for you (`cat`)', [], 'cat readme', 'cat readme.txt'],
  ['Read the letter left for you (`cat`)', [], 'cat .bashrc', 'cat ~/readme.txt'],
  ['Open the manual page of a command (`man`)', [], 'man', 'man ls'],
  ['Open the manual page of a command (`man`)', [], 'man lss', 'man cat'],
  ['Ask a command for its quick help (`--help`)', [], 'ls -help', 'ls --help'],
  ['Ask a command for its quick help (`--help`)', [], 'help ls', 'cat --help'],
  ['Ask a command for its quick help (`--help`)', [], 'LS --help', 'whoami --help'],
  ['Ask a command for its quick help (`--help`)', [], 'clear --help', 'pwd --help'],
  ['Ask a command for its quick help (`--help`)', [], 'echo --help', 'ls --help'],
  ['Wipe the screen clean (`clear`)', [], 'cls', 'clear'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${miss}, but is by ${hit}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  ['Look around your home (`ls`)', [], 'ls forest', /nothing after it/],
  ['Look around your home (`ls`)', [], 'ls', null],
  ['Read the letter left for you (`cat`)', [], 'ls readme.txt', /cat/],
  ['Read the letter left for you (`cat`)', [], 'cat .bashrc', /readme\.txt/],
  ['Read the letter left for you (`cat`)', [], 'cat readme.txt', null],
  ['Ask a command for its quick help (`--help`)', [], 'ls -help', { coach: /two dashes/ }],
  ['Ask a command for its quick help (`--help`)', [], 'echo --help', /echo/],
  ['Ask a command for its quick help (`--help`)', [], 'ls --help', null],
  ['Ask a command for its quick help (`--help`)', [], 'pwd', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${line}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the clear task names the clear command, since the page handles Ctrl+L itself', () => {
  const task = chapter.tasks.at(-1);
  assert.match(task.goal, /\(`clear`\)/);
  assert.match(task.tip, /`clear`.*Ctrl\+L.*wants the command/);
});

test('every chapter 1 goal shows its command in parentheses, because chapter 1 is practice', () => {
  for (const task of chapter.tasks) assert.match(task.goal, / \(`[^`]+`\)$/, task.goal);
});

test('the boss room leaves one note named note_ and three letters in the home, and brings the player home', async () => {
  const names = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    const notes = Object.keys(nodeAt(obs.tree, obs.home).children).filter(name => name.startsWith('note_'));
    assert.deepEqual(notes.map(name => `${obs.home}/${name}`), [secret.note], `seed ${seed}`);
    assert.match(notes[0], /^note_[acdefhjkmnprtuvwxy34679]{3}$/);
    assert.equal(obs.cwd, obs.home);
    names.add(notes[0]);
  }
  assert.ok(names.size >= 3, [...names].join(', '));
});

test('the boss hides its note from the map until ls finds it', async () => {
  for (const seed of SEEDS) {
    const { secret } = await startBoss(chapter, seed);
    assert.deepEqual(chapter.boss.hidden(secret), [secret.note], `seed ${seed}`);
  }
});

test('the boss is beaten by ls, then cat on the note, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const [look, read] = chapter.boss.solve(obs);
    assert.equal(look, 'ls');
    assert.equal(chapter.boss.done((await type(backend, look)).ctx, secret), false, `seed ${seed}`);
    assert.ok(chapter.boss.done((await type(backend, read)).ctx, secret), `seed ${seed}: ${read}`);
  }
});

test('reading another file, or only listing the note, does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 3);
  const name = secret.note.slice(secret.note.lastIndexOf('/') + 1);
  for (const line of ['cat readme.txt', `ls ${name}`, 'cat note_']) {
    assert.equal(chapter.boss.done((await type(backend, line)).ctx, secret), false, line);
  }
});

for (const [line, expected] of [
  ['cat readme.txt', /another file.*note_/],
  ['cat note_zzz', /no file by that name/],
  ['ls', null],
  ['pwd', null],
]) {
  test(`in the boss room, ${line} ${nearTitle(expected)}`, async () => {
    const { backend, secret } = await startBoss(chapter, 2);
    const { ctx } = await type(backend, line);
    assertNear(chapter.boss.near(ctx, secret), ctx, expected);
  });
}

test('reading the note gives no near note', async () => {
  const { backend, secret, obs } = await startBoss(chapter, 4);
  const { ctx } = await type(backend, chapter.boss.solve(obs)[1]);
  assert.equal(chapter.boss.near(ctx, secret), null);
});

test('the exact boss hint is the line that beats the boss', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

test('every note name the boss can use avoids look-alike characters and is cleared by the setup', () => {
  for (const name of NOTES) assert.match(name, /^note_[acdefhjkmnprtuvwxy34679]{3}$/);
  const removed = chapter.setup(() => 0, PLAYER).filter(op => op.op === 'remove').map(op => op.path);
  for (const name of NOTES) assert.ok(removed.includes(`${PLAYER.home}/${name}`), name);
});

const NOT_COMMANDS = new Set(['hero@kernelia:~$', '~', '$', '#', 'LS', 'readme.txt', '--help', '/home/hero']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => snippet !== 'note_'),
    ...chapter.tasks.map(task => task.hints[2]),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});

test('the lesson points back to the intro for the prompt, and tells a player who skipped it how to replay it', () => {
  assert.match(chapter.lesson, /Replay intro/);
  assert.match(chapter.lesson, /<code>\$<\/code> means you are a normal user/);
  assert.match(chapter.lesson, /root, the administrator, gets <code>#<\/code>/);
  assert.doesNotMatch(chapter.lesson, /class="anat"/);
});

test('the lesson shows LS as a command that does not exist', async () => {
  const backend = await startChapter(chapter);
  assert.ok(notFound((await type(backend, 'LS')).result));
});
