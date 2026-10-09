import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/travel.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [SIZE, PACK, LIST, SQUEEZE, KIND, UNPACK, GZIP] = chapter.tasks.map(task => task.goal);
const PACKED = ['tar -cf ~/travel/library.tar ~/library'];
const SQUEEZED = ['tar -czf ~/travel/library.tar.gz ~/library'];

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

test('new commands and options get a clue in their first goal', () => {
  assert.match(SIZE, /`~\/library`.*`du -sh`/);
  assert.match(PACK, /`~\/library`.*`~\/travel\/library\.tar`.*`tar -cf`/);
  assert.match(LIST, /`tar -tf`/);
  assert.match(SQUEEZE, /`~\/travel\/library\.tar\.gz`.*`tar -czf`/);
  assert.match(KIND, /`file`/);
  assert.match(UNPACK, /`~\/travel\/unpacked`.*`tar -xzf`.*`-C`/);
  assert.match(GZIP, /`~\/travel\/notes\.txt`.*`gzip`.*`zcat`/);
});

test('the lesson explains c, x, t, f, z and -C, and gzip', () => {
  for (const word of ['tar -cf', 'tar -tf', 'tar -xf', 'tar -czf', '-C', 'gzip', 'zcat', 'du -sh', 'file']) assert.ok(chapter.lesson.includes(`<code>${word}`), word);
});

test('the setup makes ~/travel with notes.txt and brings the player home', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${HOME}/travel`).children), ['notes.txt']);
});

test('the setup can run again over a finished chapter and its boss room', async () => {
  const { backend } = await startBoss(chapter, 3);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${HOME}/travel`).children), ['notes.txt']);
});

test('the solve finishes every task without errors', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

const NEAR_MISSES = [
  [SIZE, [], 'du -sh ~/tower', 'du -sh ~/library'],
  [SIZE, [], 'ls -l ~/library', 'du -s ~/library'],
  [PACK, [], 'cp -r ~/library ~/travel/library.tar', 'tar -cf ~/travel/library.tar ~/library'],
  [PACK, [], 'tar -cf ~/travel/library.tar ~/tower', 'cd ~ && tar cf travel/library.tar library'],
  [LIST, PACKED, 'ls -l ~/travel', 'tar -tf ~/travel/library.tar'],
  [LIST, PACKED, 'cat ~/travel/library.tar', 'tar -tvf ~/travel/library.tar'],
  [SQUEEZE, [], 'tar -cf ~/travel/library.tar.gz ~/library', 'tar -czf ~/travel/library.tar.gz ~/library'],
  [KIND, SQUEEZED, 'ls -l ~/travel', 'file ~/travel/library.tar.gz'],
  [UNPACK, SQUEEZED, 'tar -xzf ~/travel/library.tar.gz', 'mkdir ~/travel/unpacked && tar -xzf ~/travel/library.tar.gz -C ~/travel/unpacked'],
  [UNPACK, [...SQUEEZED, 'mkdir ~/travel/unpacked'], 'cp -r ~/library ~/travel/unpacked', 'tar -xzf ~/travel/library.tar.gz -C ~/travel/unpacked'],
  [GZIP, [], 'gzip ~/travel/notes.txt', 'gzip ~/travel/notes.txt && zcat ~/travel/notes.txt.gz'],
  [GZIP, ['gzip ~/travel/notes.txt'], 'cat ~/travel/notes.txt.gz', 'zcat ~/travel/notes.txt.gz'],
  [GZIP, ['gzip ~/travel/notes.txt'], 'ls ~/travel', 'gunzip -c ~/travel/notes.txt.gz'],
  [GZIP, ['gzip ~/travel/notes.txt', 'cd ~/travel'], 'ls', 'zcat notes.txt'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [PACK, [], 'tar -cf ~/travel/library.tar ~/tower', /library/],
  [LIST, PACKED, 'cat ~/travel/library.tar', /tar -tf/],
  [SQUEEZE, [], 'tar -cf ~/travel/library.tar.gz ~/library', /-z/],
  [UNPACK, SQUEEZED, 'tar -xzf ~/travel/library.tar.gz', /-C/],
  [UNPACK, SQUEEZED, 'tar -xzf ~/travel/library.tar.gz -C ~/travel/unpacked', /mkdir/],
  [GZIP, ['gzip ~/travel/notes.txt'], 'cat ~/travel/notes.txt.gz', /zcat/],
  [UNPACK, SQUEEZED, 'tar -xzf ~/travel/library.tar.gz --directory=travel/unpacked', /mkdir/],
  [SQUEEZE, ['tar -cf ~/travel/library.tar ~/library'], 'gzip -k ~/travel/library.tar', /That works too/],
  [PACK, ['cd ~/library'], 'tar -cf ../travel/library.tar .', /inside library/],
  [PACK, [], 'tar -cf library.tar library', /must be/],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss packing list names a random archive and two or three things to pack', async () => {
  const seen = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    const list = nodeAt(obs.tree, `${HOME}/travel/packing_list.txt`).content;
    assert.match(secret.archive, /^\/home\/hero\/travel\/journey_[a-z3-9]{3}\.tar\.gz$/);
    assert.ok(secret.items.length >= 2 && secret.items.length <= 3);
    assert.ok(secret.items.every(item => list.includes(`~/${item}`)));
    seen.add(secret.items.join());
  }
  assert.ok(seen.size >= 5);
});

test('the boss is beaten with one tar -czf, found from the observation, from home or with full paths', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    let won = false;
    for (const line of chapter.boss.solve(obs)) won = chapter.boss.done((await type(backend, line)).ctx, secret);
    assert.equal(won, true, `seed ${seed}`);
  }
  for (const seed of SEEDS.slice(0, 3)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    assert.ok(chapter.boss.done((await type(backend, chapter.boss.hints[2](secret))).ctx, secret), `seed ${seed}`);
  }
});

const BOSS_NOTES = [
  [s => `tar -cf ${s.archive} ${s.items.map(i => `~/${i}`).join(' ')}`, /-z/],
  [s => `tar -czf ${s.archive} ${s.items.slice(1).map(i => `~/${i}`).join(' ')}`, /missing/],
  [s => `tar -czf ${s.archive} ${s.items.map(i => `~/${i}`).join(' ')} ~/junk`, /junk/],
  [s => `tar -czf ~/travel/journey.tar.gz ${s.items.map(i => `~/${i}`).join(' ')}`, /packing_list/],
];

for (const [line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${line({ archive: 'ARCHIVE', items: ['A', 'B'] })}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    const { ctx } = await type(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

const NOT_COMMANDS = new Set(['library', 'home/hero/library', '-s', '-h', '-C DIR', 'FILE.gz', 'c', 'x', 't', 'f', 'z', 'v', '-C', '.tar', '.tar.gz', '.gz', '~/travel/packing_list.txt', 'gzip', 'zcat', 'file', 'tar -cf ARCHIVE THINGS', 'tar -xf ARCHIVE', 'tar -tf ARCHIVE']);

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
