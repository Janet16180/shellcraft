import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintLabel, hintTitle, isExactCommand } from '../../src/ui/hints.js';

test('the hint button names the level and says a free hint is free', () => {
  assert.equal(hintLabel({ level: 1, cost: 0 }, 3), 'Hint 1 of 3: a nudge (free)');
});

test('the hint button shows what a paid hint costs before it is clicked', () => {
  assert.equal(hintLabel({ level: 2, cost: 3 }, 3), 'Hint 2 of 3: the technique (-3 XP)');
  assert.equal(hintLabel({ level: 3, cost: 5 }, 3), 'Hint 3 of 3: the exact command (-5 XP)');
});

test('the number of levels comes from the game, and the last level is always the exact command', () => {
  assert.equal(hintLabel({ level: 1, cost: 0 }, 4), 'Hint 1 of 4: a nudge (free)');
  assert.equal(hintLabel({ level: 4, cost: 5 }, 4), 'Hint 4 of 4: the exact command (-5 XP)');
});

test('with every hint revealed the button says so', () => {
  assert.equal(hintLabel(null, 3), 'No more hints for this step');
});

test('a revealed hint is titled by its level', () => {
  assert.equal(hintTitle(2, 3), 'The technique');
  assert.equal(hintTitle(3, 3), 'The exact command');
});

test('only the last level is the exact command', () => {
  assert.equal(isExactCommand(3, 3), true);
  assert.equal(isExactCommand(2, 3), false);
});

test('a hint level outside 1 to the number of levels is a bug and raises', () => {
  assert.throws(() => hintLabel({ level: 4, cost: 0 }, 3), /hint level/);
  assert.throws(() => hintTitle(0, 3), /hint level/);
});
