import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintLabel, hintTitle } from '../../src/ui/hints.js';

test('the hint button names the level and says a free hint is free', () => {
  assert.equal(hintLabel({ level: 1, cost: 0 }), 'Hint 1 of 3: a nudge (free)');
});

test('the hint button shows what a paid hint costs before it is clicked', () => {
  assert.equal(hintLabel({ level: 2, cost: 3 }), 'Hint 2 of 3: the technique (-3 XP)');
  assert.equal(hintLabel({ level: 3, cost: 5 }), 'Hint 3 of 3: the exact command (-5 XP)');
});

test('with every hint revealed the button says so', () => {
  assert.equal(hintLabel(null), 'No more hints for this step');
});

test('a revealed hint is titled by its level', () => {
  assert.equal(hintTitle(2), 'The technique');
});

test('a hint level outside 1 to 3 is a bug and raises', () => {
  assert.throws(() => hintLabel({ level: 4, cost: 0 }), /hint level/);
});
