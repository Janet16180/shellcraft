import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepPlan, nextLabel } from '../../src/intro/explainer.js';

const draw = (diagram, timing) => `<p data-end="${timing.end}" data-at="${diagram.at === undefined ? '' : timing.at(diagram.at).toFixed(2)}"></p>`;

test('a step without lines plays the gentle page sound at once and draws from the start', () => {
  const plan = stepPlan(draw, { title: 'T', text: ['A.'], diagram: {} });
  assert.deepEqual({ term: plan.term, typed: plan.typed, sound: plan.sound, cueAt: plan.cueAt }, { term: '', typed: '', sound: 'page', cueAt: 0 });
  assert.equal(plan.diagram, '<p data-end="0" data-at=""></p>');
});

test('a step with lines plays its own sound with the first output and gives the diagram the timeline', () => {
  const plan = stepPlan(draw, { title: 'T', text: ['A.'], sound: 'create', term: [{ type: 'ls', output: ['a.txt'] }], diagram: { at: 0 } });
  assert.equal(plan.sound, 'create');
  assert.equal(plan.cueAt.toFixed(2), '0.29');
  assert.equal(plan.diagram, '<p data-end="0.79" data-at="0.29"></p>');
  assert.equal(plan.typed, '$ ls\na.txt');
  assert.match(plan.term, /class="ln out ex-in"/);
});

test('the last step says Done', () => {
  assert.deepEqual([0, 1, 2].map(i => nextLabel(i, 3)), ['Next', 'Next', 'Done']);
});
