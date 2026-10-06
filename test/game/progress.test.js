import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  XP, MAX_HEARTS, payout, nextHint, rankFor, loseHeart, chapterStatuses, canStart, resumeChapter,
} from '../../src/game/progress.js';

const list = [
  { id: 'awakening' },
  { id: 'forest' },
  { id: 'unseen', soon: true },
];

test('a task pays 10, a boss 30 and clearing a chapter 20 more', () => {
  assert.deepEqual(XP, { task: 10, boss: 30, clear: 20 });
});

test('a payout without hints is the full amount', () => {
  assert.equal(payout(XP.task, 0, false), 10);
  assert.equal(payout(XP.boss, 0, false), 30);
});

test('the nudge is free, the technique costs 3 and the exact command 5 more', () => {
  assert.equal(payout(XP.task, 1, false), 10);
  assert.equal(payout(XP.task, 2, false), 7);
  assert.equal(payout(XP.boss, 3, false), 22);
});

test('hint costs never take a payout below 2', () => {
  assert.equal(payout(XP.task, 3, false), 2);
  assert.equal(payout(4, 3, false), 2);
});

test('replaying a cleared chapter pays nothing, hints or not', () => {
  assert.equal(payout(XP.boss, 0, true), 0);
  assert.equal(payout(XP.task, 3, true), 0);
});

test('a hint count outside 0 to 3 raises', () => {
  assert.throws(() => payout(XP.task, 4, false), /hints/);
  assert.throws(() => payout(XP.task, -1, false), /hints/);
});

test('the next hint says its level and the XP it will take off the payout', () => {
  assert.deepEqual(nextHint(XP.task, 0, false), { level: 1, cost: 0 });
  assert.deepEqual(nextHint(XP.task, 1, false), { level: 2, cost: 3 });
  assert.deepEqual(nextHint(XP.task, 2, false), { level: 3, cost: 5 });
});

test('a hint costs nothing when the payout is already zero or at its floor', () => {
  assert.deepEqual(nextHint(XP.task, 1, true), { level: 2, cost: 0 });
  assert.deepEqual(nextHint(4, 1, false), { level: 2, cost: 2 });
  assert.deepEqual(nextHint(4, 2, false), { level: 3, cost: 0 });
});

test('there is no next hint after the third', () => {
  assert.equal(nextHint(XP.task, 3, false), null);
});

test('ranks climb from Novice to Root Wizard', () => {
  assert.deepEqual(rankFor(0), { title: 'Novice', floor: 0, next: 150 });
  assert.deepEqual(rankFor(149), { title: 'Novice', floor: 0, next: 150 });
  assert.deepEqual(rankFor(150), { title: 'Apprentice', floor: 150, next: 400 });
  assert.deepEqual(rankFor(400), { title: 'Adept', floor: 400, next: 750 });
  assert.deepEqual(rankFor(750), { title: 'Shell Mage', floor: 750, next: 1100 });
});

test('the top rank has no next rank', () => {
  assert.deepEqual(rankFor(5000), { title: 'Root Wizard', floor: 1100, next: null });
});

test('a negative XP total raises', () => {
  assert.throws(() => rankFor(-1), /xp/);
});

test('losing a heart leaves one fewer', () => {
  assert.equal(MAX_HEARTS, 3);
  assert.deepEqual(loseHeart(3), { hearts: 2, restored: false });
  assert.deepEqual(loseHeart(2), { hearts: 1, restored: false });
});

test('losing the last heart refills them all and says the Guardian restored you', () => {
  assert.deepEqual(loseHeart(1), { hearts: 3, restored: true });
});

test('losing a heart with none left raises', () => {
  assert.throws(() => loseHeart(0), /hearts/);
});

test('a new player can play only the first chapter', () => {
  assert.deepEqual(chapterStatuses(list, { current: null, cleared: [] }), ['open', 'locked', 'soon']);
});

test('clearing a chapter opens the next one and the current one shows as playing', () => {
  assert.deepEqual(chapterStatuses(list, { current: 'forest', cleared: ['awakening'] }), ['cleared', 'playing', 'soon']);
  assert.deepEqual(chapterStatuses(list, { current: 'awakening', cleared: ['awakening'] }), ['playing', 'open', 'soon']);
});

test('a soon chapter stays soon even when the one before it is cleared', () => {
  assert.deepEqual(chapterStatuses(list, { current: null, cleared: ['awakening', 'forest'] }), ['cleared', 'cleared', 'soon']);
});

test('only playing, open and cleared chapters can start', () => {
  assert.deepEqual(['playing', 'open', 'cleared', 'locked', 'soon'].map(canStart), [true, true, true, false, false]);
});

test('the game resumes at the saved chapter when it can start', () => {
  assert.equal(resumeChapter(list, { saved: 'awakening', cleared: ['awakening'] }), 'awakening');
});

test('without a usable saved chapter the game resumes at the first open one', () => {
  assert.equal(resumeChapter(list, { saved: null, cleared: [] }), 'awakening');
  assert.equal(resumeChapter(list, { saved: 'forest', cleared: [] }), 'awakening');
  assert.equal(resumeChapter(list, { saved: 'gone', cleared: ['awakening'] }), 'forest');
});

test('when every playable chapter is cleared the game resumes at the last one', () => {
  assert.equal(resumeChapter(list, { saved: 'unseen', cleared: ['awakening', 'forest'] }), 'forest');
});
