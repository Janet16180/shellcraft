/**
 * The game session: one player's run through the chapters. It sequences calls
 * into the backend and the rule modules; the rules themselves live in
 * checks.js, effects.js, progress.js and save.js.
 *
 * Callers await each call before making the next one: a call that changes
 * state while another is still running raises (view and observation may be
 * read at any time).
 *
 * @typedef {import('../backend/port.js').RunResult} RunResult
 * @typedef {import('../backend/port.js').Observation} Observation
 * @typedef {import('./effects.js').Effect} Effect
 *
 * @typedef {object} GameEvent One of: `task {index, goal, xp}`, `boss-start {title}`,
 *   `boss {xp}`, `chapter {id, recap, why, field, xp, total, next}` (total is the
 *   boss and clear XP together), `heart-lost {reason, left}`, `hearts-restored {phase}`;
 *   each has a `kind`.
 *
 * @typedef {object} Turn
 * @property {RunResult} result What the terminal shows for the line.
 * @property {Observation} obs The world after the line (and after any room the game loaded).
 * @property {Effect[]} effects What the map and the sound should play.
 * @property {GameEvent[]} events What the game awarded or took.
 * @property {object} view The View after the line.
 */
import { makeContext } from './checks.js';
import { coachNote } from './coach.js';
import { hintNote, questNote, terminalText } from './commands.js';
import { lineEffects, worldEffects } from './effects.js';
import { dangers } from './dangers.js';
import { XP, MAX_HEARTS, HINT_LEVELS, payout, nextHint, rankFor, loseHeart, chapterStatuses, canStart, resumeChapter } from './progress.js';
import { LAYOUTS, SAVE_KEY, V1_SAVE_KEY, freshSave, parseSave, serializeSave } from './save.js';

/**
 * Create a session.
 *
 * @param {object} deps What the session works with.
 * @param {import('../backend/port.js').Backend} deps.backend The shell.
 * @param {object[]} deps.chapters The ordered chapter list (modules and `soon` placeholders).
 * @param {(who: {home: string, user: string}) => object[]} deps.baseWorld The patch that rebuilds the base world.
 * @param {{getItem: (key: string) => string|null, setItem: (key: string, text: string) => void}} deps.store
 *   Where the save lives, such as window.localStorage. Errors it throws propagate.
 * @param {() => number} deps.random Random numbers in [0, 1) for chapter setups.
 * @param {boolean} [deps.dev] Dev mode: its own save, every written chapter open, and
 *   the `dev` terminal commands that skip tasks and print answers. For testing chapters.
 * @returns {object} The session API (DESIGN.md section 2.2). Its methods raise
 *   when called before boot(), or while another state-changing call is running.
 * @throws {Error} If the chapter list is empty or repeats an id.
 */
export function createSession({ backend, chapters, baseWorld, store, random, dev = false }) {
  const ids = chapters.map(c => c.id);
  if (ids.length === 0) throw new Error('the chapter list is empty');
  if (new Set(ids).size !== ids.length) throw new Error(`chapter ids must be unique: ${ids.join(', ')}`);

  const s = {
    backend, chapters, baseWorld, store, random, dev, saveKey: dev ? `${SAVE_KEY}.dev` : SAVE_KEY,
    save: null, boot: null, obs: null, index: null, completions: [], busy: false, concealed: [],
    phase: 'quest', tasksDone: [], hints: [], bossHints: 0, secret: undefined, hearts: MAX_HEARTS, replay: false,
  };
  const idle = work => (...args) => {
    requireIdle(s);
    return work(...args);
  };
  return {
    boot: () => exclusive(s, () => boot(s)),
    startChapter: (id, options) => exclusive(s, () => startChapter(s, id, options)),
    submit: line => exclusive(s, () => submit(s, line)),
    complete: line => exclusive(s, () => complete(s, line)),
    reset: () => exclusive(s, () => reset(s)),
    hint: idle(() => hint(s)),
    setSound: idle(on => setSound(s, on)),
    setLayout: idle(layout => setLayout(s, layout)),
    markIntroSeen: idle(() => updateSave(s, { introSeen: true })),
    view: () => view(s),
    observation: () => {
      requireBooted(s);
      return s.obs;
    },
  };
}

function requireBooted(s) {
  if (s.index === null) throw new Error('call boot() before using the session');
}

function requireIdle(s) {
  if (s.busy) throw new Error('another session call is running; await it before making the next one');
}

async function exclusive(s, work) {
  requireIdle(s);
  s.busy = true;
  try {
    return await work();
  } finally {
    s.busy = false;
  }
}

const current = s => s.chapters[s.index];
const who = s => ({ home: s.obs.home, user: s.obs.user, host: s.obs.host });
function statuses(s) {
  const status = chapterStatuses(s.chapters, { current: current(s)?.id ?? null, cleared: s.save.cleared });
  return s.dev ? status.map(st => (st === 'locked' ? 'open' : st)) : status;
}
const persist = s => s.store.setItem(s.saveKey, serializeSave({ ...s.save, progress: progressOf(s) }));

function progressOf(s) {
  const { phase, tasksDone, hints, bossHints } = s;
  return phase === 'done' ? null : { chapter: current(s).id, phase, tasks: [...tasksDone], hints: [...hints], bossHints };
}

async function boot(s) {
  const { save, status } = parseSave({ v2: s.store.getItem(s.saveKey), v1: s.dev ? null : s.store.getItem(V1_SAVE_KEY) });
  const { progress, ...kept } = save;
  const known = new Set(s.chapters.map(c => c.id));
  s.save = { ...kept, cleared: kept.cleared.filter(id => known.has(id)) };
  s.boot = status;
  s.obs = await s.backend.observe();
  await start(s, resumeChapter(s.chapters, { saved: save.chapter, cleared: s.save.cleared }), true);
  await restoreProgress(s, progress);
  return view(s);
}

// The world is rebuilt fresh on reload; finished tasks and shown hints carry
// over, and a boss in progress gets a new room.
async function restoreProgress(s, progress) {
  const chapter = current(s);
  const fits = progress?.chapter === chapter.id
    && progress.tasks.length === chapter.tasks.length
    && (progress.phase === 'boss') === progress.tasks.every(Boolean);
  if (fits) {
    s.tasksDone = [...progress.tasks];
    s.hints = [...progress.hints];
    s.bossHints = progress.bossHints;
    if (progress.phase === 'boss') await openBossRoom(s);
    persist(s);
  }
}

async function startChapter(s, id, { fresh = true } = {}) {
  requireBooted(s);
  const index = s.chapters.findIndex(c => c.id === id);
  if (index < 0) throw new Error(`unknown chapter: ${id}`);
  const status = statuses(s)[index];
  if (!canStart(status)) throw new Error(`chapter ${id} cannot start while it is ${status}`);

  return start(s, id, fresh);
}

async function start(s, id, fresh) {
  const index = s.chapters.findIndex(c => c.id === id);
  const chapter = s.chapters[index];
  await s.backend.load([...(fresh ? s.baseWorld(who(s)) : []), ...chapter.setup(s.random, who(s))]);
  s.obs = await s.backend.observe();
  Object.assign(s, {
    index,
    phase: 'quest',
    tasksDone: chapter.tasks.map(() => false),
    hints: chapter.tasks.map(() => 0),
    bossHints: 0,
    secret: undefined,
    concealed: [],
    hearts: MAX_HEARTS,
    replay: s.save.cleared.includes(id),
  });
  s.save.chapter = id;
  persist(s);
  return view(s);
}

async function complete(s, line) {
  requireBooted(s);
  const result = await s.backend.complete(line);
  s.completions.push({ line, completed: result.line });
  return result;
}

async function submit(s, line) {
  requireBooted(s);
  const completions = s.completions;
  s.completions = [];
  const words = line.trim().split(/\s+/);
  if (s.dev && words[0] === 'dev') return devTurn(s, words[1]);
  const answer = GAME_COMMANDS.get(line.trim());
  return answer ? gameTurn(s, answer(s)) : shellTurn(s, line, completions);
}

async function shellTurn(s, line, completions) {
  const before = s.obs;
  const result = await s.backend.run(line);
  const after = await s.backend.observe();
  s.obs = after;
  const ctx = makeContext({ commands: result.commands, before, obs: after, completions });
  const effects = [...lineEffects(ctx, result.blocked), ...(current(s).effects?.(ctx) ?? [])];
  const inBossRoom = s.phase === 'boss';
  const events = await advance(s, ctx);
  if (inBossRoom) effects.push(...uncover(s, ctx));
  const completed = events.some(e => e.kind === 'task' || e.kind === 'boss');
  const note = (completed ? null : nearNote(s, ctx)) ?? coachNote(ctx);
  const output = note === null ? result.output : [...result.output, { stream: 'note', tone: 'coach', text: terminalText(note) }];
  const [danger] = dangers(ctx);
  if (danger !== undefined) events.push(...await hurt(s, danger));
  if (s.obs !== after) effects.push(...worldEffects(after, s.obs).filter(e => !s.concealed.includes(e.path)));
  return { result: { ...result, output }, obs: s.obs, effects, events, view: view(s) };
}

const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';

// A successful ls of a hidden path's directory (or of the path) lets the map show it.
function lists(ctx, path) {
  return ctx.commands.some(r => {
    if (r.name !== 'ls' || r.status !== 0 || ctx.flag(r, 'd') || r.args.includes('--help')) return false;
    const operands = ctx.paths(r);
    return operands.length === 0 ? r.cwd === parentOf(path) : operands.includes(parentOf(path)) || operands.includes(path);
  });
}

function uncover(s, ctx) {
  const found = s.concealed.filter(path => lists(ctx, path));
  s.concealed = s.concealed.filter(path => !found.includes(path));
  return found.map(path => ({ kind: 'created', path, type: ctx.node(path)?.type ?? 'file', found: true }));
}

function nearNote(s, ctx) {
  const chapter = current(s);
  let note = null;
  if (s.phase === 'quest') {
    note = chapter.tasks[s.tasksDone.indexOf(false)].near?.(ctx) ?? null;
  } else if (s.phase === 'boss') {
    note = chapter.boss.near?.(ctx, s.secret) ?? null;
  }
  return note;
}

async function advance(s, ctx) {
  let events = [];
  if (s.phase === 'quest') events = await advanceQuest(s, ctx);
  else if (s.phase === 'boss' && current(s).boss.done(ctx, s.secret)) events = clearChapter(s);
  if (events.length > 0) persist(s);
  return events;
}

async function advanceQuest(s, ctx) {
  const { tasks, boss } = current(s);
  const newly = tasks.flatMap((task, index) => (!s.tasksDone[index] && task.done(ctx) ? [index] : []));
  const events = newly.map(index => {
    const free = taskIsFree(s, index);
    const xp = payout(XP.task, s.hints[index], free);
    s.tasksDone[index] = true;
    if (!free) markPaid(s, index);
    s.save.xp += xp;
    return { kind: 'task', index, goal: tasks[index].goal, xp };
  });
  if (s.tasksDone.every(Boolean)) {
    await openBossRoom(s);
    events.push({ kind: 'boss-start', title: boss.title });
  }
  return events;
}

// A task pays once: not on a replay of a cleared chapter, nor again after a restart.
const taskIsFree = (s, index) => s.replay || (s.save.paid[current(s).id] ?? []).includes(index);

function markPaid(s, index) {
  const id = current(s).id;
  s.save.paid[id] = [...(s.save.paid[id] ?? []), index];
}

async function openBossRoom(s) {
  const room = current(s).boss.setup(s.random, who(s));
  await s.backend.load(room.patch);
  s.obs = await s.backend.observe();
  s.secret = room.secret;
  s.concealed = current(s).boss.hidden?.(room.secret) ?? [];
  s.phase = 'boss';
}

function clearChapter(s, { free = s.replay } = {}) {
  const chapter = current(s);
  const bossXp = payout(XP.boss, s.bossHints, free);
  const clearXp = free ? 0 : XP.clear;
  s.save.xp += bossXp + clearXp;
  if (!s.save.cleared.includes(chapter.id)) s.save.cleared.push(chapter.id);
  s.phase = 'done';
  s.concealed = [];

  const following = s.chapters[s.index + 1];
  const next = following && canStart(statuses(s)[s.index + 1]) ? following.id : null;
  s.save.chapter = next ?? chapter.id;
  return [
    { kind: 'boss', xp: bossXp },
    { kind: 'chapter', id: chapter.id, recap: chapter.recap, why: chapter.why, field: chapter.field, xp: clearXp, total: bossXp + clearXp, next },
  ];
}

async function hurt(s, reason) {
  const { hearts, restored } = loseHeart(s.hearts);
  s.hearts = hearts;
  const events = [{ kind: 'heart-lost', reason, left: restored ? 0 : hearts }];
  if (restored) {
    await restorePhase(s);
    events.push({ kind: 'hearts-restored', phase: s.phase });
  }
  return events;
}

async function restorePhase(s) {
  if (s.phase === 'quest') {
    await s.backend.load(current(s).setup(s.random, who(s)));
    s.obs = await s.backend.observe();
  } else if (s.phase === 'boss') {
    await openBossRoom(s);
  }
}

function hintTarget(s) {
  const chapter = current(s);
  const index = s.tasksDone.indexOf(false);
  let target = null;
  if (s.phase === 'quest') {
    target = { base: XP.task, used: s.hints[index], free: taskIsFree(s, index), hints: chapter.tasks[index].hints, use: () => { s.hints[index] += 1; } };
  } else if (s.phase === 'boss') {
    target = { base: XP.boss, used: s.bossHints, free: s.replay, hints: chapter.boss.hints, use: () => { s.bossHints += 1; } };
  }
  return target;
}

// A boss hint may be a function of the secret, so it can name the random target.
const resolveHint = (s, hint) => (typeof hint === 'function' ? hint(s.secret) : hint);

function revealed(s, hints, used, base, free) {
  return hints.slice(0, used).map((hint, i) => ({ level: i + 1, text: resolveHint(s, hint), cost: nextHint(base, i, free).cost }));
}

function hint(s) {
  requireBooted(s);
  const target = hintTarget(s);
  let shown = null;
  if (target) {
    const next = nextHint(target.base, target.used, target.free);
    if (next) {
      target.use();
      persist(s);
    }
    const level = next?.level ?? HINT_LEVELS;
    shown = { level, text: resolveHint(s, target.hints[level - 1]), cost: next?.cost ?? 0 };
  }
  return shown;
}

function hintCommand(s) {
  const shown = hint(s);
  const target = hintTarget(s);
  return hintNote(shown, target && nextHint(target.base, target.used, target.free));
}

/** Game commands typed in the terminal; they are not Linux and never reach the backend. */
const GAME_COMMANDS = new Map([['hint', hintCommand], ['quest', s => questNote(chapterView(s))]]);

function gameTurn(s, text, { events = [], effects = [] } = {}) {
  const result = { output: [{ stream: 'note', text: terminalText(text) }], status: 0, commands: [], blocked: [] };
  return { result, obs: s.obs, effects, events, view: view(s) };
}

const DEV_HELP = `Dev commands:
  dev skip   finish the next task, or the boss, without checking it
  dev boss   finish every task and open the boss room
  dev solve  print the answer lines for the tasks, or for the boss`;

// Skipped parts pay no XP, so dev runs never look like real progress.
function devSkipTasks(s, count) {
  const { tasks } = current(s);
  return s.tasksDone.flatMap((done, index) => {
    if (done || count-- <= 0) return [];
    s.tasksDone[index] = true;
    return [{ kind: 'task', index, goal: tasks[index].goal, xp: 0 }];
  });
}

function devSolve(s) {
  const chapter = current(s);
  if (s.phase === 'done') return 'This chapter is cleared.';
  return (s.phase === 'boss' ? chapter.boss.solve(s.obs) : chapter.solve).join('\n');
}

async function devSkip(s, command) {
  if (s.phase === 'done') return { text: 'This chapter is cleared: open the next one from Chapters.', events: [] };
  if (s.phase === 'boss' && command === 'skip') {
    return { text: 'Dev: boss skipped.', events: clearChapter(s, { free: true }) };
  }
  const events = devSkipTasks(s, command === 'skip' ? 1 : Infinity);
  if (s.tasksDone.every(Boolean) && s.phase === 'quest') {
    await openBossRoom(s);
    events.push({ kind: 'boss-start', title: current(s).boss.title });
  }
  return { text: `Dev: ${command === 'skip' ? 'task' : 'tasks'} skipped.`, events };
}

async function devTurn(s, command) {
  const before = s.obs;
  let result = { text: DEV_HELP, events: [] };
  if (command === 'solve') result = { text: devSolve(s), events: [] };
  else if (command === 'skip' || command === 'boss') result = await devSkip(s, command);
  if (result.events.length > 0) persist(s);
  const effects = s.obs === before ? [] : worldEffects(before, s.obs).filter(e => !s.concealed.includes(e.path));
  return gameTurn(s, result.text, { events: result.events, effects });
}

function setSound(s, on) {
  if (typeof on !== 'boolean') throw new Error(`sound must be a boolean, got ${on}`);
  return updateSave(s, { sound: on });
}

function setLayout(s, layout) {
  if (!LAYOUTS.includes(layout)) throw new Error(`layout must be one of ${LAYOUTS.join(', ')}, got ${layout}`);
  return updateSave(s, { layout });
}

function updateSave(s, fields) {
  requireBooted(s);
  Object.assign(s.save, fields);
  persist(s);
  return view(s);
}

async function reset(s) {
  requireBooted(s);
  const { chapter, cleared, xp, paid } = freshSave();
  s.save = { ...s.save, chapter, cleared, xp, paid };
  return start(s, resumeChapter(s.chapters, { saved: null, cleared: [] }), true);
}

function chapterView(s) {
  const chapter = current(s);
  const next = s.phase === 'quest' ? s.tasksDone.indexOf(false) : -1;
  return {
    id: chapter.id,
    number: s.index + 1,
    total: s.chapters.length,
    act: chapter.act,
    title: chapter.title,
    phase: s.phase,
    lesson: chapter.lesson,
    replay: s.replay,
    tasks: chapter.tasks.map((task, i) => ({
      goal: task.goal,
      tip: task.tip,
      done: s.tasksDone[i],
      next: i === next,
      hints: revealed(s, task.hints, s.hints[i], XP.task, taskIsFree(s, i)),
    })),
    boss: { title: chapter.boss.title, briefing: chapter.boss.briefing, hints: revealed(s, chapter.boss.hints, s.bossHints, XP.boss, s.replay) },
  };
}

function view(s) {
  requireBooted(s);
  const status = statuses(s);
  const target = hintTarget(s);
  const { user, host, cwd, home } = s.obs;
  return {
    chapter: chapterView(s),
    hint: target ? nextHint(target.base, target.used, target.free) : null,
    hintLevels: HINT_LEVELS,
    xp: s.save.xp,
    started: s.save.xp > 0 || s.save.cleared.length > 0 || s.index > 0,
    rank: rankFor(s.save.xp),
    hearts: { left: s.hearts, max: MAX_HEARTS },
    sound: s.save.sound,
    introSeen: s.save.introSeen,
    layout: s.save.layout,
    chapters: s.chapters.map((c, i) => ({ id: c.id, number: i + 1, act: c.act, title: c.title, status: status[i], current: i === s.index })),
    spellbook: s.chapters.flatMap((c, i) => (c.spells ?? []).map(spell => ({ ...spell, chapter: c.id, unlocked: canStart(status[i]) }))),
    prompt: { user, host, cwd, home },
    concealed: s.concealed,
    boot: s.boot,
    dev: s.dev,
  };
}
