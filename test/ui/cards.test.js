import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleCardHTML, bossCardHTML, debriefHTML } from '../../src/ui/cards.js';

const CLEARED = {
  chapter: { number: 2, title: 'The Whispering Forest' },
  recap: [['cd dir', 'enter a directory'], ['cd ..', 'go up to the parent']],
  why: '<p>Every path you will ever type starts from where you stand.</p>',
  field: [['cd -', 'jump back to the previous directory']],
  xp: 110,
  next: { id: 'unseen', number: 3, title: 'Things Unseen', status: 'soon' },
};

test('a first visit starts the adventure; a saved game offers to continue or start over', () => {
  assert.match(titleCardHTML(null), /id="goBtn"[^>]*>Start adventure</);
  assert.doesNotMatch(titleCardHTML(null), /newBtn/);
  const resumed = titleCardHTML({ number: 2, title: 'The Whispering Forest' });
  assert.match(resumed, />Continue: chapter 2</);
  assert.match(resumed, /id="newBtn"/);
});

test('the boss card shows the room title and its briefing', () => {
  const html = bossCardHTML({ title: 'Lost <in> the Dungeon', briefing: '<p>Find the exit.</p>' }, 2);
  assert.match(html, /Chapter 2 &middot; Boss room/);
  assert.match(html, /<h2 id="cardTitle">Lost &lt;in&gt; the Dungeon<\/h2>/);
  assert.match(html, /<div class="brief"><p>Find the exit\.<\/p><\/div>/);
  assert.match(html, /id="bossGo"/);
});

test('the adventure log lists the recap, the why and the field commands', () => {
  const html = debriefHTML(CLEARED);
  assert.match(html, /Adventure log/);
  assert.match(html, /<dt>cd dir<\/dt><dd>enter a directory<\/dd>/);
  assert.match(html, /<div class="why"><p>Every path/);
  assert.match(html, /<dt>cd -<\/dt><dd>jump back to the previous directory<\/dd>/);
  assert.match(html, /\+110 XP/);
});

test('a replay says it paid no XP', () => {
  assert.match(debriefHTML({ ...CLEARED, xp: 0 }), /class="xpgain replay">Replays pay no XP/);
});

test('when the next chapter is still being written the log says so instead of offering it', () => {
  const html = debriefHTML(CLEARED);
  assert.match(html, /Chapter 3, Things Unseen, is coming soon/);
  assert.doesNotMatch(html, /id="nextBtn"/);
});

test('when the next chapter is open the log offers to continue', () => {
  const html = debriefHTML({ ...CLEARED, next: { id: 'forest', number: 2, title: 'The Whispering Forest', status: 'open' } });
  assert.match(html, /<button class="px-btn primary" id="nextBtn" type="button" data-ch="forest">Continue to chapter 2<\/button>/);
});

test('without a why the section is left out', () => {
  assert.doesNotMatch(debriefHTML({ ...CLEARED, why: '' }), /class="why"/);
});
