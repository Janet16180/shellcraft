import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../../src/game/session.js';
import { SAVE_KEY, V1_SAVE_KEY } from '../../src/game/save.js';
import { createRandom } from '../../src/game/rng.js';
import { nodeAt } from '../../src/backend/tree.js';
import { createFakeBackend } from '../helpers/fake-backend.js';
import { createSimBackend } from '../../src/shell/backend.js';
import { createMemoryStore } from '../helpers/memory-store.js';
import { fixtureChapters, fixtureWorld } from '../helpers/fixture-chapters.js';

const HOME = '/home/hero';

function makeSession({ stored = {}, chapters = fixtureChapters(), seed = 1, backend = createFakeBackend() } = {}) {
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
  const { view } = await booted({ stored: v2({ chapter: 'forest', cleared: ['awakening'], xp: 70, sound: true, introSeen: true, layout: 'side' }) });
  assert.equal(view.boot, 'resumed');
  assert.equal(view.chapter.id, 'forest');
  assert.deepEqual([view.xp, view.sound, view.introSeen, view.layout], [70, true, true, 'side']);
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

test('the base world and the setups receive the player from the observation, host included', async () => {
  const seen = [];
  const chapters = fixtureChapters();
  const { setup } = chapters[0];
  chapters[0].setup = (random, player) => { seen.push(['setup', player]); return setup(random, player); };
  const backend = createFakeBackend();
  const session = createSession({
    backend, chapters, store: createMemoryStore(), random: createRandom(1),
    baseWorld: player => { seen.push(['world', player]); return fixtureWorld(player); },
  });
  await session.boot();
  const player = { home: HOME, user: 'hero', host: 'kernelia' };
  assert.deepEqual(seen, [['world', player], ['setup', player]]);
});

test('a line runs on the backend and the turn carries its result, observation, effects and view', async () => {
  const { session } = await booted();
  const turn = await session.submit('cd forest');
  assert.equal(turn.result.commands[0].name, 'cd');
  assert.equal(turn.obs.cwd, `${HOME}/forest`);
  assert.deepEqual(turn.effects, [{ kind: 'travel', from: HOME, to: `${HOME}/forest` }]);
  assert.deepEqual(turn.view.prompt, { user: 'hero', host: 'kernelia', cwd: `${HOME}/forest`, home: HOME });
});

test('checks see the line after history expansion as ctx.line and the keys as ctx.typed', { todo: 'ctx.line becomes the expanded line once memory.js reads the keys from ctx.typed' }, async () => {
  const [awakening, ...rest] = fixtureChapters();
  const seen = [];
  const chapter = { ...awakening, tasks: [{ ...awakening.tasks[0], done: ctx => { seen.push([ctx.line, ctx.typed]); return false; } }, awakening.tasks[1]] };
  const { session } = await booted({ chapters: [chapter, ...rest], backend: createSimBackend({ now: () => 0, random: () => 0.5 }) });
  await play(session, ['echo hi', 'sudo !!']);
  assert.deepEqual(seen, [['echo hi', 'echo hi'], ['sudo echo hi', 'sudo !!']]);
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
    { kind: 'chapter', id: 'awakening', recap: chapters.recap, why: chapters.why, field: chapters.field, xp: 20, total: 50, next: 'forest' },
  ]);
  assert.equal(turn.view.chapter.phase, 'done');
  assert.equal(turn.view.xp, 70);
  assert.deepEqual(turn.view.chapters.map(c => [c.status, c.current]), [['cleared', true], ['open', false], ['soon', false]]);
  assert.deepEqual(saved(store), { version: 2, chapter: 'forest', cleared: ['awakening'], xp: 70, sound: false, introSeen: false, explainersSeen: [], layout: 'stacked', paid: { awakening: [0, 1] }, progress: null });
});

test('a cleared chapter can be started again while it is the current one', async () => {
  const { session } = await booted();
  await clearAwakening(session);
  const view = await session.startChapter('awakening');
  assert.deepEqual([view.chapter.phase, view.chapter.replay, view.chapters[0].status], ['quest', true, 'cleared']);
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
  assert.equal((await session.submit('pwd')).events[0].xp, 2);
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

test('the terminal notes drop the backticks that mark typed names, the view keeps them', async () => {
  const chapters = fixtureChapters();
  chapters[0].tasks[0] = { ...chapters[0].tasks[0], goal: 'Print where you are with `pwd`', hints: ['Try `pwd`.', 'Use `pwd`.', 'pwd'] };
  const { session } = await booted({ chapters });
  assert.equal((await session.submit('hint')).result.output[0].text, 'Hint 1 of 3: Try pwd.\nType hint again for hint 2 (costs 3 XP).');
  assert.match((await session.submit('quest')).result.output[0].text, /^\[ \] Print where you are with pwd$/m);
  const task = session.view().chapter.tasks[0];
  assert.equal(task.goal, 'Print where you are with `pwd`');
  assert.equal(task.hints[0].text, 'Try `pwd`.');
});

test('typing quest in the boss room names the boss', async () => {
  const { session } = await booted();
  await reachBoss(session);
  assert.match((await session.submit('quest')).result.output[0].text, /Boss: The Sign/);
});

const coachNotes = turn => turn.result.output.filter(c => c.tone === 'coach');

test('a near miss on the current task adds one coach note after the line output, without backticks', async () => {
  const { session } = await booted();
  await session.submit('pwd');
  const turn = await session.submit('cat letter');
  assert.deepEqual(turn.result.output.at(-1), { stream: 'note', tone: 'coach', text: 'The letter is letter.txt.' });
  assert.equal(coachNotes(turn).length, 1);
  assert.equal(turn.result.output[0].stream, 'err');
});

test('a line that completes a task gets no near note', async () => {
  const { session } = await booted();
  const turn = await session.submit('pwd; cat letter');
  assert.deepEqual(kinds(turn.events), ['task']);
  assert.ok(!coachNotes(turn).some(c => c.text === 'The letter is letter.txt.'));
});

test('only the current task is asked for a near note, never a later unfinished one', async () => {
  const chapters = fixtureChapters();
  let zero = 'zero';
  chapters[0].tasks[0].near = () => zero;
  chapters[0].tasks[1].near = () => 'one';
  const { session } = await booted({ chapters });
  assert.deepEqual(coachNotes(await session.submit('echo hi')).map(c => c.text), ['zero']);
  zero = null;
  assert.deepEqual(coachNotes(await session.submit('echo hi')), []);
  await session.submit('pwd');
  assert.deepEqual(coachNotes(await session.submit('echo hi')).map(c => c.text), ['one']);
});

test('a common mistake gets a coach note when no near note applies', async () => {
  const { session } = await booted();
  const turn = await session.submit('cdforest');
  assert.deepEqual(coachNotes(turn), [{ stream: 'note', tone: 'coach', text: 'Put a space between the command and its argument: cd forest' }]);
});

test('a near note wins over the coach note for the same line', async () => {
  const { session } = await booted();
  await session.submit('pwd');
  assert.deepEqual(coachNotes(await session.submit('cat letter')).map(c => c.text), ['The letter is letter.txt.']);
});

test('a correct line gets no coach note', async () => {
  const { session } = await booted();
  assert.deepEqual(coachNotes(await session.submit('cd forest')), []);
});

test('in the boss room the boss near note gets the secret, and it is never asked during the quest', async () => {
  const chapters = fixtureChapters();
  chapters[0].boss.near = (_ctx, secret) => `not yet: ${secret.name}`;
  chapters[0].tasks[1].near = () => null;
  const { session } = await booted({ chapters });
  assert.deepEqual(coachNotes(await session.submit('ls')), []);
  const turn = await reachBoss(session);
  assert.deepEqual(coachNotes(turn), []);
  const name = turn.obs.tree.children.home.children.hero.children['sign.txt'].content.trim().split(' ')[1];
  assert.deepEqual(coachNotes(await session.submit('ls')).map(c => c.text), [`not yet: ${name}`]);
});

test('a dangerous line costs a heart with the game\'s reason, and the guard\'s refusal shows as the guardian', async () => {
  const { session } = await booted();
  const turn = await session.submit('rm -r ~');
  assert.deepEqual(turn.effects, [{ kind: 'guardian', reason: 'The Guardian blocked rm -r on your home.' }]);
  assert.deepEqual(kinds(turn.events), ['heart-lost']);
  assert.match(turn.events[0].reason, /delete everything in your home/);
  assert.equal(turn.events[0].left, 2);
  assert.equal(turn.view.hearts.left, 2);
});

function hidingSign() {
  const chapters = fixtureChapters();
  chapters[0].boss.hidden = () => [`${HOME}/sign.txt`];
  return chapters;
}

test('a boss hides its hidden paths in the view until an ls lists their directory', async () => {
  const { session } = await booted({ chapters: hidingSign() });
  assert.deepEqual(session.view().concealed, []);
  const start = await reachBoss(session);
  assert.deepEqual(start.view.concealed, [`${HOME}/sign.txt`]);
  assert.ok(!start.effects.some(e => e.path === `${HOME}/sign.txt`), 'the boss room does not sparkle the hidden file');
  assert.deepEqual((await session.submit('ls forest')).view.concealed, [`${HOME}/sign.txt`]);
  assert.deepEqual((await session.submit('ls -d ~')).view.concealed, [`${HOME}/sign.txt`]);
  assert.deepEqual((await session.submit('ls --help')).view.concealed, [`${HOME}/sign.txt`]);
  const listed = await session.submit('ls');
  assert.deepEqual(listed.view.concealed, []);
  assert.ok(listed.effects.some(e => e.kind === 'created' && e.found && e.path === `${HOME}/sign.txt`), 'the file sparkles in when found');
});

test('an ls that opens the boss room does not reveal what the room hides', async () => {
  const chapters = hidingSign();
  chapters[0].tasks[1].done = ctx => ctx.ran('ls');
  const { session } = await booted({ chapters });
  await session.submit('pwd');
  const start = await session.submit('ls');
  assert.deepEqual(kinds(start.events).at(-1), 'boss-start');
  assert.deepEqual(start.view.concealed, [`${HOME}/sign.txt`]);
});

test('ls with the directory as an argument from elsewhere reveals too', async () => {
  const { session } = await booted({ chapters: hidingSign() });
  await reachBoss(session);
  await session.submit('cd forest');
  assert.deepEqual((await session.submit('ls ~')).view.concealed, []);
});

test('the hidden paths come back when the boss room is set up again, and are gone after a restart', async () => {
  const { session, store } = await booted({ chapters: hidingSign() });
  await reachBoss(session);
  await session.submit('ls');
  const reloaded = makeSession({ chapters: hidingSign(), stored: Object.fromEntries(store.items) }).session;
  assert.deepEqual((await reloaded.boot()).concealed, [`${HOME}/sign.txt`]);
  assert.deepEqual((await reloaded.startChapter('awakening')).concealed, []);
});

function withBlocked(backend, change) {
  return { ...backend, run: async line => {
    const result = await backend.run(line);
    return { ...result, blocked: change(result.blocked) };
  } };
}

test('a dangerous line costs a heart even when the backend refuses nothing, like a real bash', async () => {
  const { session } = await booted({ backend: withBlocked(createFakeBackend(), () => []) });
  const turn = await session.submit('rm -r ~');
  assert.deepEqual(kinds(turn.events), ['heart-lost']);
  assert.deepEqual(kinds(turn.effects).filter(k => k === 'guardian'), []);
});

test('a refusal by the guard alone shows the guardian but costs no heart', async () => {
  const { session } = await booted({ backend: withBlocked(createFakeBackend(), () => ['refused for the test']) });
  const turn = await session.submit('ls');
  assert.deepEqual(turn.effects, [{ kind: 'guardian', reason: 'refused for the test' }]);
  assert.deepEqual(turn.events, []);
  assert.equal(turn.view.hearts.left, 3);
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

async function reload(store) {
  const session = createSession({ backend: createFakeBackend(), chapters: fixtureChapters(), baseWorld: fixtureWorld, store, random: createRandom(2) });
  const view = await session.boot();
  return { session, view };
}

test('a reload keeps finished tasks done on a fresh world and never pays them twice', async () => {
  const { session, store } = await booted();
  await session.submit('pwd');
  assert.deepEqual(saved(store).progress, { chapter: 'awakening', phase: 'quest', tasks: [true, false], hints: [0, 0], bossHints: 0 });

  const again = await reload(store);
  assert.deepEqual(again.view.chapter.tasks.map(t => [t.done, t.next]), [[true, false], [false, true]]);
  assert.equal(again.view.xp, 10);
  assert.deepEqual((await again.session.submit('pwd')).events, []);
  assert.deepEqual(kinds((await again.session.submit('cat letter.txt')).events), ['task', 'boss-start']);
});

test('a reload keeps the hints already shown, and their cost', async () => {
  const { session, store } = await booted();
  session.hint();
  session.hint();
  assert.deepEqual(saved(store).progress.hints, [2, 0]);

  const again = await reload(store);
  assert.deepEqual(again.view.chapter.tasks[0].hints.map(h => h.level), [1, 2]);
  assert.deepEqual(again.view.hint, { level: 3, cost: 5 });
  assert.equal((await again.session.submit('pwd')).events[0].xp, 7);
});

test('a reload during the boss sets up a new boss room and keeps the boss hints', async () => {
  const { session, store } = await booted();
  await reachBoss(session);
  session.hint();
  session.hint();
  assert.deepEqual(saved(store).progress, { chapter: 'awakening', phase: 'boss', tasks: [true, true], hints: [0, 0], bossHints: 2 });

  const again = await reload(store);
  assert.equal(again.view.chapter.phase, 'boss');
  assert.equal(again.view.chapter.boss.hints.length, 2);
  const [last] = await play(again.session, fixtureChapters()[0].boss.solve(again.session.observation()));
  assert.deepEqual(last.events.map(e => [e.kind, e.xp]), [['boss', 27], ['chapter', 20]]);
  assert.equal(saved(store).progress, null);
});

test('saved progress that does not fit the chapter is ignored', async () => {
  const progress = fields => ({ chapter: 'awakening', phase: 'quest', tasks: [true, false], hints: [0, 0], bossHints: 0, ...fields });
  const odds = [
    progress({ chapter: 'forest' }),
    progress({ tasks: [true], hints: [0] }),
    progress({ phase: 'boss' }),
    progress({ tasks: [true, true] }),
  ];
  for (const odd of odds) {
    const { view } = await booted({ stored: v2({ chapter: 'awakening', progress: odd }) });
    assert.deepEqual(view.chapter.tasks.map(t => t.done), [false, false], JSON.stringify(odd));
  }
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

test('restarting the chapter being played clears its tasks and hearts, rebuilds the world and keeps the XP', async () => {
  const { session, backend } = await booted();
  await session.submit('pwd');
  await session.submit('touch stone');
  await session.submit('rm -r ~');
  const before = session.view();
  assert.deepEqual([before.chapter.tasks[0].done, before.hearts.left], [true, 2]);
  const view = await session.startChapter(before.chapter.id, { fresh: true });
  assert.deepEqual([view.chapter.id, view.chapter.phase, view.hearts.left, view.xp], ['awakening', 'quest', 3, before.xp]);
  assert.ok(view.chapter.tasks.every(task => !task.done));
  assert.equal(exists(await backend.observe(), `${HOME}/stone`), false);
});

test('a task pays XP once: after a restart it pays nothing and its hints are free', async () => {
  const { session, store } = await booted();
  session.hint();
  session.hint();
  const first = await session.submit('pwd');
  assert.deepEqual([first.events[0].xp, first.view.xp], [7, 7]);
  assert.deepEqual(saved(store).paid, { awakening: [0] });
  await session.startChapter('awakening', { fresh: true });
  session.hint();
  assert.equal(session.hint().cost, 0);
  assert.equal(session.view().hint.cost, 0);
  const again = await session.submit('pwd');
  assert.deepEqual([again.events[0].xp, again.view.xp], [0, 7]);
  session.hint();
  assert.equal(session.view().hint.cost, 3);
  const second = await session.submit('cat letter.txt');
  assert.deepEqual([second.events[0].xp, second.view.xp], [10, 17]);
  assert.deepEqual(saved(store).paid, { awakening: [0, 1] });
});

test('reset forgets which tasks were paid', async () => {
  const { session, store } = await booted();
  await session.submit('pwd');
  await session.reset();
  assert.deepEqual(saved(store).paid, {});
  assert.equal((await session.submit('pwd')).events[0].xp, 10);
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
    { id: 'awakening', number: 1, act: 1, title: 'The Awakening', status: 'playing', current: true },
    { id: 'forest', number: 2, act: 1, title: 'The Whispering Forest', status: 'locked', current: false },
    { id: 'unseen', number: 3, act: 1, title: 'Things Unseen', status: 'soon', current: false },
  ]);
  assert.deepEqual(view.spellbook.map(s => [s.name, s.chapter, s.unlocked]), [['pwd', 'awakening', true], ['cd', 'forest', false]]);
  assert.equal(view.spellbook[0].summary, 'Print the working directory.');
});

test('the view carries the lesson, the task tips, the boss, the rank and the number of hint levels', async () => {
  const { view } = await booted();
  assert.deepEqual(view.chapter.tasks.map(t => t.tip), ['pwd prints the directory you are in.', 'cat prints a file.']);
  assert.equal(view.chapter.lesson, '<p>Look around.</p>');
  assert.deepEqual(view.chapter.boss, { title: 'The Sign', briefing: '<p>Do what the sign says.</p>', hints: [] });
  assert.deepEqual(view.rank, { title: 'Novice', floor: 0, next: 150 });
  assert.equal(view.hintLevels, 3);
});

test('sound and the intro flag are saved', async () => {
  const { session, store } = await booted();
  assert.equal(session.setSound(true).sound, true);
  assert.equal(session.markIntroSeen().introSeen, true);
  assert.deepEqual([saved(store).sound, saved(store).introSeen], [true, true]);
});

test('the layout choice is saved and shown in the view', async () => {
  const { session, store, view } = await booted();
  assert.equal(view.layout, 'stacked');
  assert.equal(session.setLayout('side').layout, 'side');
  assert.equal(saved(store).layout, 'side');
  assert.equal(session.setLayout('stacked').layout, 'stacked');
  assert.equal(saved(store).layout, 'stacked');
});

test('setting an unknown layout raises', async () => {
  const { session } = await booted();
  for (const layout of ['wide', '', undefined, 1]) assert.throws(() => session.setLayout(layout), /layout must be one of stacked, side/);
});

test('setting sound to something other than a boolean raises', async () => {
  const { session } = await booted();
  assert.throws(() => session.setSound('on'), /boolean/);
});

test('reset erases progress but keeps sound, the intro and explainer flags and the layout', async () => {
  const { session, store, backend } = await booted();
  await clearAwakening(session);
  session.setSound(true);
  session.markIntroSeen();
  session.markExplainerSeen('signs');
  session.setLayout('side');
  const view = await session.reset();
  assert.deepEqual([view.chapter.id, view.xp, view.chapter.replay], ['awakening', 0, false]);
  assert.deepEqual(saved(store), {
    version: 2, chapter: 'awakening', cleared: [], xp: 0, sound: true, introSeen: true, explainersSeen: ['signs'], layout: 'side', paid: {},
    progress: { chapter: 'awakening', phase: 'quest', tasks: [false, false], hints: [0, 0], bossHints: 0 },
  });
  assert.equal(exists(await backend.observe(), `${HOME}/sign.txt`), false);
});

test('the view says whether the player has started: any XP, a cleared chapter or a later chapter', async () => {
  const { session, view } = await booted();
  assert.equal(view.started, false);
  assert.equal((await session.submit('pwd')).view.started, true);
  assert.equal((await booted({ stored: v2({ chapter: 'awakening', cleared: ['awakening'] }) })).view.started, true);
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

function gatedBackend() {
  const backend = createFakeBackend();
  const waiting = [];
  const gate = { open: () => waiting.splice(0).forEach(resolve => resolve()) };
  const run = async line => {
    await new Promise(resolve => waiting.push(resolve));
    return backend.run(line);
  };
  return { backend: { ...backend, run }, gate };
}

test('a call that changes state while a line is still running raises, and the line still finishes cleanly', { timeout: 5000 }, async () => {
  const { backend, gate } = gatedBackend();
  const { session } = await booted({ backend });
  const pending = session.submit('pwd');
  const overlap = /another session call is running/;
  await assert.rejects(session.submit('ls'), overlap);
  await assert.rejects(session.reset(), overlap);
  await assert.rejects(session.startChapter('awakening'), overlap);
  await assert.rejects(session.boot(), overlap);
  await assert.rejects(session.complete('pw'), overlap);
  assert.throws(() => session.hint(), overlap);
  assert.throws(() => session.setSound(true), overlap);
  assert.throws(() => session.markIntroSeen(), overlap);
  assert.equal(session.view().xp, 0);
  assert.equal(session.observation().cwd, HOME);

  gate.open();
  const turn = await pending;
  assert.deepEqual(kinds(turn.events), ['task']);
  assert.deepEqual([turn.view.xp, turn.view.chapter.phase, turn.view.sound], [10, 'quest', false]);
  assert.equal((await session.reset()).xp, 0);
});

test('a call that raised leaves the session free for the next one', async () => {
  const { session } = await booted();
  await assert.rejects(session.startChapter('nowhere'), /unknown chapter/);
  assert.deepEqual(kinds((await session.submit('pwd')).events), ['task']);
});

test('using the session before boot raises', async () => {
  const { session } = makeSession();
  await assert.rejects(session.submit('ls'), /boot/);
  await assert.rejects(session.startChapter('awakening'), /boot/);
  assert.throws(() => session.view(), /boot/);
  assert.throws(() => session.observation(), /boot/);
  assert.throws(() => session.hint(), /boot/);
});

test('an empty chapter list raises', () => {
  assert.throws(() => makeSession({ chapters: [] }), /empty/);
});

test('a chapter list with repeated ids raises', () => {
  const [a] = fixtureChapters();
  assert.throws(() => makeSession({ chapters: [a, { ...a }] }), /unique/);
});

// Dev mode (?dev): a separate save, every written chapter open, and dev commands.
async function devSession(options = {}) {
  const store = createMemoryStore(options.stored ?? {});
  const session = createSession({ backend: createFakeBackend(), chapters: options.chapters ?? fixtureChapters(), baseWorld: fixtureWorld, store, random: createRandom(1), dev: true });
  const view = await session.boot();
  return { store, session, view };
}
const noteOf = turn => turn.result.output.map(c => c.text).join('\n');

test('dev mode keeps its own save and leaves the player\'s save alone', async () => {
  const { store, session, view } = await devSession({ stored: v2({ xp: 70, cleared: ['awakening'], chapter: 'forest' }) });
  assert.equal(view.dev, true);
  assert.equal(view.xp, 0, 'the dev save starts fresh');
  await session.submit('dev skip');
  assert.equal(JSON.parse(store.items.get(SAVE_KEY)).xp, 70);
  assert.ok(store.items.has(`${SAVE_KEY}.dev`));
});

test('dev mode opens every written chapter but not the placeholders', async () => {
  const { session, view } = await devSession();
  assert.deepEqual(view.chapters.map(c => c.status), ['playing', 'open', 'soon']);
  assert.equal((await session.startChapter('forest')).chapter.id, 'forest');
});

test('dev skip finishes the next task, then opens the boss room, then clears the chapter', async () => {
  const { session } = await devSession();
  const tasks = fixtureChapters()[0].tasks.length;
  for (let i = 0; i < tasks - 1; i++) {
    const turn = await session.submit('dev skip');
    assert.deepEqual(turn.events.map(e => [e.kind, e.index, e.xp]), [['task', i, 0]]);
  }
  const last = await session.submit('dev skip');
  assert.deepEqual(kinds(last.events), ['task', 'boss-start']);
  assert.equal(last.view.chapter.phase, 'boss');
  const boss = await session.submit('dev skip');
  assert.deepEqual(kinds(boss.events), ['boss', 'chapter']);
  assert.equal(boss.events[1].next, 'forest');
  assert.equal(boss.view.xp, 0, 'skipping pays nothing');
  assert.match(noteOf(await session.submit('dev skip')), /cleared/);
});

test('dev boss skips every task and opens the boss room', async () => {
  const { session } = await devSession();
  const turn = await session.submit('dev boss');
  assert.deepEqual(kinds(turn.events), [...fixtureChapters()[0].tasks.map(() => 'task'), 'boss-start']);
  assert.equal(turn.view.chapter.phase, 'boss');
  assert.ok(turn.view.chapter.tasks.every(t => t.done));
});

test('dev solve prints the answer lines for the tasks, then for the boss', async () => {
  const { session } = await devSession();
  assert.match(noteOf(await session.submit('dev solve')), new RegExp(fixtureChapters()[0].solve.join('\n')));
  const turn = await session.submit('dev boss');
  const lines = fixtureChapters()[0].boss.solve(turn.obs);
  assert.match(noteOf(await session.submit('dev solve')), new RegExp(lines[0]));
});

test('dev solve names the Ctrl+C and Ctrl+Z a solve line presses while it runs', async () => {
  const chapters = fixtureChapters();
  chapters[0].solve = ['sleep 100\u001a', 'fg\u0003'];
  const { session } = await devSession({ chapters });
  assert.equal(noteOf(await session.submit('dev solve')), 'sleep 100   (then Ctrl+Z)\nfg   (then Ctrl+C)');
});

test('dev with no command, or an unknown one, lists the dev commands', async () => {
  const { session } = await devSession();
  for (const line of ['dev', 'dev nope']) {
    const note = noteOf(await session.submit(line));
    for (const name of ['dev skip', 'dev boss', 'dev solve']) assert.ok(note.includes(name), `${line}: ${name}`);
  }
});

test('outside dev mode, dev is not a game command and nothing is skipped', async () => {
  const { session, view } = await booted();
  assert.equal(view.dev, false);
  const turn = await session.submit('dev skip');
  assert.deepEqual(turn.events, []);
  assert.ok(turn.view.chapter.tasks.every(t => !t.done));
});

const EXPLAINER = { id: 'signs', title: 'Signs', draw: () => '', steps: [{ title: 'One', text: ['A sign.'], diagram: {} }] };

function withExplainer() {
  const chapters = fixtureChapters();
  chapters[0].explainer = EXPLAINER;
  return chapters;
}

test('a chapter without an explainer shows none in the view', async () => {
  const { view } = await booted();
  assert.equal(view.chapter.explainer, null);
});

test('a chapter\'s explainer is in the view, unseen until marked, and the mark is saved', async () => {
  const { view, session, store } = await booted({ chapters: withExplainer() });
  assert.equal(view.chapter.explainer.steps, EXPLAINER.steps);
  assert.deepEqual([view.chapter.explainer.id, view.chapter.explainer.title, view.chapter.explainer.seen], ['signs', 'Signs', false]);
  assert.equal(session.markExplainerSeen('signs').chapter.explainer.seen, true);
  session.markExplainerSeen('signs');
  assert.deepEqual(saved(store).explainersSeen, ['signs']);
});

test('a seen explainer stays seen after a reload', async () => {
  const { view } = await booted({ chapters: withExplainer(), stored: v2({ explainersSeen: ['signs'] }) });
  assert.equal(view.chapter.explainer.seen, true);
});

test('marking an explainer seen without an id raises', async () => {
  const { session } = await booted();
  for (const id of [undefined, '', 3]) assert.throws(() => session.markExplainerSeen(id), /explainer id/);
});

test('a line that asks for hidden input waits: no task is judged until the answer ends the line', async () => {
  const { session } = await booted();
  const asked = await session.submit('sudo pwd');
  assert.deepEqual(asked.result.input, { prompt: '[sudo] password for hero: ', hidden: true });
  assert.deepEqual(asked.events, []);
  assert.equal(asked.view.chapter.tasks[0].done, false);
  await assert.rejects(session.submit('pwd'), /waiting for input/);
  const done = await session.answer('dragon');
  assert.equal(done.result.input, undefined);
  assert.deepEqual(done.result.output.map(c => c.text).slice(0, 2), ['[sudo] password for hero: \n', '/home/hero\n']);
  assert.deepEqual(kinds(done.events), ['task']);
  assert.equal(done.view.chapter.tasks[0].done, true);
});

test('answer raises when no line waits, and Ctrl+C (null) ends the waiting line', async () => {
  const { session } = await booted();
  await assert.rejects(session.answer('x'), /no line is waiting/);
  await session.submit('sudo pwd');
  const cancelled = await session.answer(null);
  assert.equal(cancelled.result.status, 1);
  assert.deepEqual(cancelled.events, []);
  assert.equal((await session.submit('pwd')).events.length, 1);
});

test('restarting the chapter abandons a line waiting for input', async () => {
  const { session } = await booted();
  await session.submit('sudo pwd');
  await session.startChapter('awakening');
  await assert.rejects(session.answer('dragon'), /no line is waiting/);
  assert.equal((await session.submit('pwd')).events.length, 1);
});

test('a line whose command takes time runs: no task is judged until the line ends', async () => {
  const { session } = await booted();
  const running = await session.submit('sleep 5; pwd');
  assert.deepEqual(running.result.running, { seconds: 5 });
  assert.deepEqual(running.events, []);
  assert.equal(running.view.running, true);
  await assert.rejects(session.submit('pwd'), /still running/);
  await assert.rejects(session.answer('x'), /no line is waiting/);
  const done = await session.poll();
  assert.equal(done.result.running, undefined);
  assert.equal(done.view.running, false);
  assert.deepEqual(done.result.output.map(c => c.text), ['/home/hero\n']);
  assert.deepEqual(kinds(done.events), ['task']);
});

test('Ctrl+C reaches the running command and ends the line; Ctrl+Z stops it and the line goes on', async () => {
  const { session } = await booted();
  await session.submit('sleep 5; pwd');
  const cancelled = await session.signal('INT');
  assert.deepEqual([cancelled.result.output.map(c => c.text), cancelled.result.status, cancelled.events], [['^C\n'], 130, []]);
  await session.submit('sleep 5; pwd');
  const stopped = await session.signal('TSTP');
  assert.deepEqual(stopped.result.output.map(c => c.text), ['^Z\n', '[1]+  Stopped                 sleep 5\n', '/home/hero\n']);
  assert.deepEqual(kinds(stopped.events), ['task']);
});

test('signal and poll raise when no line runs, and while a line waits for input', async () => {
  const { session } = await booted();
  await assert.rejects(session.poll(), /no line is running/);
  await assert.rejects(session.signal('INT'), /no line is running/);
  await session.submit('sudo pwd');
  await assert.rejects(session.signal('INT'), /no line is running/);
});

test('restarting the chapter abandons a running line', async () => {
  const { session } = await booted();
  await session.submit('sleep 5');
  await session.startChapter('awakening');
  await assert.rejects(session.poll(), /no line is running/);
  assert.equal((await session.submit('pwd')).events.length, 1);
});

test('an empty line reaches the shell, which may report jobs, but gets no note about the task', async () => {
  const chapters = fixtureChapters();
  chapters[0].tasks[0].near = () => 'Look closer.';
  const { session, backend } = await booted({ chapters });
  const empty = await session.submit('');
  assert.deepEqual(backend.lines.at(-1), '');
  assert.equal(empty.result.output.some(c => c.tone === 'coach'), false);
  assert.equal((await session.submit('ls')).result.output.some(c => c.tone === 'coach'), true);
});
