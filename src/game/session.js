/**
 * The game session: one player's run through the chapters. It sequences calls
 * into the backend and the rule modules; the rules themselves live in
 * checks.js, effects.js, progress.js and save.js.
 *
 * Callers await each call before making the next one.
 *
 * @typedef {import('../backend/port.js').RunResult} RunResult
 * @typedef {import('../backend/port.js').Observation} Observation
 * @typedef {import('./effects.js').Effect} Effect
 *
 * @typedef {object} GameEvent One of: `task {index, goal, xp}`, `boss-start {title}`,
 *   `boss {xp}`, `chapter {id, recap, field, xp, next}`, `heart-lost {reason, left}`,
 *   `hearts-restored {phase}`; each has a `kind`.
 *
 * @typedef {object} Turn
 * @property {RunResult} result What the terminal shows for the line.
 * @property {Observation} obs The world after the line (and after any room the game loaded).
 * @property {Effect[]} effects What the map and the sound should play.
 * @property {GameEvent[]} events What the game awarded or took.
 * @property {object} view The View after the line.
 */
import { makeContext } from './checks.js';
import { lineEffects, worldEffects, dangers } from './effects.js';
import { XP, MAX_HEARTS, payout, nextHint, rankFor, loseHeart, chapterStatuses, canStart, resumeChapter } from './progress.js';
import { SAVE_KEY, V1_SAVE_KEY, freshSave, parseSave, serializeSave } from './save.js';

const HINT_LEVELS = 3;

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
 * @returns {object} The session API (DESIGN.md section 2.2).
 * @throws {Error} If the chapter list is empty or repeats an id.
 */
export function createSession({ backend, chapters, baseWorld, store, random }) {
  const ids = chapters.map(c => c.id);
  if (ids.length === 0) throw new Error('the chapter list is empty');
  if (new Set(ids).size !== ids.length) throw new Error(`chapter ids must be unique: ${ids.join(', ')}`);

  const s = {
    backend, chapters, baseWorld, store, random,
    save: null, boot: null, obs: null, index: null,
    phase: 'quest', tasksDone: [], hints: [], bossHints: 0, secret: undefined, hearts: MAX_HEARTS, replay: false,
  };
  return {
    boot: () => boot(s),
    startChapter: (id, options) => startChapter(s, id, options),
    submit: line => submit(s, line),
    hint: () => hint(s),
    view: () => view(s),
    complete: async line => {
      requireBooted(s);
      return s.backend.complete(line);
    },
    setSound: on => setSound(s, on),
    markIntroSeen: () => updateSave(s, { introSeen: true }),
    reset: () => reset(s),
  };
}

function requireBooted(s) {
  if (s.index === null) throw new Error('call boot() before using the session');
}

const current = s => s.chapters[s.index];
const who = s => ({ home: s.obs.home, user: s.obs.user });
const statuses = s => chapterStatuses(s.chapters, { current: current(s)?.id ?? null, cleared: s.save.cleared });
const persist = s => s.store.setItem(SAVE_KEY, serializeSave(s.save));

async function boot(s) {
  const { save, status } = parseSave({ v2: s.store.getItem(SAVE_KEY), v1: s.store.getItem(V1_SAVE_KEY) });
  const known = new Set(s.chapters.map(c => c.id));
  s.save = { ...save, cleared: save.cleared.filter(id => known.has(id)) };
  s.boot = status;
  s.obs = await s.backend.observe();
  return start(s, resumeChapter(s.chapters, { saved: save.chapter, cleared: s.save.cleared }), true);
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
    hearts: MAX_HEARTS,
    replay: s.save.cleared.includes(id),
  });
  s.save.chapter = id;
  persist(s);
  return view(s);
}

async function submit(s, line) {
  requireBooted(s);
  const answer = GAME_COMMANDS.get(line.trim());
  return answer ? gameTurn(s, answer(s)) : shellTurn(s, line);
}

async function shellTurn(s, line) {
  const before = s.obs;
  const result = await s.backend.run(line);
  const after = await s.backend.observe();
  s.obs = after;
  const ctx = makeContext({ commands: result.commands, before, obs: after });
  const effects = [...lineEffects(ctx, result.blocked), ...(current(s).effects?.(ctx) ?? [])];
  const events = await advance(s, ctx);
  const danger = result.blocked[0] ?? dangers(ctx)[0];
  if (danger !== undefined) events.push(...await hurt(s, danger));
  if (s.obs !== after) effects.push(...worldEffects(after, s.obs));
  return { result, obs: s.obs, effects, events, view: view(s) };
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
    const xp = payout(XP.task, s.hints[index], s.replay);
    s.tasksDone[index] = true;
    s.save.xp += xp;
    return { kind: 'task', index, goal: tasks[index].goal, xp };
  });
  if (s.tasksDone.every(Boolean)) {
    await openBossRoom(s);
    events.push({ kind: 'boss-start', title: boss.title });
  }
  return events;
}

async function openBossRoom(s) {
  const room = current(s).boss.setup(s.random, who(s));
  await s.backend.load(room.patch);
  s.obs = await s.backend.observe();
  s.secret = room.secret;
  s.phase = 'boss';
}

function clearChapter(s) {
  const chapter = current(s);
  const bossXp = payout(XP.boss, s.bossHints, s.replay);
  const clearXp = s.replay ? 0 : XP.clear;
  s.save.xp += bossXp + clearXp;
  if (!s.save.cleared.includes(chapter.id)) s.save.cleared.push(chapter.id);
  s.phase = 'done';

  const following = s.chapters[s.index + 1];
  const next = following && canStart(statuses(s)[s.index + 1]) ? following.id : null;
  s.save.chapter = next ?? chapter.id;
  return [
    { kind: 'boss', xp: bossXp },
    { kind: 'chapter', id: chapter.id, recap: chapter.recap, field: chapter.field, xp: clearXp, next },
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
    target = { base: XP.task, used: s.hints[index], hints: chapter.tasks[index].hints, use: () => { s.hints[index] += 1; } };
  } else if (s.phase === 'boss') {
    target = { base: XP.boss, used: s.bossHints, hints: chapter.boss.hints, use: () => { s.bossHints += 1; } };
  }
  return target;
}

function hint(s) {
  requireBooted(s);
  const target = hintTarget(s);
  let shown = null;
  if (target) {
    const next = nextHint(target.base, target.used, s.replay);
    if (next) target.use();
    const level = next?.level ?? HINT_LEVELS;
    shown = { level, text: target.hints[level - 1], cost: next?.cost ?? 0 };
  }
  return shown;
}

function hintText(s) {
  const shown = hint(s);
  let text = 'This chapter is cleared: there is nothing left to hint at.';
  if (shown) {
    const cost = shown.cost > 0 ? ` (costs ${shown.cost} XP)` : '';
    text = `Hint ${shown.level} of ${HINT_LEVELS}${cost}: ${shown.text}`;
  }
  return text;
}

function questText(s) {
  const chapter = current(s);
  const lines = [
    `${chapter.title} (chapter ${s.index + 1} of ${s.chapters.length})`,
    ...chapter.tasks.map((task, i) => `[${s.tasksDone[i] ? 'x' : ' '}] ${task.goal}`),
  ];
  if (s.phase === 'boss') lines.push(`Boss: ${chapter.boss.title}. Its briefing is in the Quest panel.`);
  if (s.phase === 'done') lines.push('Chapter cleared.');
  return lines.join('\n');
}

/** Game commands typed in the terminal; they are not Linux and never reach the backend. */
const GAME_COMMANDS = new Map([['hint', hintText], ['quest', questText]]);

function gameTurn(s, text) {
  const result = { output: [{ stream: 'note', text }], status: 0, commands: [], blocked: [] };
  return { result, obs: s.obs, effects: [], events: [], view: view(s) };
}

function setSound(s, on) {
  if (typeof on !== 'boolean') throw new Error(`sound must be a boolean, got ${on}`);
  return updateSave(s, { sound: on });
}

function updateSave(s, fields) {
  requireBooted(s);
  Object.assign(s.save, fields);
  persist(s);
  return view(s);
}

async function reset(s) {
  requireBooted(s);
  const { sound, introSeen } = s.save;
  s.save = { ...freshSave(), sound, introSeen };
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
    tasks: chapter.tasks.map((task, i) => ({ goal: task.goal, done: s.tasksDone[i], next: i === next, hints: task.hints.slice(0, s.hints[i]) })),
    boss: { title: chapter.boss.title, briefing: chapter.boss.briefing, hints: chapter.boss.hints.slice(0, s.bossHints) },
  };
}

function view(s) {
  requireBooted(s);
  const status = statuses(s);
  const target = hintTarget(s);
  const { user, host, cwd, home } = s.obs;
  return {
    chapter: chapterView(s),
    hint: target ? nextHint(target.base, target.used, s.replay) : null,
    xp: s.save.xp,
    rank: rankFor(s.save.xp),
    hearts: { left: s.hearts, max: MAX_HEARTS },
    sound: s.save.sound,
    introSeen: s.save.introSeen,
    chapters: s.chapters.map((c, i) => ({ id: c.id, number: i + 1, act: c.act, title: c.title, status: status[i] })),
    spellbook: s.chapters.flatMap((c, i) => (c.spells ?? []).map(spell => ({ ...spell, chapter: c.id, unlocked: canStart(status[i]) }))),
    prompt: { user, host, cwd, home },
    boot: s.boot,
  };
}
