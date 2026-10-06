import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../../src/game/session.js';
import { createRandom } from '../../src/game/rng.js';
import { createSimBackend } from '../../src/shell/backend.js';
import { createMemoryStore } from '../helpers/memory-store.js';
import { fixtureChapters, fixtureWorld } from '../helpers/fixture-chapters.js';

const HOME = '/home/hero';

async function bootSim({ chapters, baseWorld, seed = 1 }) {
  const backend = createSimBackend({ now: () => Date.UTC(2026, 9, 6, 12), random: createRandom(seed) });
  const session = createSession({ backend, chapters, baseWorld, store: createMemoryStore(), random: createRandom(seed) });
  const view = await session.boot();
  return { session, view };
}

async function playChapter(session, chapter) {
  const turns = [];
  for (const line of chapter.solve) turns.push(await session.submit(line));
  const bossStart = turns.at(-1);
  for (const line of chapter.boss.solve(bossStart.obs)) turns.push(await session.submit(line));
  return { turns, bossStart, last: turns.at(-1) };
}

const kinds = list => list.map(x => x.kind);
const unexpectedErrors = turns => turns.flatMap(t => t.result.output.filter(c => c.stream === 'err').map(c => c.text));

test('the fixture chapters play through the real simulator from boot to the second chapter', async () => {
  const chapters = fixtureChapters();
  const { session, view } = await bootSim({ chapters, baseWorld: fixtureWorld });
  assert.equal(view.chapter.id, 'awakening');

  const first = await playChapter(session, chapters[0]);
  assert.deepEqual(unexpectedErrors(first.turns), []);
  assert.deepEqual(kinds(first.bossStart.events), ['task', 'boss-start']);
  assert.deepEqual(kinds(first.last.events), ['boss', 'chapter']);
  assert.equal(first.last.events[1].next, 'forest');

  await session.startChapter('forest', { fresh: false });
  const second = await playChapter(session, chapters[1]);
  assert.deepEqual(unexpectedErrors(second.turns), []);
  assert.deepEqual(kinds(second.last.events), ['boss', 'chapter']);
  assert.equal(second.last.view.xp, 2 * (2 * 10 + 30 + 20));
});

test('the simulator guard costs a heart through the session', async () => {
  const { session } = await bootSim({ chapters: fixtureChapters(), baseWorld: fixtureWorld });
  const turn = await session.submit('rm -r ~');
  assert.deepEqual(kinds(turn.events), ['heart-lost']);
  assert.ok(turn.effects.some(e => e.kind === 'guardian'));
  assert.ok(turn.obs.tree.children.home.children.hero, 'home survives');
});

test('rm -rf / costs a heart although only real rm refuses it', async () => {
  const { session } = await bootSim({ chapters: fixtureChapters(), baseWorld: fixtureWorld });
  const turn = await session.submit('rm -rf /');
  assert.deepEqual(kinds(turn.events), ['heart-lost']);
  assert.match(turn.events[0].reason, /preserve-root/);
});

test('kill -9 of the player shell costs a heart', async () => {
  const { session } = await bootSim({ chapters: fixtureChapters(), baseWorld: fixtureWorld });
  const turn = await session.submit('kill -9 $$');
  assert.deepEqual(kinds(turn.events), ['heart-lost']);
});

test('the simulator reports an unknown command and a listing of hidden files as effects', async () => {
  const { session } = await bootSim({ chapters: fixtureChapters(), baseWorld: fixtureWorld });
  const turn = await session.submit('sl; ls -a');
  assert.deepEqual(turn.effects, [{ kind: 'reveal', path: HOME }, { kind: 'unknown-command', name: 'sl' }]);
});
