import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpPercent, chapterLabel, heartsHTML, layoutButton } from '../../src/ui/hud.js';

test('the XP bar fills from the current rank floor to the next rank', () => {
  assert.equal(xpPercent(40, { floor: 0, next: 150 }), (40 / 150) * 100);
  assert.equal(xpPercent(400, { floor: 400, next: 750 }), 0);
});

test('at the top rank the XP bar is full', () => {
  assert.equal(xpPercent(1300, { floor: 1100, next: null }), 100);
});

test('the chapter label names the act and the place in the book', () => {
  assert.equal(chapterLabel({ act: 1, number: 2, total: 14 }), 'Act I · Chapter 2 of 14');
});

test('hearts show filled and lost hearts, lost ones marked', () => {
  const html = heartsHTML({ left: 2, max: 3 });
  assert.equal((html.match(/<svg/g) ?? []).length, 3);
  assert.equal((html.match(/class="lost"/g) ?? []).length, 1);
});

test('the layout button names where the terminal is and offers the other layout', () => {
  assert.deepEqual(layoutButton('stacked'), { text: 'Terminal: below', label: 'Terminal below the map. Switch to the terminal on the right', next: 'side' });
  assert.deepEqual(layoutButton('side'), { text: 'Terminal: right', label: 'Terminal on the right. Switch to the terminal below the map', next: 'stacked' });
});
