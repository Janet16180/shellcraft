/**
 * Play chapter modules on the real simulator for chapter tests: start a
 * chapter on the base world, type lines (a tab character in a line means the
 * player pressed Tab there), judge tasks with the real check context, and set
 * up boss rooms with a seeded random.
 */
import { createSimBackend } from '../../../src/shell/backend.js';
import { makeContext } from '../../../src/game/checks.js';
import { createRandom } from '../../../src/game/rng.js';
import { baseWorld } from '../../../src/game/world.js';
import { PLAYER } from '../../../src/backend/player.js';
import { typeLine, KEY_SIGNALS } from '../../helpers/type-line.js';
import { coachNote } from '../../../src/game/coach.js';
import assert from 'node:assert/strict';

export { PLAYER };
const NOW = Date.UTC(2026, 9, 6, 12);

/**
 * A fresh simulator with the base world and the chapter's setup loaded. Its
 * clock stands still until the test moves it: `await backend.tick(30)` lets
 * 30 seconds pass, so a `sleep 30 &` job ends.
 *
 * @param {object} chapter A chapter module.
 * @param {number} [seed] Seeds the simulator and the setup.
 * @returns {Promise<object>} The backend, with `tick(seconds)`.
 */
export async function startChapter(chapter, seed = 1) {
  let now = NOW;
  const backend = createSimBackend({ now: () => now, random: createRandom(seed) });
  backend.tick = async seconds => { now += seconds * 1000; };
  // Like the session, a line is judged against the observation after the line
  // before (or after the last load): a job that ended meanwhile was running then.
  const load = backend.load;
  backend.load = async patch => {
    await load(patch);
    backend.seen = await backend.observe();
  };
  await backend.load([...baseWorld(PLAYER), ...chapter.setup(createRandom(seed), PLAYER)]);
  return backend;
}

/**
 * The password a chapter's setup gives the player, if any.
 *
 * @param {object} chapter A chapter module, or just its tasks (then null).
 * @returns {string|null} The text of its password() operation, or null.
 */
export function passwordOf(chapter) {
  return chapter.setup?.(createRandom(1), PLAYER).findLast(op => op.op === 'password')?.text ?? null;
}

// While a line runs: the next key (a number waits that many seconds, then
// the line goes on if its command is over), or, with no key left, time
// passes until the command ends. A command that never ends needs a key.
async function nextRunning(backend, running, keys) {
  const key = keys.shift();
  let next;
  if (typeof key === 'number') {
    await backend.tick(key);
    next = { result: await backend.poll() };
  } else if (key !== undefined) next = { result: await backend.signal(KEY_SIGNALS[key]) };
  else if (running.seconds !== null && backend.tick) {
    await backend.tick(running.seconds);
    next = { result: await backend.poll() };
  } else next = { result: await backend.signal('INT'), unforeseen: 'kept running' };
  return next;
}

// Run a line, answering each prompt with the next answer and pressing the
// keys while it runs. What the test did not foresee is cancelled (Ctrl+C),
// so the backend stays usable, and raises.
async function runAnswering(backend, line, answers, keys) {
  const parts = [await backend.run(line)];
  let unforeseen = null;
  while (parts.at(-1).input || parts.at(-1).running) {
    const last = parts.at(-1);
    if (last.input) {
      unforeseen ??= answers.length ? null : `asked for input (${last.input.prompt})`;
      parts.push(await backend.answer(unforeseen === null ? answers.shift() : null));
    } else {
      const next = await nextRunning(backend, last.running, keys);
      unforeseen ??= next.unforeseen ?? null;
      parts.push(next.result);
    }
  }
  if (unforeseen !== null) throw new Error(`"${line}" ${unforeseen} and the test gave no answer or key`);
  if (keys.length) throw new Error(`"${line}" ended before the test pressed ${keys.join(', ')}: the line did not use them`);
  const last = parts.at(-1);
  return { ...last, output: parts.flatMap(p => p.output) };
}

/**
 * Type one line and press Enter, with typeLine's rule: a tab in the line
 * presses Tab there. Tab presses are recorded for the check context. On a
 * backend from startChapter, `ctx.before` is the observation after the line
 * before (or the last load), as in the session.
 *
 * When the line asks for hidden input (sudo's password), the answers are
 * given in order: `{ password: 'dragon' }`, or several tries
 * `{ password: ['wrong', 'dragon'] }`, where null is Ctrl+C. The result
 * joins the output of every part, as the terminal shows it.
 *
 * When a command runs in the foreground (`sleep 100`, `fg`), `keys` are
 * pressed in order while it runs: `'ctrl-c'`, `'ctrl-z'`, or a number of
 * seconds to let pass first: `{ keys: [30, 'ctrl-z'] }`. Without a key left
 * the test clock moves on to the command's end. Ctrl+C and Ctrl+Z written
 * at the end of the line (`'sleep 100\u001a'`) are pressed too.
 *
 * @param {object} backend The backend, from startChapter.
 * @param {string} line The keys typed.
 * @param {{password?: string|null|(string|null)[], keys?: ('ctrl-c'|'ctrl-z'|number)[]}} [answers]
 *   What to type at each prompt, and the keys to press while the line runs.
 * @returns {Promise<{result: object, ctx: object}>} What ran, and the check context of the line.
 * @throws {Error} If the line asks for input the answers do not cover, runs on with no key
 *   to end it, or ends before every key was pressed.
 */
export async function type(backend, line, { password, keys = [] } = {}) {
  const completions = [];
  const complete = async typed => {
    const answer = await backend.complete(typed);
    completions.push({ line: typed, completed: answer.line });
    return answer;
  };
  const submit = async (typed, pressed) => {
    const before = backend.seen ?? await backend.observe();
    const result = await runAnswering(backend, typed, password === undefined ? [] : [password].flat(), [...pressed, ...keys]);
    const obs = await backend.observe();
    if (backend.seen) backend.seen = obs;
    return { result, ctx: makeContext({ commands: result.commands, before, obs, completions, line: typed, typed }) };
  };
  return typeLine(line, { complete, submit });
}

/**
 * Whether a chunk of standard error is bash's word about its jobs (`[1] 4242`,
 * `[1]+  Done    sleep 30`, `(wd now: ~)`), which is no error.
 *
 * @param {string} text The chunk's text.
 * @returns {boolean} True when every line of it is a job notice or blank.
 */
export const jobNotice = text => text.split('\n').every(line => line === '' || /^\[\d+\]|^\(wd now: /.test(line));

/**
 * The error output of a run, as one string, without bash's job notices.
 *
 * @param {object} result A RunResult.
 * @returns {string} Every 'err' chunk joined.
 */
export const errors = result => result.output.filter(c => c.stream === 'err' && !jobNotice(c.text)).map(c => c.text).join('');

/**
 * Whether a run hit an unknown command.
 *
 * @param {object} result A RunResult.
 * @returns {boolean} True if bash would say "command not found".
 */
export const notFound = result => /command not found/.test(errors(result)) || result.commands.some(r => r.status === 127);

/**
 * Type lines in order and record which tasks passed at least once. A
 * password prompt is answered with the password the chapter's setup sets.
 *
 * @param {object} chapter A chapter module.
 * @param {object} backend A backend with the chapter set up.
 * @param {string[]} lines The lines.
 * @returns {Promise<{done: boolean[], errors: string[]}>} Tasks that passed, and every line's error output.
 */
export async function play(chapter, backend, lines) {
  const done = chapter.tasks.map(() => false);
  const errs = [];
  const password = passwordOf(chapter) ?? undefined;
  for (const line of lines) {
    const { result, ctx } = await type(backend, line, { password });
    chapter.tasks.forEach((task, i) => { done[i] ||= task.done(ctx); });
    if (errors(result)) errs.push(`${line}: ${errors(result)}`);
  }
  return { done, errors: errs };
}

/**
 * Play the chapter's solve, then set up its boss room.
 *
 * @param {object} chapter A chapter module.
 * @param {number} seed Seeds the simulator and the boss.
 * @returns {Promise<{backend: object, secret: object, obs: object}>} The backend in the boss room, the secret and the observation.
 */
export async function startBoss(chapter, seed) {
  const backend = await startChapter(chapter, seed);
  await play(chapter, backend, chapter.solve);
  const room = chapter.boss.setup(createRandom(seed), PLAYER);
  await backend.load(room.patch);
  return { backend, secret: room.secret, obs: await backend.observe() };
}

/**
 * Every `<code>` snippet of a lesson or briefing, as plain text.
 *
 * @param {string} html Trusted lesson HTML.
 * @returns {string[]} The snippets.
 */
export function codeSnippets(html) {
  const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return [...html.matchAll(/<code>(.*?)<\/code>/g)].map(m => unescape(m[1]));
}

/**
 * Describe an expected near note for a test title.
 *
 * @param {RegExp|{coach: RegExp}|null} expected A pattern for the task's note, the coach's note, or no note.
 * @returns {string} The words for the title.
 */
export function nearTitle(expected) {
  let words = 'gives no near note';
  if (expected instanceof RegExp) words = 'gives a near note';
  else if (expected) words = 'leaves the note to the coach';
  return words;
}

/**
 * Check a task's near note against what the test expects. `{ coach: pattern }`
 * means the task stays silent so the generic coach (src/game/coach.js) speaks.
 *
 * @param {string|null} note What the task's near returned.
 * @param {object} ctx The check context of the line.
 * @param {RegExp|{coach: RegExp}|null} expected A pattern for the task's note, the coach's note, or null.
 * @returns {void}
 * @throws {import('node:assert').AssertionError} If the note does not match.
 */
export function assertNear(note, ctx, expected) {
  if (expected instanceof RegExp) {
    assert.match(note, expected);
  } else if (expected) {
    assert.equal(note, null, 'the task leaves this case to the coach');
    assert.match(coachNote(ctx), expected.coach);
  } else {
    assert.equal(note, null);
  }
}
