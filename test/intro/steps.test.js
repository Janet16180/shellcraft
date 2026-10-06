import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, WORLD, PROMPT_PIECES } from '../../src/intro/steps.js';
import { validatePatch } from '../../src/backend/spec.js';

const ALLOWED_TAGS = new Set(['code', 'kbd', 'b', 'em']);
const ROLES = new Set(['command', 'option', 'argument']);

function tagsIn(html) {
  return [...html.matchAll(/<\/?([a-z0-9]+)[^>]*>/g)].map(m => m[1]);
}

function balanced(html) {
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)[^>]*>/g)) {
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
}

function captions(step) {
  return [...step.text, ...(step.keys ?? []).map(([, what]) => what)];
}

test('every step has a unique id, a title and at least one caption paragraph', () => {
  const ids = STEPS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const step of STEPS) {
    assert.ok(step.title, step.id);
    assert.ok(step.text.length > 0, step.id);
  }
});

test('captions use only inline tags, balanced, and never angle-bracket placeholders', () => {
  for (const step of STEPS) {
    for (const html of captions(step)) {
      for (const tag of tagsIn(html)) assert.ok(ALLOWED_TAGS.has(tag), `${step.id}: <${tag}>`);
      assert.ok(balanced(html), `${step.id}: unbalanced ${html}`);
    }
  }
});

test('the prompt is explained piece by piece, in the order the pieces appear', () => {
  const order = PROMPT_PIECES.map(p => p.role).filter(Boolean);
  const focused = STEPS.filter(s => s.focus).map(s => s.focus);
  assert.deepEqual(focused, order);
  assert.equal(PROMPT_PIECES.map(p => p.text).join(''), 'hero@kernelia:~$');
});

test('the storyboard types ls, cd forest, cd .., cat readme.txt and ls -l forest in that order', () => {
  assert.deepEqual(STEPS.filter(s => s.type).map(s => s.type), ['ls', 'cd forest', 'cd ..', 'cat readme.txt', 'ls -l forest']);
});

test('a split line is exactly its parts joined by spaces, each with a known role', () => {
  for (const step of STEPS.filter(s => s.parts)) {
    assert.equal(step.parts.map(([word]) => word).join(' '), step.type);
    for (const [, role] of step.parts) assert.ok(ROLES.has(role), role);
  }
});

test('the room stays dark until ls looks around, and stays lit after', () => {
  const firstLit = STEPS.findIndex(s => s.light);
  assert.equal(STEPS[firstLit].type, 'ls');
  assert.ok(STEPS.slice(firstLit).every(s => s.light));
});

test('the intro ends with the player typing a real command', () => {
  const last = STEPS.at(-1);
  assert.equal(last.id, 'your-turn');
  assert.ok(last.yourTurn);
  assert.equal(STEPS.filter(s => s.yourTurn).length, 1);
});

test('the keys step covers Enter, Tab, Up, man and hint', () => {
  const keys = STEPS.find(s => s.keys).keys.map(([key]) => key);
  assert.deepEqual(keys, ['Enter', 'Tab', 'Up', 'man', 'hint']);
});

test('the intro world is a valid patch', () => {
  assert.equal(validatePatch(WORLD), WORLD);
});
