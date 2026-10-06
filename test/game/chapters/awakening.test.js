import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter, { LETTERS } from '../../../src/game/chapters/awakening.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/game/checks.js';
import { createRandom } from '../../../src/game/rng.js';
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

test('the setup puts the readme back, clears old letters and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'rm readme.txt');
  await type(backend, 'touch letter2.txt');
  await type(backend, 'cd /tmp');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, PLAYER.home);
  assert.match(nodeAt(obs.tree, `${PLAYER.home}/readme.txt`).content, /The Guardian of Root/);
  assert.equal(nodeAt(obs.tree, `${PLAYER.home}/letter2.txt`), null);
});

const NEAR_MISSES = [
  ['Ask the terminal who you are', [], 'Whoami', 'whoami'],
  ['Find out where you are standing', [], 'PWD', 'pwd'],
  ['Look around your home', [], 'ls forest', 'ls'],
  ['Look around your home', ['cd /tmp'], 'ls', 'ls ~'],
  ['Read the letter left for you', [], 'ls readme.txt', 'cat readme.txt'],
  ['Read the letter left for you', [], 'cat readme', 'cat readme.txt'],
  ['Read the letter left for you', [], 'cat .bashrc', 'cat ~/readme.txt'],
  ['Open the manual page of a command', [], 'man', 'man ls'],
  ['Open the manual page of a command', [], 'man lss', 'man cat'],
  ['Ask a command for its quick help', [], 'ls -help', 'ls --help'],
  ['Ask a command for its quick help', [], 'help ls', 'cat --help'],
  ['Ask a command for its quick help', [], 'LS --help', 'whoami --help'],
  ['Ask a command for its quick help', [], 'clear --help', 'pwd --help'],
  ['Ask a command for its quick help', [], 'echo --help', 'ls --help'],
  ['Wipe the screen clean with the `clear` command', [], 'cls', 'clear'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${miss}, but is by ${hit}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  ['Look around your home', [], 'ls forest', /nothing after it/],
  ['Look around your home', [], 'ls', null],
  ['Read the letter left for you', [], 'ls readme.txt', /cat/],
  ['Read the letter left for you', [], 'cat .bashrc', /readme\.txt/],
  ['Read the letter left for you', [], 'cat readme.txt', null],
  ['Ask a command for its quick help', [], 'ls -help', { coach: /two dashes/ }],
  ['Ask a command for its quick help', [], 'echo --help', /echo/],
  ['Ask a command for its quick help', [], 'ls --help', null],
  ['Ask a command for its quick help', [], 'pwd', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${line}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the clear task asks for the clear command, since the page handles Ctrl+L itself', () => {
  assert.match(chapter.tasks.at(-1).goal, /`clear` command/);
});

test('the boss room puts four letters in the home, and exactly one is signed by the Guardian of Root', async () => {
  for (const seed of SEEDS) {
    const { obs } = await startBoss(chapter, seed);
    const signed = LETTERS.map(name => nodeAt(obs.tree, `${obs.home}/${name}`).content).filter(isGenuine);
    assert.equal(signed.length, 1, `seed ${seed}`);
  }
});

test('no letter asks pwd or clear for --help, which fail on real bash', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { patch } = chapter.boss.setup(createRandom(seed), PLAYER);
    for (const { node } of patch) {
      const text = node.content.replace(/\s+/g, ' ');
      assert.ok(!(text.includes('quick help') && /full path of the directory|wipes the screen/.test(text)), `seed ${seed}: ${text}`);
    }
  }
});

test('the boss is beaten by doing what the real letter asks, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    let done = false;
    for (const line of lines) done ||= chapter.boss.done((await type(backend, line)).ctx, secret);
    assert.ok(done, `seed ${seed}: ${lines.join('; ')}`);
  }
});

const isGenuine = text => text.trimEnd().endsWith('-- The Guardian of Root');

function asIfGenuine(obs, name) {
  const tree = structuredClone(obs.tree);
  const home = nodeAt(tree, obs.home);
  for (const letter of LETTERS) {
    home.children[letter].content = home.children[letter].content.replace(/-- .*\n$/, letter === name ? '-- The Guardian of Root\n' : '-- Nobody\n');
  }
  return { ...obs, tree };
}

const forgedLines = obs => LETTERS
  .filter(name => !isGenuine(nodeAt(obs.tree, `${obs.home}/${name}`).content))
  .map(name => chapter.boss.solve(asIfGenuine(obs, name))[0]);

test('doing what a forged letter asks does not beat the boss', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const forged = forgedLines(obs);
    assert.equal(forged.length, 3, `seed ${seed}`);
    assert.ok(!forged.includes(chapter.boss.solve(obs)[0]), `seed ${seed}`);
    for (const line of forged) assert.equal(chapter.boss.done((await type(backend, line)).ctx, secret), false, `seed ${seed}: ${line}`);
  }
});

test('doing a forged letter\'s deed earns a near note that names the forger', async () => {
  for (const seed of SEEDS.slice(0, 5)) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    for (const line of forgedLines(obs)) {
      const note = chapter.boss.near((await type(backend, line)).ctx, secret);
      assert.match(note, /The Guardian of (Boot|Loot|Soot|Rot)/, `seed ${seed}: ${line}`);
      assert.match(note, /readme\.txt/);
    }
  }
});

test('the right command asked the wrong way earns a near note, and the real deed or looking around earns none', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const wrong = secret.how === 'man' ? `${secret.command} --help` : `man ${secret.command}`;
    assert.match(chapter.boss.near((await type(backend, wrong)).ctx, secret), /letter/, `seed ${seed}: ${wrong}`);
    assert.equal(chapter.boss.near((await type(backend, 'ls')).ctx, secret), null);
    assert.equal(chapter.boss.near((await type(backend, chapter.boss.solve(obs)[0])).ctx, secret), null);
  }
});

test('the right command asked the wrong way does not beat the boss', async () => {
  for (const seed of SEEDS) {
    const { backend, secret } = await startBoss(chapter, seed);
    const wrong = secret.how === 'man' ? `${secret.command} --help` : `man ${secret.command}`;
    assert.equal(chapter.boss.done((await type(backend, wrong)).ctx, secret), false, `seed ${seed}: ${wrong}`);
  }
});

test('the exact boss hint is the line that beats the boss', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

const NOT_COMMANDS = new Set(['hero@kernelia:~$', '~', '$', '#', 'LS', 'readme.txt', '--help', '/home/hero']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !/^(letter\d|readme)/.test(snippet)),
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
