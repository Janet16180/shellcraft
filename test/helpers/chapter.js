/**
 * The shared contract check for chapter modules (AUTHORING.md section 2).
 * Chapter tests call assertChapter on their module; the list test calls
 * assertChapterList. Each raises an AssertionError naming what is wrong.
 */
import assert from 'node:assert/strict';
import { validatePatch } from '../../src/backend/spec.js';
import { createRandom } from '../../src/game/rng.js';

const WHO = { home: '/home/hero', user: 'hero' };
const ID = /^[a-z][a-z0-9-]*$/;
// An angle-bracketed word is a placeholder the shell would read as a redirection.
const ANGLE_PLACEHOLDER = /<[A-Za-z][\w-]*>/;

const MAX_TIP = 140;

const isText = x => typeof x === 'string' && x.trim() !== '';
const isFunction = x => typeof x === 'function';
const isOptionalFunction = x => x === undefined || isFunction(x);

function assertHints(hints, where, resolve = hint => hint) {
  assert.ok(Array.isArray(hints) && hints.length === 3, `${where}: needs exactly 3 hints (nudge, technique, command)`);
  hints.map(resolve).forEach((hint, i) => {
    assert.ok(isText(hint), `${where}: hint ${i + 1} must be non-empty text`);
    assert.ok(!ANGLE_PLACEHOLDER.test(hint), `${where}: hint ${i + 1} uses an <angle> placeholder; write it in UPPERCASE`);
  });
}

function assertPairs(pairs, where) {
  assert.ok(Array.isArray(pairs) && pairs.length > 0, `${where}: needs at least one [command, meaning] pair`);
  pairs.forEach((pair, i) => assert.ok(Array.isArray(pair) && pair.length === 2 && pair.every(isText), `${where} ${i + 1}: must be two non-empty strings`));
}

function assertLines(lines, where) {
  assert.ok(Array.isArray(lines) && lines.length > 0 && lines.every(isText), `${where}: must be a non-empty list of lines`);
}

function assertTasks(tasks, where) {
  assert.ok(Array.isArray(tasks) && tasks.length > 0, `${where}: needs at least one task`);
  tasks.forEach((task, i) => {
    assert.ok(isText(task.goal), `${where} task ${i + 1}: goal must be non-empty text`);
    assertHints(task.hints, `${where} task ${i + 1}`);
    assert.ok(isFunction(task.done), `${where} task ${i + 1}: done must be a function`);
    assert.ok(isOptionalFunction(task.near), `${where} task ${i + 1}: near must be a function when present`);
    if (task.tip !== undefined) {
      assert.ok(isText(task.tip), `${where} task ${i + 1}: tip must be non-empty text`);
      assert.ok(task.tip.length <= MAX_TIP, `${where} task ${i + 1}: tip has ${task.tip.length} characters, at most ${MAX_TIP} allowed`);
    }
  });
}

function assertBoss(boss, where) {
  assert.ok(boss && typeof boss === 'object', `${where}: needs a boss`);
  assert.ok(isText(boss.title), `${where} boss: title must be non-empty text`);
  assert.ok(isText(boss.briefing), `${where} boss: briefing must be non-empty text`);
  for (const name of ['setup', 'done', 'solve']) assert.ok(isFunction(boss[name]), `${where} boss: ${name} must be a function`);
  assert.ok(isOptionalFunction(boss.near), `${where} boss: near must be a function when present`);

  const room = boss.setup(createRandom(1), WHO);
  assert.ok(room && Array.isArray(room.patch) && 'secret' in room, `${where} boss: setup must return { patch, secret }`);
  validatePatch(room.patch);
  assertHints(boss.hints, `${where} boss`, hint => (isFunction(hint) ? hint(room.secret) : hint));
}

function assertSpells(spells, where) {
  assert.ok(Array.isArray(spells), `${where}: spells must be a list`);
  spells.forEach((spell, i) => {
    assert.ok(isText(spell.name) && isText(spell.summary), `${where} spell ${i + 1}: needs a name and a summary`);
    assertPairs(spell.examples, `${where} spell ${spell.name} example`);
  });
  const names = spells.map(s => s.name);
  assert.equal(new Set(names).size, names.length, `${where}: spell names must be unique`);
}

/**
 * Check one chapter module against the authoring contract. A `soon`
 * placeholder needs only id, act and title. The setup functions are called
 * with a seeded random and their patches validated. Boss hints may be
 * functions of the secret; they are called with the secret from boss.setup.
 *
 * @param {object} chapter The chapter module's default export.
 * @returns {void}
 * @throws {import('node:assert').AssertionError} Naming the first broken rule.
 */
export function assertChapter(chapter) {
  assert.ok(chapter && typeof chapter === 'object', 'a chapter must be an object');
  const where = `chapter ${chapter.id}`;
  assert.ok(typeof chapter.id === 'string' && ID.test(chapter.id), `${where}: id must be lowercase letters, digits and dashes`);
  assert.ok(Number.isInteger(chapter.act) && chapter.act >= 1, `${where}: act must be a positive integer`);
  assert.ok(isText(chapter.title), `${where}: title must be non-empty text`);
  if (chapter.soon) return;

  assert.ok(isText(chapter.lesson), `${where}: lesson must be non-empty text`);
  assertTasks(chapter.tasks, where);
  assertLines(chapter.solve, `${where} solve`);
  assertBoss(chapter.boss, where);
  assertPairs(chapter.recap, `${where} recap`);
  assert.ok(isText(chapter.why), `${where}: why must be non-empty text`);
  assertPairs(chapter.field, `${where} field`);
  assertSpells(chapter.spells, where);
  assert.ok(chapter.effects === undefined || isFunction(chapter.effects), `${where}: effects must be a function when present`);
  assert.ok(isFunction(chapter.setup), `${where}: setup must be a function`);

  const patch = chapter.setup(createRandom(1), WHO);
  assert.ok(Array.isArray(patch), `${where}: setup must return a patch (a list of operations)`);
  validatePatch(patch);
}

/**
 * Check the ordered chapter list: every chapter passes assertChapter, ids are
 * unique, and the first chapter is playable.
 *
 * @param {object[]} chapters The list the session receives.
 * @returns {void}
 * @throws {import('node:assert').AssertionError} Naming the first broken rule.
 */
export function assertChapterList(chapters) {
  assert.ok(Array.isArray(chapters) && chapters.length > 0, 'the chapter list must be a non-empty list');
  chapters.forEach(assertChapter);
  const ids = chapters.map(c => c.id);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(repeated, [], `chapter ids must be unique, repeated: ${repeated.join(', ')}`);
  assert.ok(!chapters[0].soon, 'the first chapter must be playable, not soon');
}
