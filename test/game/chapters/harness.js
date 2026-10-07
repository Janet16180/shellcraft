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
import { typeLine } from '../../helpers/type-line.js';
import { coachNote } from '../../../src/game/coach.js';
import assert from 'node:assert/strict';

export { PLAYER };
const NOW = Date.UTC(2026, 9, 6, 12);

/**
 * A fresh simulator with the base world and the chapter's setup loaded.
 *
 * @param {object} chapter A chapter module.
 * @param {number} [seed] Seeds the simulator and the setup.
 * @returns {Promise<object>} The backend.
 */
export async function startChapter(chapter, seed = 1) {
  const backend = createSimBackend({ now: () => NOW, random: createRandom(seed) });
  await backend.load([...baseWorld(PLAYER), ...chapter.setup(createRandom(seed), PLAYER)]);
  return backend;
}

/**
 * Type one line and press Enter, with typeLine's rule: a tab in the line
 * presses Tab there. Tab presses are recorded for the check context.
 *
 * @param {object} backend The backend.
 * @param {string} line The keys typed.
 * @returns {Promise<{result: object, ctx: object}>} What ran, and the check context of the line.
 */
export async function type(backend, line) {
  const completions = [];
  const complete = async typed => {
    const answer = await backend.complete(typed);
    completions.push({ line: typed, completed: answer.line });
    return answer;
  };
  const submit = async typed => {
    const before = await backend.observe();
    const result = await backend.run(typed);
    const obs = await backend.observe();
    return { result, ctx: makeContext({ commands: result.commands, before, obs, completions, line: typed }) };
  };
  return typeLine(line, { complete, submit });
}

/**
 * The error output of a run, as one string.
 *
 * @param {object} result A RunResult.
 * @returns {string} Every 'err' chunk joined.
 */
export const errors = result => result.output.filter(c => c.stream === 'err').map(c => c.text).join('');

/**
 * Whether a run hit an unknown command.
 *
 * @param {object} result A RunResult.
 * @returns {boolean} True if bash would say "command not found".
 */
export const notFound = result => /command not found/.test(errors(result)) || result.commands.some(r => r.status === 127);

/**
 * Type lines in order and record which tasks passed at least once.
 *
 * @param {object} chapter A chapter module.
 * @param {object} backend A backend with the chapter set up.
 * @param {string[]} lines The lines.
 * @returns {Promise<{done: boolean[], errors: string[]}>} Tasks that passed, and every line's error output.
 */
export async function play(chapter, backend, lines) {
  const done = chapter.tasks.map(() => false);
  const errs = [];
  for (const line of lines) {
    const { result, ctx } = await type(backend, line);
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
