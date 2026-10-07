import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../../src/game/session.js';
import { createRandom } from '../../src/game/rng.js';
import { SAVE_KEY, freshSave, serializeSave } from '../../src/game/save.js';
import { createSimBackend } from '../../src/shell/backend.js';
import chapters from '../../src/game/chapters/index.js';
import { baseWorld } from '../../src/game/world.js';
import { createMemoryStore } from '../helpers/memory-store.js';
import { fixtureChapters, fixtureWorld } from '../helpers/fixture-chapters.js';
import { typeLine } from '../helpers/type-line.js';

const HOME = '/home/hero';
const [AWAKENING, FOREST] = chapters;
const AWAKENING_XP = AWAKENING.tasks.length * 10 + 30 + 20;
// An angle-bracketed word is a placeholder the shell would read as a redirection.
const ANGLE_PLACEHOLDER = /<[A-Za-z][\w-]*>/;

const storeWith = fields => createMemoryStore({ [SAVE_KEY]: serializeSave({ ...freshSave(), ...fields }) });
const savedIn = store => JSON.parse(store.getItem(SAVE_KEY));
const bootReal = options => bootSim({ chapters, baseWorld, ...options });

async function bootSim({ chapters, baseWorld, seed = 1, store = createMemoryStore() }) {
  const backend = createSimBackend({ now: () => Date.UTC(2026, 9, 6, 12), random: createRandom(seed) });
  const session = createSession({ backend, chapters, baseWorld, store, random: createRandom(seed) });
  const view = await session.boot();
  return { session, view };
}

async function playChapter(session, chapter) {
  const turns = [];
  for (const line of chapter.solve) turns.push(await typeLine(line, session));
  const bossStart = turns.at(-1);
  for (const line of chapter.boss.solve(bossStart.obs)) turns.push(await typeLine(line, session));
  return { turns, bossStart, last: turns.at(-1) };
}

const kinds = list => list.map(x => x.kind);
const unexpectedErrors = turns => turns.flatMap(t => t.result.output.filter(c => c.stream === 'err').map(c => c.text));

async function playLines(session, lines) {
  const turns = [];
  for (const line of lines) turns.push(await typeLine(line, session));
  return turns;
}

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

test('a tab in a solve line completes through the simulator and the checks see it', async () => {
  const chapters = fixtureChapters();
  const [task] = chapters[0].tasks;
  chapters[0].tasks[0] = { ...task, done: ctx => ctx.completions.some(c => c.completed !== c.line) && ctx.cwd === `${HOME}/forest` };
  const { session } = await bootSim({ chapters, baseWorld: fixtureWorld });
  assert.deepEqual((await session.submit('cd forest')).events, []);
  await session.submit('cd');
  const turn = await typeLine('cd fo\t', session);
  assert.equal(turn.result.commands[0].args[0], 'forest/');
  assert.deepEqual(turn.events.map(e => [e.kind, e.index]), [['task', 0]]);
});

test('a reload after the first chapter resumes at the forest on a fresh world, and the forest plays to the end', async () => {
  const store = createMemoryStore();
  const first = await bootReal({ store });
  await playChapter(first.session, AWAKENING);

  const second = await bootReal({ store });
  assert.deepEqual([second.view.boot, second.view.chapter.id, second.view.xp], ['resumed', 'forest', AWAKENING_XP]);
  const { turns, last } = await playChapter(second.session, FOREST);
  assert.deepEqual(unexpectedErrors(turns), []);
  assert.deepEqual(kinds(last.events), ['boss', 'chapter']);
  assert.equal(last.events[1].next, null);
  assert.deepEqual(savedIn(store).cleared, ['awakening', 'forest']);
});

test('at zero hearts in the forest quest the area comes back and finished tasks stay done', async () => {
  const { session } = await bootReal({ store: storeWith({ chapter: 'forest', cleared: ['awakening'] }) });
  await playLines(session, ['cd forest', 'cd cave/deep', 'cd ~', 'rm -r forest/cave', 'rm -r ~', 'rm -r ~']);
  const turn = await session.submit('rm -r ~');
  assert.deepEqual(kinds(turn.events), ['heart-lost', 'hearts-restored']);
  assert.equal(turn.events[1].phase, 'quest');
  assert.deepEqual(turn.view.chapter.tasks.slice(0, 2).map(t => t.done), [true, true]);
  assert.equal(turn.view.hearts.left, 3);

  const rest = await playLines(session, ['cd forest/cave/deep', ...FOREST.solve.slice(2)]);
  assert.deepEqual(unexpectedErrors(rest), []);
  assert.equal(rest.at(-1).view.chapter.phase, 'boss');
});

test('at zero hearts in the forest boss room the boss is set up again and can still be solved', async () => {
  const { session } = await bootReal({ store: storeWith({ chapter: 'forest', cleared: ['awakening'] }) });
  await playLines(session, [...FOREST.solve, 'cd ~', 'rm -r ~', 'rm -r ~']);
  const turn = await session.submit('rm -r ~');
  assert.deepEqual(turn.events.map(e => e.phase ?? e.kind), ['heart-lost', 'boss']);
  assert.equal(turn.obs.cwd, HOME, 'the boss room starts at home');

  const last = (await playLines(session, FOREST.boss.solve(session.observation()))).at(-1);
  assert.deepEqual(kinds(last.events), ['boss', 'chapter']);
});

test('replaying a cleared real chapter pays nothing and leaves the cleared list alone', async () => {
  const store = storeWith({ chapter: 'awakening', cleared: ['awakening'], xp: AWAKENING_XP });
  const { session, view } = await bootReal({ store });
  assert.equal(view.chapter.replay, true);
  const { turns, last } = await playChapter(session, AWAKENING);
  assert.deepEqual([...new Set(turns.flatMap(t => t.events).filter(e => 'xp' in e).map(e => e.xp))], [0]);
  assert.equal(last.view.xp, AWAKENING_XP);
  assert.deepEqual(savedIn(store).cleared, ['awakening']);
});

async function revealEveryHint(session, chapter) {
  const shown = [];
  for (const line of chapter.solve) {
    shown.push(session.hint(), session.hint(), session.hint());
    await typeLine(line, session);
  }
  shown.push(session.hint(), session.hint(), session.hint());
  return { shown, view: session.view() };
}

for (const seed of [1, 2, 3]) {
  test(`every hint of the slice reaches the player as plain text without angle placeholders (seed ${seed})`, async () => {
    const store = createMemoryStore();
    const { session } = await bootReal({ seed, store });
    for (const chapter of [AWAKENING, FOREST]) {
      await session.startChapter(chapter.id, { fresh: false });
      const { shown, view } = await revealEveryHint(session, chapter);
      const texts = [...shown.map(h => h.text), ...[...view.chapter.tasks, view.chapter.boss].flatMap(t => t.hints.map(h => h.text))];
      for (const text of texts) {
        assert.equal(typeof text, 'string', `${chapter.id}: a hint is not text`);
        assert.ok(text.trim() !== '' && !ANGLE_PLACEHOLDER.test(text), `${chapter.id}: bad hint ${JSON.stringify(text)}`);
      }
      assert.ok(view.chapter.tasks.every(t => t.hints.length === 3), `${chapter.id}: every task showed its three hints`);
      assert.equal(view.chapter.boss.hints.length, 3);
      await playLines(session, chapter.boss.solve(session.observation()));
    }
  });
}

test('the coach explains common mistakes on the real world and simulator', async () => {
  const { session } = await bootReal();
  const notes = [];
  for (const line of ['cd Forest', 'cat readme', 'cat forest', 'cd /forest', 'ls -help']) {
    notes.push((await session.submit(line)).result.output.filter(c => c.tone === 'coach').map(c => c.text));
  }
  assert.deepEqual(notes, [
    ['Names are case-sensitive too: the door is forest.'],
    ['The file is readme.txt: .txt is part of its name.'],
    ['forest is a directory (a door). cat reads files. ls forest shows what is inside; cd forest walks in.'],
    ['A path that starts with / starts at the root, not at your home. Your forest is /home/hero/forest, or ~/forest.'],
    ['For most commands, one dash starts short options, so -help means -h -e -l -p. Long options take two dashes: --help.'],
  ]);
});

test('a reload during the forest boss gives a new room on a fresh world that can still be solved', async () => {
  const store = storeWith({ chapter: 'forest', cleared: ['awakening'] });
  const first = await bootReal({ store });
  await playLines(first.session, FOREST.solve);
  assert.equal(first.session.view().chapter.phase, 'boss');

  const second = await bootReal({ store, seed: 2 });
  assert.equal(second.view.chapter.phase, 'boss');
  assert.ok(second.view.chapter.tasks.every(t => t.done));
  const last = (await playLines(second.session, FOREST.boss.solve(second.session.observation()))).at(-1);
  assert.deepEqual(kinds(last.events), ['boss', 'chapter']);
});

test('a typing mistake on the real simulator prints exactly one note, the coach\'s', async () => {
  const { session } = await bootReal();
  for (const line of ['cls', 'cd..', 'ls-l', 'WHOAMI', 'CD forest', 'del readme.txt']) {
    const notes = (await session.submit(line)).result.output.filter(c => c.stream === 'note');
    assert.equal(notes.length, 1, `${line}: ${JSON.stringify(notes)}`);
    assert.equal(notes[0].tone, 'coach', line);
  }
});

test('every way of ending the player shell costs a heart on the real simulator, with the game\'s reason', async () => {
  for (const line of ['kill -HUP $$', 'kill -s STOP $$', 'pkill -9 bash', 'killall -s KILL bash']) {
    const { session } = await bootReal();
    const turn = await session.submit(line);
    assert.deepEqual(kinds(turn.events), ['heart-lost'], line);
    assert.match(turn.events[0].reason, /^SIG[A-Z]+ to your own shell/, line);
    assert.ok(turn.obs.procs.some(p => p.key === 'shell'), `${line}: the shell survives`);
  }
});
