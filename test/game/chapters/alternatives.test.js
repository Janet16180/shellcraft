/**
 * What playtesters typed: other valid ways to do a task, which must count,
 * wrong ways that must not, and notes that must not blame the wrong thing.
 * Every row is a line a tester reproduced.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startChapter, startBoss, type, assertNear } from './harness.js';

const load = async id => (await import(`../../../src/game/chapters/${id}.js`)).default;

// [chapter, task index, lines typed before, the line, done?, expected note (RegExp, null for none, undefined to skip)]
const TASKS = [
  ['library', 1, [], 'cat ~/library/scroll_of_ages.txt | head -n 3', true],
  ['library', 3, [], 'cat ~/library/scroll_of_ages.txt | tail -n 1', true],
  ['library', 4, [], 'cat ~/library/scroll_of_ages.txt | wc -l', true],
  ['library', 2, [], 'cat ~/library/scroll_of_ages.txt | head -n 3', false, /head prints the beginning/],
  ['descent', 3, [], 'cat /var/log/dpkg.log | tail -n 3', true],
  ['descent', 4, [], 'cat /var/log/dpkg.log | tail -n 3', false, null],
  ['tower', 0, ['cd tower/floor2'], 'cat diary.txt | grep password', true],
  ['tower', 2, [], 'grep --ignore-case dragon tower/floor1/guestbook.txt', true],
  ['tower', 3, [], 'grep --recursive gold tower', true],
  ['unseen', 3, [], 'ls -l --all ~/library', true],
  ['awakening', 3, [], 'cat readme.txt forest', true],
  ['camp', 0, [], 'mkdir -p ~/camp/tent', true],
  ['camp', 1, [], 'mkdir -p ~/camp/tent', true],
  ['camp', 0, [], 'mkdir camp tent/x', true],
  ['camp', 0, ['mkdir -p camp/tent'], 'mkdir ~/camp', true],
  ['camp', 3, ['mkdir camp', 'touch camp/supplies.txt'], 'echo wood >> camp/supplies.txt', true],
  ['camp', 4, ['mkdir camp', 'mv forest/cave/deep/ancient_key.txt camp', 'cp camp/ancient_key.txt forest/cave/deep'], 'cp readme.txt camp/zzz', false],
];

for (const [id, index, prefix, line, done, note] of TASKS) {
  test(`${id} task ${index + 1}: ${JSON.stringify(line)} ${done ? 'counts' : 'does not count'}`, async () => {
    const chapter = await load(id);
    const backend = await startChapter(chapter);
    for (const before of prefix) await type(backend, before);
    const { ctx } = await type(backend, line);
    const task = chapter.tasks[index];
    assert.equal(task.done(ctx), done);
    if (note !== undefined) assertNear(task.near?.(ctx) ?? null, ctx, note);
  });
}

// [chapter, seed, lines typed before (functions of the secret), the line, done?, expected note]
const BOSSES = [
  ['camp', 1, [() => 'mkdir camp/firepit'], ({ flint }) => `mv ${flint} camp/firepit/stone.txt`, false, /name/],
  ['camp', 1, [], ({ flint }) => `mv ${flint} camp/firepit`, false, /no firepit directory/],
];

for (const [id, seed, prefix, line, done, note] of BOSSES) {
  test(`${id} boss: ${line.toString()} ${done ? 'wins' : 'does not win'}`, async () => {
    const chapter = await load(id);
    const { backend, secret } = await startBoss(chapter, seed);
    for (const before of prefix) await type(backend, before(secret));
    const { ctx } = await type(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), done);
    if (note !== undefined) assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}
