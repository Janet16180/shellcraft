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

const ORDER = ['awakening', 'forest', 'unseen', 'camp', 'junkyard', 'mirrors', 'library', 'tower', 'market', 'descent', 'gate', 'well', 'daemon', 'forge', 'guild', 'hall'];

test('the chapter list passes the shared contract check', () => {
  assertChapterList(chapters);
});

test('the chapter list has the chapters of the design, in order', () => {
  assert.deepEqual(chapters.map(chapter => chapter.id), ORDER);
});

test('act I runs to the Market of Pipes, act II starts with the Descent and act III with the Guild', () => {
  assert.deepEqual(chapters.map(chapter => chapter.act), [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3]);
});

test('every chapter is playable', () => {
  assert.deepEqual(chapters.map(chapter => Boolean(chapter.soon)), ORDER.map(() => false));
});

function proseOf(chapter) {
  const hints = [...chapter.tasks.map(task => task.hints), chapter.boss.hints].flatMap(hints => hints.slice(0, 2));
  return [
    ...chapter.tasks.map(task => task.goal),
    ...chapter.tasks.map(task => task.tip ?? ''),
    ...hints,
    ...chapter.spells.flatMap(spell => [spell.summary, ...spell.examples.map(([, note]) => note)]),
    ...[...chapter.recap, ...chapter.field].map(([, meaning]) => meaning),
  ];
}

test('every tip is one sentence (assertChapter checks that it exists and its length)', () => {
  for (const chapter of chapters.filter(c => !c.soon)) {
    for (const task of chapter.tasks) {
      assert.match(task.tip, /[.!?]$/, `${chapter.id}: a sentence ends the tip: ${task.tip}`);
      assert.doesNotMatch(task.tip, /[.!?]\s+[A-Z`]/, `${chapter.id}: one sentence only: ${task.tip}`);
    }
  }
});

test('backticks that mark typed names in goals, hints, spells and the adventure log come in pairs', () => {
  for (const chapter of chapters.filter(c => !c.soon)) {
    for (const text of proseOf(chapter)) assert.equal((text.match(/`/g) ?? []).length % 2, 0, `${chapter.id}: ${text}`);
  }
});

test('the names the player types in goals and notes are marked as code', () => {
  const marked = chapters.filter(c => !c.soon).flatMap(proseOf).join('\n');
  for (const name of ['`forest/cave/deep`', '`..`', '`cd -`', '`/home/hero`', '`~`']) assert.ok(marked.includes(name), name);
});

async function playThrough(session, chapter) {
  const turns = [];
  for (const line of chapter.solve) turns.push(await typeLine(line, session));
  const bossStart = turns.at(-1);
  for (const line of chapter.boss.solve(session.observation())) turns.push(await typeLine(line, session));
  return { bossStart, last: turns.at(-1), errors: turns.flatMap(t => t.result.output.filter(c => c.stream === 'err')) };
}

const kinds = list => list.map(x => x.kind);

const PLAYABLE = chapters.filter(c => !c.soon);
// Lines whose error is the lesson (junkyard: rmdir refuses a full directory; descent and gate: Permission denied).
const EXPECTED_ERRORS = {
  junkyard: ["rmdir: failed to remove 'junk/cobwebs': Directory not empty\n"],
  descent: ['cat: /var/log/syslog: Permission denied\n'],
  gate: ['bash: ./open_gate.sh: Permission denied\n', "ls: cannot open directory '/root': Permission denied\n"],
  well: ["ls: cannot access '/home/hero/well/bucket.txt': No such file or directory\n", 'bash: cd: /home/hero/well/dry: No such file or directory\n'],
  daemon: ['bash: kill: (1) - Operation not permitted\n'],
  guild: ['cat: /srv/guild/plans.txt: Permission denied\n', 'cat: /home/hero/guild/notice.txt: Permission denied\n'],
  hall: [
    'bash: cd: /home/hero/hall/vault: Permission denied\n',
    "ls: cannot open directory '/home/hero/hall/vault': Permission denied\n",
    "rm: cannot remove '/home/hero/hall/archive/old.txt': Permission denied\n",
  ],
};

for (const seed of [1, 2, 3]) {
  test(`a session plays every playable chapter from boot to the last boss (seed ${seed})`, async () => {
    const backend = createSimBackend({ now: () => Date.UTC(2026, 9, 6, 12), random: createRandom(seed) });
    const session = createSession({ backend, chapters, baseWorld, store: createMemoryStore(), random: createRandom(seed) });
    assert.equal((await session.boot()).chapter.id, 'awakening');

    let last = null;
    for (const [i, chapter] of PLAYABLE.entries()) {
      if (i > 0) await session.startChapter(chapter.id, { fresh: false });
      const played = await playThrough(session, chapter);
      assert.deepEqual(played.errors.map(e => e.text), EXPECTED_ERRORS[chapter.id] ?? [], chapter.id);
      assert.deepEqual(kinds(played.bossStart.events), ['task', 'boss-start'], chapter.id);
      assert.deepEqual(kinds(played.last.events), ['boss', 'chapter'], chapter.id);
      assert.equal(played.last.events[1].next, PLAYABLE[i + 1]?.id ?? null, chapter.id);
      last = played.last;
    }
    const tasks = PLAYABLE.reduce((sum, chapter) => sum + chapter.tasks.length, 0);
    assert.equal(last.view.xp, tasks * 10 + PLAYABLE.length * (30 + 20));
  });
}
