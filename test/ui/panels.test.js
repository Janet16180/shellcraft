import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questHTML, spellsHTML, chaptersHTML, nowHTML } from '../../src/ui/panels.js';
import { sampleView } from './fixtures/view.js';

function withPhase(phase) {
  const view = sampleView();
  view.chapter.phase = phase;
  return view;
}

test('the quest log numbers the tasks, ticks done ones and marks the next one', () => {
  const html = questHTML(sampleView());
  assert.match(html, /<li class="done">.*Ask the terminal who you are/s);
  assert.match(html, /<li class="next" aria-current="step">.*Find out where you are standing/s);
  assert.equal((html.match(/class="num"/g) ?? []).length, 3);
});

test('task goals are text, so markup in them is escaped', () => {
  assert.match(questHTML(sampleView()), /Read the &lt;letter&gt; left for you/);
});

test('the lesson is trusted HTML and shown as written', () => {
  assert.match(questHTML(sampleView()), /<p>You wake up inside a terminal\. Type <code>whoami<\/code>\.<\/p>/);
});

test('the hint button shows the next level and its cost before it is clicked', () => {
  assert.match(questHTML(sampleView()), /Hint 2 of 3: the technique \(-3 XP\)/);
});

test('revealed hints stay listed under their level', () => {
  const html = questHTML(sampleView());
  assert.match(html, /<b>A nudge<\/b><span>Which command prints the working directory\?<\/span>/);
});

test('in the boss room the revealed hints are the boss hints', () => {
  const view = withPhase('boss');
  view.chapter.boss.hints = [{ level: 1, text: 'Look for a name nobody would type.', cost: 0 }, { level: 2, text: 'Use ls.', cost: 3 }];
  const html = questHTML(view);
  assert.match(html, /<b>A nudge<\/b><span>Look for a name nobody would type\.<\/span>.*<b>The technique<\/b><span>Use ls\.<\/span>/s);
  assert.doesNotMatch(html, /Which command prints/);
});

test('with every hint revealed the hint button is disabled', () => {
  assert.match(questHTML(sampleView({ hint: null })), /<button[^>]*id="hintBtn"[^>]*disabled>No more hints for this step/);
});

test('in the boss room the briefing replaces the step list', () => {
  const html = questHTML(withPhase('boss'));
  assert.match(html, /Boss room/);
  assert.match(html, /The Lost Name/);
  assert.match(html, /Find the file whose name the daemon hid/);
  assert.doesNotMatch(html, /quest-log/);
});

test('a cleared chapter offers the adventure log and no hints', () => {
  const html = questHTML(withPhase('done'));
  assert.match(html, /id="logBtn"/);
  assert.doesNotMatch(html, /hintBtn/);
});

test('locked spells hide their examples', () => {
  const html = spellsHTML(sampleView().spellbook);
  assert.match(html, /<div class="spell locked"><h3>cd<\/h3><p>Locked: you learn it in a later chapter\.<\/p><\/div>/);
});

test('spell examples are buttons that carry the command to insert', () => {
  const html = spellsHTML([{ name: 'cat', summary: 'Print a file.', examples: [['cat "a b"', 'quotes']], unlocked: true }]);
  assert.match(html, /<button type="button" class="chip" data-ins="cat &quot;a b&quot;">cat &quot;a b&quot;<small>quotes<\/small><\/button>/);
});

test('chapters are grouped by act, and the current one is marked', () => {
  const html = chaptersHTML(sampleView().chapters);
  assert.match(html, /<h3 class="act">Act I<\/h3>.*<h3 class="act">Act II<\/h3>/s);
  assert.match(html, /class="cur" aria-current="true"[^>]*>.*The Awakening/s);
});

test('chapters that are locked or still being written cannot be opened', () => {
  const html = chaptersHTML(sampleView().chapters);
  assert.match(html, /data-ch="forest" class="locked" disabled>/);
  assert.match(html, /data-ch="unseen" class="soon" disabled>.*coming soon/s);
});

test('a replayed chapter says up front that it pays no XP', () => {
  const view = sampleView();
  view.chapter.replay = true;
  assert.match(questHTML(view), /replaying it pays no XP/);
  assert.doesNotMatch(questHTML(sampleView()), /replaying/);
});

test('backticked names in goals, summaries and notes show as code', () => {
  const view = sampleView();
  view.chapter.tasks[1].goal = 'Walk to `forest/cave/deep`';
  assert.match(questHTML(view), /Walk to <code>forest\/cave\/deep<\/code>/);
  const html = spellsHTML([{ name: 'pwd', summary: 'Print `pwd`.', examples: [['pwd', 'prints `/home/hero`']], unlocked: true }]);
  assert.match(html, /<p>Print <code>pwd<\/code>\.<\/p>/);
  assert.match(html, /<small>prints <code>\/home\/hero<\/code><\/small>/);
});

test('the exact-command hint is all code; the others are prose', () => {
  const view = sampleView();
  view.chapter.tasks[1].hints = [{ level: 1, text: 'Where are you?', cost: 0 }, { level: 3, text: 'pwd', cost: 5 }];
  const html = questHTML(view);
  assert.match(html, /<span>Where are you\?<\/span>/);
  assert.match(html, /<span><code>pwd<\/code><\/span>/);
});

test('the strip over the terminal names the next task and where it is in the list', () => {
  assert.equal(nowHTML(sampleView().chapter), '<b>Next task 2 of 3:</b> Find out where you are standing');
});

test('in the boss room the strip names the boss; a cleared chapter says so', () => {
  assert.equal(nowHTML(withPhase('boss').chapter), '<b>Boss room:</b> The Lost Name');
  assert.equal(nowHTML(withPhase('done').chapter), '<b>Chapter cleared.</b> Explore freely, or pick a chapter in the Chapters tab.');
});
