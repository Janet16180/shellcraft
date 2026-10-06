import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintNote, questNote, terminalText } from '../../src/game/commands.js';

const chapter = (fields = {}) => ({
  number: 2,
  total: 14,
  title: 'The Whispering Forest',
  phase: 'quest',
  tasks: [{ goal: 'Enter the forest', done: true }, { goal: 'Walk to `deep`', done: false }],
  boss: { title: 'Lost in the Dungeon' },
  ...fields,
});

test('terminal text drops the backticks that mark typed names', () => {
  assert.equal(terminalText('Use `cd ..` here.'), 'Use cd .. here.');
});

test('a hint note names the level, then the price of the next hint', () => {
  assert.equal(hintNote({ level: 1, text: 'Look around.', cost: 0 }, { level: 2, cost: 3 }), 'Hint 1 of 3: Look around.\nType hint again for hint 2 (costs 3 XP).');
  assert.equal(hintNote({ level: 2, text: 'Use ls.', cost: 3 }, { level: 3, cost: 5 }), 'Hint 2 of 3 (cost 3 XP): Use ls.\nType hint again for hint 3 (costs 5 XP).');
});

test('the last hint has no next one, and a free next hint says so', () => {
  assert.equal(hintNote({ level: 3, text: 'ls', cost: 5 }, null), 'Hint 3 of 3 (cost 5 XP): ls');
  assert.equal(hintNote({ level: 1, text: 'Look around.', cost: 0 }, { level: 2, cost: 0 }), 'Hint 1 of 3: Look around.\nType hint again for hint 2 (free).');
});

test('without a hint to give, the note says the chapter is cleared', () => {
  assert.equal(hintNote(null, null), 'This chapter is cleared: there is nothing left to hint at.');
});

test('the quest note lists the tasks with their state', () => {
  assert.equal(questNote(chapter()), 'The Whispering Forest (chapter 2 of 14)\n[x] Enter the forest\n[ ] Walk to `deep`');
});

test('the quest note names the boss in the boss phase and says when the chapter is cleared', () => {
  assert.match(questNote(chapter({ phase: 'boss' })), /\nBoss: Lost in the Dungeon\. Its briefing is in the Quest panel\.$/);
  assert.match(questNote(chapter({ phase: 'done' })), /\nChapter cleared\.$/);
});
