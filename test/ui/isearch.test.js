import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSearch, typeText, searchOlder, backspace, searchView } from '../../src/ui/isearch.js';

// The history of the bash 5.2 runs these cases were checked against (docs/verification/terminal-keys.md).
const HISTORY = ['echo alpha', 'echo beta', 'ls alpha'];

const typed = (state, text) => typeText(state, text);

test('the search starts with an empty string and shows the line being typed', () => {
  const view = searchView(startSearch(HISTORY, '', 0));
  assert.deepEqual(view, { prompt: '(reverse-i-search)`\': ', line: '', match: null, cursor: 0, failed: false });
});

test('each typed letter narrows the search, from the newest line and from the right', () => {
  let state = typed(startSearch(HISTORY, '', 0), 'a');
  assert.deepEqual(searchView(state), { prompt: '(reverse-i-search)`a\': ', line: 'ls alpha', match: { start: 7, end: 8 }, cursor: 7, failed: false });
  state = typed(state, 'l');
  assert.deepEqual(searchView(state).match, { start: 3, end: 5 });
  assert.equal(searchView(state).prompt, '(reverse-i-search)`al\': ');
});

test('Ctrl+R again finds the next older match, first further left in the same line', () => {
  let state = typed(startSearch(HISTORY, '', 0), 'a');
  const seen = [];
  for (let i = 0; i < 3; i++) {
    state = searchOlder(state);
    const { line, match } = searchView(state);
    seen.push([line, match.start]);
  }
  assert.deepEqual(seen, [['ls alpha', 3], ['echo beta', 8], ['echo alpha', 9]]);
});

test('when nothing older matches, the search fails and keeps showing the last match without highlighting it', () => {
  let state = typed(startSearch(HISTORY, '', 0), 'al');
  state = searchOlder(searchOlder(state));
  const view = searchView(state);
  assert.equal(view.prompt, '(failed reverse-i-search)`al\': ');
  assert.equal(view.line, 'echo alpha');
  assert.equal(view.match, null);
  assert.equal(view.failed, true);
});

test('a string found nowhere fails at once and shows the line being typed', () => {
  const view = searchView(typed(startSearch(HISTORY, '', 0), 'q'));
  assert.deepEqual(view, { prompt: '(failed reverse-i-search)`q\': ', line: '', match: null, cursor: 0, failed: true });
});

test('a letter that breaks the match fails and keeps the line; more letters stay failed', () => {
  let state = typed(startSearch(HISTORY, '', 0), 'bz');
  assert.equal(searchView(state).prompt, '(failed reverse-i-search)`bz\': ');
  assert.equal(searchView(state).line, 'echo beta');
  state = typed(state, 'e');
  assert.equal(searchView(state).failed, true);
});

test('Backspace takes the last letter off and searches again from the match', () => {
  const state = backspace(typed(startSearch(HISTORY, '', 0), 'al'));
  assert.deepEqual(searchView(state).match, { start: 3, end: 4 });
  assert.equal(searchView(state).line, 'ls alpha');
});

test('after a failure, Backspace searches on from the line before the last match, as readline does', () => {
  const fromBeta = backspace(typed(startSearch(HISTORY, '', 0), 'bz'));
  assert.equal(searchView(fromBeta).failed, true);
  assert.equal(searchView(fromBeta).prompt, '(failed reverse-i-search)`b\': ');
  const fromLs = backspace(typed(startSearch(HISTORY, '', 0), 'az'));
  assert.deepEqual(searchView(fromLs), { prompt: '(reverse-i-search)`a\': ', line: 'echo beta', match: { start: 8, end: 9 }, cursor: 8, failed: false });
});

test('Backspace on an empty string changes nothing', () => {
  const state = startSearch(HISTORY, 'ls', 2);
  assert.deepEqual(searchView(backspace(state)), searchView(state));
});

test('Ctrl+R with nothing typed yet does nothing', () => {
  const state = startSearch(HISTORY, '', 0);
  assert.deepEqual(searchView(searchOlder(state)), searchView(state));
});

test('the line being typed is searched first, left of the cursor', () => {
  let state = typed(startSearch(HISTORY, 'abc', 3), 'b');
  assert.deepEqual([searchView(state).line, searchView(state).match.start], ['abc', 1]);
  state = searchOlder(state);
  assert.equal(searchView(state).line, 'echo beta');
});

test('an older line equal to the match just shown is skipped', () => {
  let state = typed(startSearch([...HISTORY, 'echo beta'], '', 0), 'echo');
  assert.equal(searchView(state).line, 'echo beta');
  state = searchOlder(state);
  assert.equal(searchView(state).line, 'echo alpha');
  state = searchOlder(state);
  assert.equal(searchView(state).failed, true);
});

test('typing several letters at once searches as if each was typed in turn', () => {
  const together = typed(startSearch(HISTORY, '', 0), 'al');
  const apart = typed(typed(startSearch(HISTORY, '', 0), 'a'), 'l');
  assert.deepEqual(searchView(together), searchView(apart));
});

test('the view says which history entry is shown, so Up and Down can go on from it', () => {
  const state = typed(startSearch(HISTORY, 'x', 1), 'beta');
  assert.equal(state.shown, 1);
  assert.equal(startSearch(HISTORY, 'x', 1).shown, HISTORY.length);
});
