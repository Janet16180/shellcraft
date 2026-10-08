import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/hall.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [NO_X, NO_R, BY_NAME, NO_W, ALLOW_W, SHARE, OPEN] = chapter.tasks.map(task => task.goal);

const NO_X_DONE = ['chmod u-x ~/hall/vault', 'cd ~/hall/vault'];
const NO_R_DONE = [...NO_X_DONE, 'chmod u+x,u-r ~/hall/vault'];
const SHARED = ['chgrp scribes ~/hall/shared'];

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const textOf = result => result.output.map(c => c.text).join('');
const modeAt = (obs, path) => nodeAt(obs.tree, path).mode & 0o777;

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
  assert.equal(chapter.tasks.length, 7);
});

test('new commands and options get a clue in their first goal', () => {
  assert.match(NO_X, /`~\/hall\/vault`.*`chmod u-x`.*`cd`/);
  assert.match(NO_R, /`~\/hall\/vault`.*`ls`/);
  assert.match(BY_NAME, /`~\/hall\/vault\/key\.txt`/);
  assert.match(NO_W, /`~\/hall\/archive\/old\.txt`/);
  assert.match(ALLOW_W, /`w`.*`~\/hall\/archive`/);
  assert.match(SHARE, /`~\/hall\/shared`.*`scribes`.*`chgrp`/);
  assert.match(OPEN, /`~\/hall\/shared`/);
});

test('the lesson says what r, w and x mean on a directory, and that removing needs w on the directory', () => {
  assert.match(chapter.lesson, /<table class="chmod-ways dir-perms">/);
  assert.match(chapter.lesson, /list the names/);
  assert.match(chapter.lesson, /go into it/);
  assert.match(chapter.lesson, /add, remove or rename/);
  assert.match(chapter.lesson, /<code>chgrp<\/code>/);
});

test('the setup makes the hall, puts the player in both factions, and brings them home', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.equal(modeAt(obs, `${HOME}/hall/vault`), 0o755);
  assert.equal(modeAt(obs, `${HOME}/hall/archive`), 0o555);
  assert.equal(nodeAt(obs.tree, `${HOME}/hall/shared`).group, 'hero');
  assert.equal(textOf((await type(backend, 'groups')).result), 'hero smiths scribes\n');
});

test('the setup can run again over a finished chapter and its boss room', async () => {
  const { backend } = await startBoss(chapter, 3);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${HOME}/hall`).children).sort(), ['archive', 'shared', 'vault']);
  assert.ok(nodeAt(obs.tree, `${HOME}/hall/archive/old.txt`));
});

test('the solve finishes every task, and fails only where the tasks expect it', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, [
    'cd ~/hall/vault: bash: cd: /home/hero/hall/vault: Permission denied\n',
    "ls ~/hall/vault: ls: cannot open directory '/home/hero/hall/vault': Permission denied\n",
    "rm ~/hall/archive/old.txt: rm: cannot remove '/home/hero/hall/archive/old.txt': Permission denied\n",
  ]);
});

const NEAR_MISSES = [
  [NO_X, [], 'cd ~/hall/vault', null],
  [NO_X, ['chmod u-x ~/hall/vault'], 'ls ~/hall/vault', 'cd ~/hall/vault'],
  [NO_X, [], 'cd ~/hall/nowhere', 'chmod u-x ~/hall/vault && cd ~/hall/vault'],
  [NO_R, NO_X_DONE, 'ls ~/hall/vault', null],
  [NO_R, [...NO_X_DONE, 'chmod u-r ~/hall/vault'], 'ls ~/hall/vault', null],
  [NO_R, [...NO_X_DONE, 'chmod 300 ~/hall/vault'], 'cd ~/hall/vault', 'ls ~/hall/vault'],
  [BY_NAME, [], 'cat ~/hall/vault/key.txt', null],
  [BY_NAME, NO_R_DONE, 'ls ~/hall/vault/key.txt', 'cat ~/hall/vault/key.txt'],
  [NO_W, [], 'ls -l ~/hall/archive', 'rm ~/hall/archive/old.txt'],
  [NO_W, ['chmod u+w ~/hall/archive'], 'rm ~/hall/archive/old.txt', null],
  [ALLOW_W, [], 'chmod u+w ~/hall/archive/old.txt', null],
  [ALLOW_W, ['chmod u+w ~/hall/archive'], 'ls ~/hall/archive', 'rm ~/hall/archive/old.txt'],
  [SHARE, [], 'chgrp smiths ~/hall/shared', 'chgrp scribes ~/hall/shared'],
  [SHARE, [], 'chgrp scribes ~/hall/vault', 'chgrp scribes hall/shared'],
  [OPEN, SHARED, 'chmod 777 ~/hall/shared', 'chmod 770 ~/hall/shared'],
  [OPEN, SHARED, 'chmod g+rwx ~/hall/shared', 'chmod g+w,o-rx ~/hall/shared'],
  [OPEN, [], 'chmod 770 ~/hall/shared', null],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [NO_X, [], 'cd ~/hall/vault', /chmod u-x/],
  [NO_X, ['chmod u-x ~/hall/vault'], 'ls ~/hall/vault', /r lets ls read the names.*cd ~\/hall\/vault/],
  [NO_R, NO_X_DONE, 'ls ~/hall/vault', /u-r/],
  [NO_R, [...NO_X_DONE, 'chmod u-r ~/hall/vault'], 'ls ~/hall/vault', /u\+x/],
  [BY_NAME, [...NO_X_DONE, 'chmod u-r ~/hall/vault'], 'cat ~/hall/vault/key.txt', /u\+x/],
  [NO_W, ['chmod u+w ~/hall/archive'], 'rm ~/hall/archive/old.txt', /w on the directory/],
  [ALLOW_W, [], 'chmod u+w ~/hall/archive/old.txt', /directory/],
  [ALLOW_W, ['chmod u+w ~/hall/archive/old.txt'], 'rm ~/hall/archive/old.txt', /directory/],
  [SHARE, [], 'chgrp smiths ~/hall/shared', /scribes/],
  [OPEN, [], 'chmod 770 ~/hall/shared', /group is still hero.*chgrp scribes/],
  [OPEN, SHARED, 'chmod 777 ~/hall/shared', /everyone else/],
  [OPEN, SHARED, 'chmod g+rwx ~/hall/shared', /o-rx|o-rwx/],
  [OPEN, SHARED, 'chmod 750 ~/hall/shared', /w/],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss room asks a random faction for a random room, in a request the player reads', async () => {
  const rooms = new Set();
  const factions = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.match(secret.room, /^\/home\/hero\/hall\/room_[a-z3-9]{3}$/);
    assert.equal(modeAt(obs, secret.room), 0o755);
    const request = nodeAt(obs.tree, `${HOME}/hall/request.txt`).content;
    assert.ok(request.includes(secret.faction) && request.includes(secret.room.replace(HOME, '~')));
    rooms.add(secret.room);
    factions.add(secret.faction);
  }
  assert.ok(rooms.size >= 10);
  assert.deepEqual([...factions].sort(), ['scribes', 'smiths']);
});

test('the boss is beaten with chgrp and chmod 770, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    let won = false;
    for (const line of chapter.boss.solve(obs)) won = chapter.boss.done((await type(backend, line)).ctx, secret);
    assert.equal(won, true, `seed ${seed}`);
  }
});

test('the boss accepts letters too, and the exact hint beats it from anywhere', async () => {
  const one = await startBoss(chapter, 2);
  await type(one.backend, `chgrp ${one.secret.faction} ${one.secret.room}`);
  assert.ok(chapter.boss.done((await type(one.backend, `chmod g+w,o-rx ${one.secret.room}`)).ctx, one.secret));
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    assert.ok(chapter.boss.done((await type(backend, chapter.boss.hints[2](secret))).ctx, secret), `seed ${seed}`);
  }
});

const BOSS_NOTES = [
  [s => `chmod 770 ${s.room}`, /group.*chgrp/],
  [s => `chgrp ${s.faction} ${s.room} && chmod 777 ${s.room}`, /everyone else/],
  [s => `chgrp ${s.faction} ${s.room}`, /chmod/],
  [s => `chgrp ${s.faction} ${s.room} && chmod 750 ${s.room}`, /w/],
  [s => `chgrp ${s.faction === 'smiths' ? 'scribes' : 'smiths'} ${s.room} && chmod 770 ${s.room}`, /request/],
];

for (const [line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${line({ room: 'ROOM', faction: 'FACTION' })}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    const { ctx } = await type(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

const NOT_COMMANDS = new Set(['r', 'w', 'x', '~/hall/request.txt', 'smiths', 'scribes', 'drwxrwx---', 'room_', 'FILE', 'DIR']);

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
