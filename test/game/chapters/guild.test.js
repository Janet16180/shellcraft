import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/guild.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [HOMES, MINE, MIRA, HALL, LEDGER, PLANS, TRAP, FIX] = chapter.tasks.map(task => task.goal);

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const textOf = result => result.output.map(c => c.text).join('');

test('the chapter follows the authoring contract and shows the permissions explainer', () => {
  assertChapter(chapter);
  assert.equal(chapter.tasks.length, 8);
  assert.equal(chapter.explainer, 'perms');
});

test('new commands get a clue in their first goal, and every goal names its target', () => {
  assert.match(HOMES, /`\/home`.*`ls -l`/);
  assert.match(MINE, /`id`/);
  assert.match(MIRA, /`mira`.*`id mira`/);
  assert.match(HALL, /`\/srv\/guild`/);
  assert.match(LEDGER, /`\/srv\/guild\/ledger\.txt`/);
  assert.match(PLANS, /`\/srv\/guild\/plans\.txt`/);
  assert.match(TRAP, /`~\/guild\/notice\.txt`/);
  assert.match(FIX, /`~\/guild\/notice\.txt`.*`chmod u\+r`/);
});

test('the lesson explains users, groups, the owner and group columns, and that only one set of letters counts', () => {
  assert.match(chapter.lesson, /<b>user<\/b>/);
  assert.match(chapter.lesson, /<b>group<\/b>/);
  assert.match(chapter.lesson, /only one/i);
  assert.match(chapter.lesson, /<code>id mira<\/code>/);
});

test('the setup adds the people, their homes, the guild hall and the notice, and the player is a scribe', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  for (const name of ['mira', 'oren', 'tamsin']) {
    const home = nodeAt(obs.tree, `/home/${name}`);
    assert.equal(home.owner, name);
    assert.equal(home.mode & 0o777, 0o750);
  }
  assert.equal(textOf((await type(backend, 'id')).result), 'uid=1000(hero) gid=1000(hero) groups=1000(hero),1101(scribes)\n');
  assert.equal(textOf((await type(backend, 'id oren')).result), 'uid=1002(oren) gid=1002(oren) groups=1002(oren),1100(smiths)\n');
  assert.match(textOf((await type(backend, 'ls -l /srv/guild')).result), /^-rw-r----- 1 tamsin scribes +\d+ .* ledger\.txt$/m);
  assert.match(textOf((await type(backend, 'ls -l /srv/guild')).result), /^-rw-r----- 1 mira +smiths +\d+ .* plans\.txt$/m);
  assert.match(textOf((await type(backend, 'ls -l ~/guild')).result), /^----r--r-- 1 hero hero +\d+ .* notice\.txt$/m);
});

test('the setup can run again over a finished chapter and its boss room', async () => {
  const { backend } = await startBoss(chapter, 3);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${HOME}/guild`).children), ['notice.txt']);
  assert.equal(nodeAt(obs.tree, `${HOME}/guild/notice.txt`).mode & 0o777, 0o044);
  assert.equal(nodeAt(obs.tree, '/srv/guild/archive'), null);
});

test('the solve finishes every task, and fails only where the tasks expect it', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, [
    'cat /srv/guild/plans.txt: cat: /srv/guild/plans.txt: Permission denied\n',
    'cat ~/guild/notice.txt: cat: /home/hero/guild/notice.txt: Permission denied\n',
  ]);
});

const NEAR_MISSES = [
  [HOMES, [], 'ls /home', 'ls -l /home'],
  [HOMES, [], 'ls -l', 'cd /home && ls -l'],
  [HOMES, [], 'ls -ld /home', 'ls -la /home'],
  [MINE, [], 'whoami', 'groups'],
  [MINE, [], 'id mira', 'id'],
  [MIRA, [], 'id', 'id mira'],
  [MIRA, [], 'id oren', 'groups mira'],
  [HALL, [], 'ls /srv/guild', 'ls -l /srv/guild'],
  [HALL, [], 'ls -l /srv', 'cd /srv/guild && ls -l'],
  [LEDGER, [], 'ls -l /srv/guild/ledger.txt', 'cat /srv/guild/ledger.txt'],
  [LEDGER, [], 'cat /srv/guild/plans.txt', 'head /srv/guild/ledger.txt'],
  [PLANS, [], 'cat /srv/guild/ledger.txt', 'cat /srv/guild/plans.txt'],
  [PLANS, [], 'ls -l /srv/guild/plans.txt', 'less /srv/guild/plans.txt'],
  [TRAP, [], 'ls -l ~/guild/notice.txt', 'cat ~/guild/notice.txt'],
  [TRAP, ['chmod u+r ~/guild/notice.txt'], 'cat ~/guild/notice.txt', null],
  [FIX, [], 'cat ~/guild/notice.txt', null],
  [FIX, [], 'chmod u+r ~/guild/notice.txt', 'chmod u+r ~/guild/notice.txt && cat ~/guild/notice.txt'],
  [FIX, ['chmod u+r ~/guild/notice.txt'], 'ls -l ~/guild/notice.txt', 'cat ~/guild/notice.txt'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [HOMES, [], 'ls /home', /-l/],
  [MINE, [], 'whoami', /groups/],
  [MIRA, [], 'id', /mira/],
  [LEDGER, [], 'cat /srv/guild/plans.txt', /ledger/],
  [TRAP, [], 'cat ~/guild/notice.txt', null],
  [FIX, [], 'chmod a+r ~/guild/notice.txt', /cat/],
  [FIX, [], 'chmod o+r ~/guild/notice.txt', /owner letters/],
  [FIX, ['chmod u+r ~/guild/notice.txt'], 'ls ~/guild', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss archive has one scroll oren may read, under random names, among decoys', async () => {
  const winners = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    const names = Object.keys(nodeAt(obs.tree, '/srv/guild/archive').children);
    assert.ok(names.length >= 4 && names.length <= 5, `seed ${seed}`);
    assert.ok(names.every(name => /^scroll_[a-z3-9]{3}\.txt$/.test(name)));
    assert.ok(names.includes(secret.winner));
    winners.add(secret.kinds[secret.winner]);
  }
  assert.ok(winners.size >= 3, 'the winner is reached as owner, group or everyone else across seeds');
});

test('the boss is beaten by writing the readable scroll\'s name, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    let won = false;
    for (const line of lines) won = chapter.boss.done((await type(backend, line)).ctx, secret);
    assert.equal(won, true, `seed ${seed}`);
  }
});

test('the boss accepts the scroll\'s full path, and the exact hint beats it from anywhere', async () => {
  const one = await startBoss(chapter, 2);
  assert.ok(chapter.boss.done((await type(one.backend, `echo /srv/guild/archive/${one.secret.winner} > ~/guild/answer.txt`)).ctx, one.secret));
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    assert.ok(chapter.boss.done((await type(backend, chapter.boss.hints[2](secret))).ctx, secret), `seed ${seed}`);
  }
});

test('a wrong answer explains which letters count for oren on that scroll', async () => {
  const notes = { owner: /oren owns it/, group: /smiths/, other: /everyone else/, private: /everyone else/ };
  for (const seed of SEEDS.slice(0, 6)) {
    const { backend, secret } = await startBoss(chapter, seed);
    for (const [name, kind] of Object.entries(secret.kinds)) {
      if (name === secret.winner) continue;
      const { ctx } = await type(backend, `echo ${name} > ~/guild/answer.txt`);
      assert.equal(chapter.boss.done(ctx, secret), false);
      assert.match(chapter.boss.near(ctx, secret), notes[kind], `seed ${seed} ${kind}`);
    }
  }
});

test('the boss gives a note for an answer that names no scroll', async () => {
  const { backend, secret } = await startBoss(chapter, 4);
  const { ctx } = await type(backend, 'echo oren > ~/guild/answer.txt');
  assert.match(chapter.boss.near(ctx, secret), /name of one scroll/);
});

const NOT_COMMANDS = new Set(['/home', '/srv/guild', 'mira', 'oren', 'tamsin', 'hero', 'smiths', 'scribes', 'r', 'w', 'x',
  '---', 'r--', 'rw-', '----r--r--', '-rw-r-----', '~/guild/answer.txt', 'scroll_', '/srv/guild/archive']);

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
