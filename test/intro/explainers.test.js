import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLAINERS } from '../../src/intro/explainers.js';
import { assertExplainer } from '../helpers/chapter.js';

const ALLOWED_TAGS = new Set(['code', 'kbd', 'b', 'em']);
const all = Object.values(EXPLAINERS);

function balanced(html) {
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)[^>]*>/g)) {
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
}

test('every explainer follows the contract and is listed under its own id', () => {
  for (const [key, explainer] of Object.entries(EXPLAINERS)) {
    assertExplainer(explainer);
    assert.equal(explainer.id, key);
  }
});

test('captions use only inline tags, balanced', () => {
  for (const { id, steps } of all) {
    for (const html of steps.flatMap(s => [s.title, ...s.text])) {
      const tags = [...html.matchAll(/<\/?([a-z0-9]+)[^>]*>/g)].map(m => m[1]);
      assert.ok(tags.every(tag => ALLOWED_TAGS.has(tag)), `${id}: ${html}`);
      assert.ok(balanced(html), `${id}: ${html}`);
    }
  }
});

test('the permissions explainer has the six steps of the plan, ending with three people', () => {
  const { steps } = EXPLAINERS.perms;
  assert.deepEqual(steps.map(s => s.diagram.show), ['sets', 'ladder', 'ladder', 'ladder', 'ladder', 'walk']);
  assert.deepEqual(steps.at(-1).diagram.people.map(p => p.user), ['mira', 'oren', 'hero']);
  assert.equal(steps[4].diagram.file.mode, '----r--r--');
});

test('the links explainer goes from one name to a recap table', () => {
  const { steps } = EXPLAINERS.links;
  assert.deepEqual(steps.map(s => s.diagram.show), ['signs', 'signs', 'signs', 'symlink', 'teleport', 'symlink', 'table']);
});

test('the symlink length in ls -l is the length of the path it holds', () => {
  const line = EXPLAINERS.links.steps[3].term[1].output[0];
  const [, size, target] = line.match(/hero hero (\d+) .* -> (\S+)$/);
  assert.equal(Number(size), target.length);
});

test('every line the strips type is written in code in that step\'s caption or is shown in the strip only', () => {
  for (const { id, steps } of all) {
    for (const step of steps) {
      for (const { type } of step.term ?? []) {
        const command = type.split(' ')[0];
        const caption = [step.title, ...step.text].join(' ');
        const bare = caption.replace(/<code>.*?<\/code>/g, '');
        assert.ok(!new RegExp(`\\b${command}\\b`).test(bare) || command.length < 3, `${id}: ${command} appears outside code in "${step.title}"`);
      }
    }
  }
});
