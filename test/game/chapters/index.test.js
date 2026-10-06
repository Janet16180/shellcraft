import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapters from '../../../src/game/chapters/index.js';
import { baseWorld } from '../../../src/game/world.js';
import { createSession } from '../../../src/game/session.js';
import { createRandom } from '../../../src/game/rng.js';
import { createSimBackend } from '../../../src/shell/backend.js';
import { assertChapterList } from '../../helpers/chapter.js';
import { createMemoryStore } from '../../helpers/memory-store.js';
import { typeLine } from '../../helpers/type-line.js';

const ORDER = ['awakening', 'forest', 'unseen', 'camp', 'junkyard', 'mirrors', 'library', 'tower', 'market', 'descent', 'gate', 'well', 'daemon', 'forge'];

test('the chapter list passes the shared contract check', () => {
  assertChapterList(chapters);
});

test('the chapter list has the fourteen chapters of the design, in order', () => {
  assert.deepEqual(chapters.map(chapter => chapter.id), ORDER);
});

test('act I runs to the Market of Pipes and act II starts with the Descent', () => {
  assert.deepEqual(chapters.map(chapter => chapter.act), [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
});

test('the slice plays the first two chapters and marks the rest as coming soon', () => {
  assert.deepEqual(chapters.map(chapter => Boolean(chapter.soon)), ORDER.map((_, i) => i >= 2));
});

async function playThrough(session, chapter) {
  const turns = [];
  for (const line of chapter.solve) turns.push(await typeLine(line, session));
  const bossStart = turns.at(-1);
  for (const line of chapter.boss.solve(session.observation())) turns.push(await typeLine(line, session));
  return { bossStart, last: turns.at(-1), errors: turns.flatMap(t => t.result.output.filter(c => c.stream === 'err')) };
}

const kinds = list => list.map(x => x.kind);

for (const seed of [1, 2, 3]) {
  test(`a session plays both chapters from boot to the end of the slice (seed ${seed})`, async () => {
    const backend = createSimBackend({ now: () => Date.UTC(2026, 9, 6, 12), random: createRandom(seed) });
    const session = createSession({ backend, chapters, baseWorld, store: createMemoryStore(), random: createRandom(seed) });
    assert.equal((await session.boot()).chapter.id, 'awakening');

    const first = await playThrough(session, chapters[0]);
    assert.deepEqual(first.errors, []);
    assert.deepEqual(kinds(first.bossStart.events), ['task', 'boss-start']);
    assert.deepEqual(kinds(first.last.events), ['boss', 'chapter']);
    assert.equal(first.last.events[1].next, 'forest');

    await session.startChapter('forest', { fresh: false });
    const second = await playThrough(session, chapters[1]);
    assert.deepEqual(second.errors, []);
    assert.deepEqual(kinds(second.bossStart.events), ['task', 'boss-start']);
    assert.deepEqual(kinds(second.last.events), ['boss', 'chapter']);
    assert.equal(second.last.view.xp, (7 + 8) * 10 + 2 * (30 + 20));
  });
}
