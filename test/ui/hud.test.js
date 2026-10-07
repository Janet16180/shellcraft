import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpPercent, chapterLabel, heartsHTML, layoutButton, hudOpen, hudToggle, SMALL_WINDOW } from '../../src/ui/hud.js';

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

test('the HUD starts collapsed on a small window and open on a large one, until the player chooses', () => {
  assert.equal(hudOpen({ small: true, chosen: null }), false);
  assert.equal(hudOpen({ small: false, chosen: null }), true);
  assert.equal(hudOpen({ small: true, chosen: true }), true);
  assert.equal(hudOpen({ small: false, chosen: false }), false);
});

test('the HUD toggle names what it does and reports whether the HUD is open', () => {
  assert.deepEqual(hudToggle(true), { text: 'Hide menu', expanded: 'true' });
  assert.deepEqual(hudToggle(false), { text: 'Menu', expanded: 'false' });
});

test('a small window is 760px wide or less, or less than 700px tall', () => {
  assert.equal(SMALL_WINDOW, '(max-width: 760px), (max-height: 699px)');
});
