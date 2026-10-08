import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/memory.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [HISTORY, BANG_N, BANG_BANG, ALIAS, HIDDEN, EXPORT, KEEP] = chapter.tasks.map(task => task.goal);
const SAVE_UP = "echo \"alias up='cd ..'\" >> ~/.bashrc";

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
  assert.equal(chapter.tasks.length, 7);
});

test('new commands get a clue in their first goal', () => {
  assert.match(HISTORY, /`history`/);
  assert.match(BANG_N, /`!2`/);
  assert.match(BANG_BANG, /`!!`/);
  assert.match(ALIAS, /`up`.*`cd \.\.`.*`alias up='cd \.\.'`/);
  assert.match(HIDDEN, /`realm=Kernelia`.*`bash -c 'echo \$realm'`/);
  assert.match(EXPORT, /`export realm`/);
  assert.match(KEEP, /`~\/\.bashrc`.*`source ~\/\.bashrc`/);
});

test('the lesson covers history, Ctrl+R, aliases, export and .bashrc', () => {
  assert.match(chapter.lesson, /<kbd>Ctrl<\/kbd>\+<kbd>R<\/kbd>/);
  assert.match(chapter.lesson, /<code>!!<\/code>/);
  assert.match(chapter.lesson, /<code>alias /);
  assert.match(chapter.lesson, /<code>export /);
  assert.match(chapter.lesson, /<code>~\/\.bashrc<\/code>/);
});

test('the setup puts back the starting .bashrc and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'echo junk > ~/.bashrc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.match(nodeAt(obs.tree, `${HOME}/.bashrc`).content, /export EDITOR=nano/);
});

test('the solve finishes every task, and fails only where the tasks expect it', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, ['!1: history\n', '!!: history\n'], 'bash prints an expanded line on stderr');
});

const NEAR_MISSES = [
  [HISTORY, [], 'echo history', 'history'],
  [BANG_N, ['echo one'], '!99', '!1'],
  [BANG_N, ['echo one'], 'echo !', '!1'],
  [BANG_BANG, ['echo one'], 'echo one', '!!'],
  [ALIAS, ['cd forest'], "alias up='cd ..'", null],
  [ALIAS, ["alias up='cd ..'", 'cd forest'], 'cd ..', 'up'],
  [HIDDEN, [], "echo 'echo $realm'", "bash -c 'echo $realm'"],
  [EXPORT, ['realm=Kernelia'], "bash -c 'echo $realm'", "export realm; bash -c 'echo $realm'"],
  [KEEP, [], SAVE_UP, `${SAVE_UP} && source ~/.bashrc`],
  [KEEP, [SAVE_UP, 'echo "alias home=cd ~" >> ~/.bashrc'], 'cat ~/.bashrc', 'source ~/.bashrc'],
  [KEEP, [SAVE_UP], 'cat ~/.bashrc', '. ~/.bashrc'],
  [KEEP, ["echo \"alias up='cd ..'\" > ~/.bashrc"], 'source ~/.bashrc', null],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [BANG_N, ['echo one'], '!99', /history/],
  [ALIAS, [], "alias up='cd ..'", /type up/],
  [ALIAS, [], 'alias up=cd ..', /quotes/],
  [EXPORT, ['realm=Kernelia'], "bash -c 'echo $realm'", /export realm/],
  [KEEP, [SAVE_UP], 'cat ~/.bashrc', /source/],
  [KEEP, ["echo \"alias up='cd ..'\" > ~/.bashrc"], 'source ~/.bashrc', />>/],
  [HIDDEN, ['realm=Kernelia'], 'bash -c "echo $realm"', /single quotes/],
  [HIDDEN, [], 'realm = Kernelia', /No spaces/],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss request names a random shortcut, place and keeper', async () => {
  const seen = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    const request = nodeAt(obs.tree, `${HOME}/memory/request.txt`).content;
    assert.ok(request.includes(`alias ${secret.alias}=`) || request.includes(secret.alias));
    assert.ok(request.includes(`~/${secret.place}`) && request.includes(secret.keeper));
    seen.add(`${secret.alias}-${secret.keeper}`);
  }
  assert.ok(seen.size >= 5);
});

test('the boss is beaten by writing both lines into .bashrc and loading it, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    let won = false;
    for (const line of chapter.boss.solve(obs)) won = chapter.boss.done((await type(backend, line)).ctx, secret);
    assert.equal(won, true, `seed ${seed}`);
    const { ctx } = await type(backend, secret.alias);
    assert.equal(ctx.cwd, `${HOME}/${secret.place}`, `seed ${seed}: the shortcut works`);
  }
});

const BOSS_NOTES = [
  [s => `echo "alias ${s.alias}='cd ~/${s.place}'" >> ~/.bashrc`, /KEEPER/],
  [s => `echo "export KEEPER=${s.keeper}" >> ~/.bashrc`, /alias/],
  [s => `echo "alias ${s.alias}='cd ~/${s.place}'" >> ~/.bashrc && echo "export KEEPER=${s.keeper}" >> ~/.bashrc`, /source/],
  [s => `echo "alias ${s.alias}='cd ~/${s.place}'" > ~/.bashrc && echo "export KEEPER=${s.keeper}" >> ~/.bashrc && source ~/.bashrc`, />>/],
];

for (const [line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${line({ alias: 'ALIAS', place: 'PLACE', keeper: 'KEEPER' })}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    const { ctx } = await type(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

const NOT_COMMANDS = new Set(['~/.bashrc', 'KEEPER', '~/memory/request.txt', 'realm', 'up', '!N', '!!', '!2']);

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
