import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recapHTML, scoreHTML, nextLabel } from '../../src/intro/ending.js';

const journey = [{ act: 1, name: 'Act I', chapters: [{ number: 2, title: 'The <Forest>', spells: ['cd', 'ls'], fresh: ['cd'] }] }];

test('the recap shows each act, its chapters by number and title, and their spells, lighting the fresh ones', () => {
  const html = recapHTML(journey);
  assert.match(html, /<h3>Act I<\/h3>/);
  assert.match(html, /<span class="num">02<\/span>/);
  assert.match(html, /<b>The &lt;Forest&gt;<\/b>/);
  assert.match(html, /<code class="fresh">cd<\/code> <code class="">ls<\/code>/);
});

test('the score shows the XP, the rank and the chapters cleared, escaped', () => {
  const html = scoreHTML({ xp: 1180, rank: 'Root <Wizard>', cleared: 21, total: 21 });
  assert.match(html, /<dt>XP<\/dt><dd>1180<\/dd>/);
  assert.match(html, /<dd>Root &lt;Wizard&gt;<\/dd>/);
  assert.match(html, /<dd>21 of 21<\/dd>/);
});

test('the forward button says Finish on the last step only', () => {
  assert.equal(nextLabel(0, 5), 'Next');
  assert.equal(nextLabel(4, 5), 'Finish');
});
