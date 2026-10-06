import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../../src/game/session.js';
import { SAVE_KEY, V1_SAVE_KEY } from '../../src/game/save.js';
import { createRandom } from '../../src/game/rng.js';
import { nodeAt } from '../../src/game/checks.js';
import { createFakeBackend } from '../helpers/fake-backend.js';
import { createMemoryStore } from '../helpers/memory-store.js';
import { fixtureChapters, fixtureWorld } from '../helpers/fixture-chapters.js';

const HOME = '/home/hero';

function makeSession({ stored = {}, chapters = fixtureChapters(), seed = 1 } = {}) {
  const backend = createFakeBackend();
  const store = createMemoryStore(stored);
  const session = createSession({ backend, chapters, baseWorld: fixtureWorld, store, random: createRandom(seed) });
  return { backend, store, session };
}

async function booted(options) {
  const parts = makeSession(options);
  const view = await parts.session.boot();
  return { ...parts, view };
}

async function play(session, lines) {
  const turns = [];
  for (const line of lines) turns.push(await session.submit(line));
  return turns;
}

async function reachBoss(session) {
  const turns = await play(session, fixtureChapters()[0].solve);
  return turns.at(-1);
}

async function clearAwakening(session) {
  const turn = await reachBoss(session);
  return (await play(session, fixtureChapters()[0].boss.solve(turn.obs))).at(-1);
}

const v2 = fields => ({ [SAVE_KEY]: JSON.stringify({ version: 2, chapter: null, cleared: [], xp: 0, sound: false, introSeen: false, ...fields }) });
const saved = store => JSON.parse(store.items.get(SAVE_KEY));
const kinds = list => list.map(x => x.kind);
const exists = (obs, path) => nodeAt(obs.tree, path) !== null;

test('booting with no save starts the first chapter on a fresh world', async () => {
  const { view, backend, store } = await booted();
  assert.equal(view.boot, 'new');
  assert.equal(view.chapter.id, 'awakening');
  assert.equal(view.chapter.phase, 'quest');
  assert.deepEqual([view.chapter.number, view.chapter.total], [1, 3]);
  assert.equal(view.xp, 0);
  assert.deepEqual(view.hearts, { left: 3, max: 3 });
  assert.deepEqual(backend.loads[0].map(op => op.op), ['put', 'stop', 'cd', 'put']);
  assert.ok(exists(await backend.observe(), `${HOME}/letter.txt`));
  assert.equal(saved(store).chapter, 'awakening');
});

test('booting resumes the saved chapter and progress', async () => {
  const { view } = await booted({ stored: v2({ chapter: 'forest', cleared: ['awakening'], xp: 70, sound: true, introSeen: true }) });
  assert.equal(view.boot, 'resumed');
  assert.equal(view.chapter.id, 'forest');
  assert.deepEqual([view.xp, view.sound, view.introSeen], [70, true, true]);
  assert.deepEqual(view.chapters.map(c => c.status), ['cleared', 'playing', 'soon']);
});

test('a damaged save starts fresh, says so and is overwritten', async () => {
  const { view, store } = await booted({ stored: { [SAVE_KEY]: '{oops' } });
  assert.equal(view.boot, 'damaged');
  assert.equal(view.chapter.id, 'awakening');
  assert.equal(saved(store).xp, 0);
});

test('a v1 save is migrated to v2 and the v1 save is left in place', async () => {
  const v1 = JSON.stringify({ chapter: 1, maxChapter: 1, xp: 50, sound: true });
  const { view, store } = await booted({ stored: { [V1_SAVE_KEY]: v1 } });
  assert.equal(view.boot, 'migrated');
  assert.equal(view.chapter.id, 'forest');
  assert.deepEqual(saved(store).cleared, ['awakening']);
  assert.equal(saved(store).xp, 50);
  assert.equal(store.items.get(V1_SAVE_KEY), v1);
});

test('cleared chapters the list does not know are dropped from the save', async () => {
  const { store } = await booted({ stored: v2({ cleared: ['awakening', 'gone'] }) });
  assert.deepEqual(saved(store).cleared, ['awakening']);
});

test('a line runs on the backend and the turn carries its result, observation, effects and view', async () => {
  const { session } = await booted();
  const turn = await session.submit('cd forest');
  assert.equal(turn.result.commands[0].name, 'cd');
  assert.equal(turn.obs.cwd, `${HOME}/forest`);
  assert.deepEqual(turn.effects, [{ kind: 'travel', from: HOME, to: `${HOME}/forest` }]);
  assert.deepEqual(turn.view.prompt, { user: 'hero', host: 'kernelia', cwd: `${HOME}/forest`, home: HOME });
});

test('a line that meets a task pays 10 XP and marks the task done', async () => {
  const { session, store } = await booted();
  const turn = await session.submit('pwd');
  assert.deepEqual(turn.events, [{ kind: 'task', index: 0, goal: 'Print where you are', xp: 10 }]);
  assert.equal(turn.view.xp, 10);
  assert.deepEqual(turn.view.chapter.tasks.map(t => [t.done, t.next]), [[true, false], [false, true]]);
  assert.equal(saved(store).xp, 10);
});

test('tasks complete in any order and the first unfinished one is next', async () => {
  const { session } = await booted();
  const turn = await session.submit('cat letter.txt');
  assert.deepEqual(kinds(turn.events), ['task']);
  assert.equal(turn.events[0].index, 1);
  assert.deepEqual(turn.view.chapter.tasks.map(t => t.next), [true, false]);
});

test('a task pays only once', async () => {
  const { session } = await booted();
  const [, again] = await play(session, ['pwd', 'pwd']);
  assert.deepEqual(again.events, []);
  assert.equal(again.view.xp, 10);
});

test('finishing the last task opens the boss room', async () => {
  const { session } = await booted();
  const turn = await reachBoss(session);
  assert.deepEqual(kinds(turn.events), ['task', 'boss-start']);
  assert.equal(turn.events[1].title, 'The Sign');
  assert.equal(turn.view.chapter.phase, 'boss');
  assert.ok(exists(turn.obs, `${HOME}/sign.txt`));
  assert.deepEqual(turn.effects.at(-1), { kind: 'created', path: `${HOME}/sign.txt`, type: 'file' });
});

test('a near miss in the boss room does not clear the chapter', async () => {
  const { session } = await booted();
  await reachBoss(session);
  const turn = await session.submit('touch wrong');
  assert.deepEqual(turn.events, []);
  assert.equal(turn.view.chapter.phase, 'boss');
});

test('solving the boss clears the chapter, pays the boss and the bonus, and opens the next chapter', async () => {
  const { session, store } = await booted();
  const turn = await clearAwakening(session);
  const [chapters] = fixtureChapters();
  assert.deepEqual(turn.events, [
    { kind: 'boss', xp: 30 },
    { kind: 'chapter', id: 'awakening', recap: chapters.recap, why: chapters.why, field: chapters.field, xp: 20, next: 'forest' },
  ]);
  assert.equal(turn.view.chapter.phase, 'done');
  assert.equal(turn.view.xp, 70);
  assert.deepEqual(turn.view.chapters.map(c => c.status), ['playing', 'open', 'soon']);
  assert.deepEqual(saved(store), { version: 2, chapter: 'forest', cleared: ['awakening'], xp: 70, sound: false, introSeen: false });
});

test('replaying a cleared chapter pays nothing', async () => {
  const { session } = await booted({ stored: v2({ chapter: 'awakening', cleared: ['awakening'], xp: 70 }) });
  assert.equal(session.view().chapter.replay, true);
  const turn = await clearAwakening(session);
  assert.deepEqual(turn.events.map(e => e.xp), [0, 0]);
  assert.equal(turn.view.xp, 70);
});

test('hints come in three levels: a free nudge, the technique for 3 XP and the command for 5', async () => {
  const { session } = await booted();
  assert.deepEqual([session.hint(), session.hint(), session.hint()], [
    { level: 1, text: 'Where are you?', cost: 0 },
    { level: 2, text: 'Use pwd.', cost: 3 },
    { level: 3, text: 'pwd', cost: 5 },
  ]);
  assert.deepEqual(session.view().chapter.tasks[0].hints, [
    { level: 1, text: 'Where are you?', cost: 0 },
    { level: 2, text: 'Use pwd.', cost: 3 },
    { level: 3, text: 'pwd', cost: 5 },
  ]);
});

test('the view says what the next hint costs, and nothing once all three are shown', async () => {
  const { session, view } = await booted();
  assert.deepEqual(view.hint, { level: 1, cost: 0 });
  session.hint();
  assert.deepEqual(session.view().hint, { level: 2, cost: 3 });
  session.hint();
  session.hint();
  assert.equal(session.view().hint, null);
});

test('hint costs come off that task payout only', async () => {
  const { session } = await booted();
  session.hint();
  session.hint();
  const [first, second] = await play(session, ['pwd', 'cat letter.txt']);
  assert.equal(first.events[0].xp, 7);
  assert.equal(second.events[0].xp, 10);
});

test('asking after the third hint repeats it at no cost', async () => {
  const { session } = await booted();
  session.hint();
  session.hint();
  session.hint();
  assert.deepEqual(session.hint(), { level: 3, text: 'pwd', cost: 0 });
});

test('the hint is about the first unfinished task', async () => {
  const { session } = await booted();
  await session.submit('pwd');
  assert.equal(session.hint().text, 'A letter waits.');
});

test('in the boss room the hint is about the boss and its cost comes off the boss payout', async () => {
  const { session } = await booted();
  const turn = await reachBoss(session);
  assert.equal(session.hint().text, 'Read the sign.');
  session.hint();
  assert.deepEqual(session.view().chapter.boss.hints.map(h => h.text), ['Read the sign.', 'It names a file to create.']);
  const [last] = await play(session, fixtureChapters()[0].boss.solve(turn.obs));
  assert.equal(last.events[0].xp, 27);
});

test('a boss hint written as a function receives the boss secret', async () => {
  const { session } = await booted({ stored: v2({ chapter: 'forest', cleared: ['awakening'] }) });
  const turn = (await play(session, fixtureChapters()[1].solve)).at(-1);
  const grove = turn.obs.tree.children.home.children.hero.children.forest.children['sign.txt'].content.trim();
  session.hint();
  session.hint();
  assert.equal(session.hint().text, `cd ~/forest/${grove}`);
  assert.equal(session.view().chapter.boss.hints[2].text, `cd ~/forest/${grove}`);
});

test('there is no hint once the chapter is cleared', async () => {
  const { session } = await booted();
  await clearAwakening(session);
  assert.equal(session.hint(), null);
  assert.equal(session.view().hint, null);
});

test('typing hint answers as a note and never reaches the backend', async () => {
  const { session, backend } = await booted();
  const turn = await session.submit('  hint ');
  const note = 'Hint 1 of 3: Where are you?\nType hint again for hint 2 (costs 3 XP).';
  assert.deepEqual(turn.result, { output: [{ stream: 'note', text: note }], status: 0, commands: [], blocked: [] });
  assert.deepEqual([turn.effects, turn.events], [[], []]);
  assert.deepEqual(backend.lines, []);
  assert.equal((await session.submit('hint')).result.output[0].text, 'Hint 2 of 3 (cost 3 XP): Use pwd.\nType hint again for hint 3 (costs 5 XP).');
  assert.equal((await session.submit('hint')).result.output[0].text, 'Hint 3 of 3 (cost 5 XP): pwd');
});

test('typing hint in a replayed chapter says the next hint is free', async () => {
  const { session } = await booted({ stored: v2({ chapter: 'awakening', cleared: ['awakening'] }) });
  assert.equal((await session.submit('hint')).result.output[0].text, 'Hint 1 of 3: Where are you?\nType hint again for hint 2 (free).');
});

test('typing quest lists the tasks with their state', async () => {
  const { session } = await booted();
  await session.submit('pwd');
  const turn = await session.submit('quest');
  assert.equal(turn.result.output[0].stream, 'note');
  assert.equal(turn.result.output[0].text, 'The Awakening (chapter 1 of 3)\n[x] Print where you are\n[ ] Read the letter');
});

test('typing quest in the boss room names the boss', async () => {
  const { session } = await booted();
  await reachBoss(session);
  assert.match((await session.submit('quest')).result.output[0].text, /Boss: The Sign/);
});

test('a refusal by the guard costs a heart', async () => {
  const { session } = await booted();
  const turn = await session.submit('rm -r ~');
  assert.deepEqual(turn.effects, [{ kind: 'guardian', reason: 'The Guardian blocked rm -r on your home.' }]);
  assert.deepEqual(turn.events, [{ kind: 'heart-lost', reason: 'The Guardian blocked rm -r on your home.', left: 2 }]);
  assert.equal(turn.view.hearts.left, 2);
});

test('a dangerous attempt that real Linux refuses also costs a heart', async () => {
  const { session } = await booted();
  const turn = await session.submit('rm -rf /');
  assert.deepEqual(kinds(turn.events), ['heart-lost']);
  assert.match(turn.events[0].reason, /preserve-root/);
});

test('a line costs at most one heart', async () => {
  const { session } = await booted();
  const turn = await session.submit('rm -r ~; kill -9 733; rm -rf /');
  assert.deepEqual(kinds(turn.events), ['heart-lost']);
  assert.equal(turn.view.hearts.left, 2);
});

test('at zero hearts in the quest the chapter setup runs again and finished tasks stay done', async () => {
  const { session } = await booted();
  await play(session, ['pwd', 'rm letter.txt', 'rm -rf /', 'rm -rf /']);
  const turn = await session.submit('rm -rf /');
  assert.deepEqual(turn.events.slice(-2), [
    { kind: 'heart-lost', reason: turn.events[0].reason, left: 0 },
    { kind: 'hearts-restored', phase: 'quest' },
  ]);
  assert.equal(turn.view.hearts.left, 3);
  assert.equal(turn.view.chapter.tasks[0].done, true);
  assert.ok(exists(turn.obs, `${HOME}/letter.txt`));
  assert.deepEqual(turn.effects.at(-1), { kind: 'created', path: `${HOME}/letter.txt`, type: 'file' });
  assert.equal(turn.view.xp, 10);
});

test('at zero hearts in the boss room the boss restarts and can still be solved', async () => {
  const { session } = await booted();
  await reachBoss(session);
  await play(session, ['rm sign.txt', 'rm -rf /', 'rm -rf /']);
  const turn = await session.submit('rm -rf /');
  assert.deepEqual(kinds(turn.events), ['heart-lost', 'hearts-restored']);
  assert.equal(turn.events[1].phase, 'boss');
  assert.equal(turn.view.chapter.phase, 'boss');
  assert.ok(exists(turn.obs, `${HOME}/sign.txt`));
  const [last] = await play(session, fixtureChapters()[0].boss.solve(turn.obs));
  assert.deepEqual(kinds(last.events), ['boss', 'chapter']);
});

test('continuing to the next chapter applies only its setup to the current world', async () => {
  const { session, backend } = await booted();
  await clearAwakening(session);
  await session.submit('touch stone');
  const view = await session.startChapter('forest', { fresh: false });
  assert.deepEqual(backend.loads.at(-1).map(op => op.path), [`${HOME}/forest/river`]);
  assert.ok(exists(await backend.observe(), `${HOME}/stone`));
  assert.deepEqual([view.chapter.id, view.chapter.phase, view.hearts.left, view.xp], ['forest', 'quest', 3, 70]);
});

test('starting a chapter fresh rebuilds the base world', async () => {
  const { session, backend } = await booted();
  await session.submit('touch stone');
  await session.startChapter('awakening', { fresh: true });
  assert.equal(exists(await backend.observe(), `${HOME}/stone`), false);
});

test('an unknown, soon or locked chapter cannot start', async () => {
  const { session } = await booted();
  await assert.rejects(session.startChapter('nowhere'), /unknown chapter/);
  await assert.rejects(session.startChapter('unseen'), /soon/);
  await assert.rejects(session.startChapter('forest'), /locked/);
});

test('chapter-defined effects are added to the line effects', async () => {
  const { session } = await booted({ stored: v2({ chapter: 'forest', cleared: ['awakening'] }) });
  const turn = await session.submit('cd forest');
  assert.deepEqual(kinds(turn.effects), ['travel', 'forest-entered']);
});

test('the view lists every chapter with its status and the spellbook with what is unlocked', async () => {
  const { view } = await booted();
  assert.deepEqual(view.chapters, [
    { id: 'awakening', number: 1, act: 1, title: 'The Awakening', status: 'playing' },
    { id: 'forest', number: 2, act: 1, title: 'The Whispering Forest', status: 'locked' },
    { id: 'unseen', number: 3, act: 1, title: 'Things Unseen', status: 'soon' },
  ]);
  assert.deepEqual(view.spellbook.map(s => [s.name, s.chapter, s.unlocked]), [['pwd', 'awakening', true], ['cd', 'forest', false]]);
  assert.equal(view.spellbook[0].summary, 'Print the working directory.');
});

test('the view carries the lesson, the boss and the rank', async () => {
  const { view } = await booted();
  assert.equal(view.chapter.lesson, '<p>Look around.</p>');
  assert.deepEqual(view.chapter.boss, { title: 'The Sign', briefing: '<p>Do what the sign says.</p>', hints: [] });
  assert.deepEqual(view.rank, { title: 'Novice', floor: 0, next: 150 });
});

test('sound and the intro flag are saved', async () => {
  const { session, store } = await booted();
  assert.equal(session.setSound(true).sound, true);
  assert.equal(session.markIntroSeen().introSeen, true);
  assert.deepEqual([saved(store).sound, saved(store).introSeen], [true, true]);
});

test('setting sound to something other than a boolean raises', async () => {
  const { session } = await booted();
  assert.throws(() => session.setSound('on'), /boolean/);
});

test('reset erases progress but keeps sound and the intro flag', async () => {
  const { session, store, backend } = await booted();
  await clearAwakening(session);
  session.setSound(true);
  session.markIntroSeen();
  const view = await session.reset();
  assert.deepEqual([view.chapter.id, view.xp, view.chapter.replay], ['awakening', 0, false]);
  assert.deepEqual(saved(store), { version: 2, chapter: 'awakening', cleared: [], xp: 0, sound: true, introSeen: true });
  assert.equal(exists(await backend.observe(), `${HOME}/sign.txt`), false);
});

test('the session hands out the latest observation it holds', async () => {
  const { session } = await booted();
  assert.equal(session.observation().cwd, HOME);
  await session.submit('cd forest');
  assert.equal(session.observation().cwd, `${HOME}/forest`);
});

test('checks see the Tab completions made since the previous line', async () => {
  const chapters = fixtureChapters();
  const seen = [];
  chapters[0].tasks[0].done = ctx => { seen.push(ctx.completions); return false; };
  const { session } = await booted({ chapters });
  await session.complete('pw');
  await session.complete('pwd');
  await play(session, ['pwd', 'hint', 'ls']);
  assert.deepEqual(seen, [[{ line: 'pw', completed: 'pw' }, { line: 'pwd', completed: 'pwd' }], []]);
});

test('tab completion is answered by the backend', async () => {
  const { session } = await booted();
  assert.deepEqual(await session.complete('cd fo'), { line: 'cd fo', candidates: [] });
});

test('using the session before boot raises', async () => {
  const { session } = makeSession();
  await assert.rejects(session.submit('ls'), /boot/);
  await assert.rejects(session.startChapter('awakening'), /boot/);
  assert.throws(() => session.view(), /boot/);
  assert.throws(() => session.observation(), /boot/);
  assert.throws(() => session.hint(), /boot/);
});

test('a chapter list with repeated ids raises', () => {
  const [a] = fixtureChapters();
  assert.throws(() => makeSession({ chapters: [a, { ...a }] }), /unique/);
});
