import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termTimeline, termHTML, TYPE_S } from '../../src/intro/term.js';

test('no lines take no time', () => {
  assert.deepEqual(termTimeline([]), { lines: [], end: 0 });
});

test('each line is typed a character at a time, and its output shows after it', () => {
  const { lines, end } = termTimeline([{ type: 'ls' }, { type: 'id', output: ['uid=1000(hero)'] }]);
  assert.equal(lines[0].at, 0);
  assert.ok(Math.abs(lines[0].outAt - (2 * TYPE_S + 0.2)) < 1e-9);
  assert.ok(lines[1].at > lines[0].outAt);
  assert.ok(end > lines[1].outAt);
});

test('a line may wait before it is typed, to let a drawing play first', () => {
  const plain = termTimeline([{ type: 'ls' }, { type: 'pwd' }]).lines[1].at;
  const waited = termTimeline([{ type: 'ls' }, { type: 'pwd', wait: 2 }]).lines[1].at;
  assert.ok(Math.abs(waited - plain - 2) < 1e-9);
});

test('the strip shows the prompt of the user and directory given, the default being hero at home', () => {
  const html = termHTML([{ type: 'id', user: 'oren' }, { type: 'ls', cwd: '/home/hero/portal' }]);
  assert.match(html, /<span class="pu">oren@kernelia<\/span>:<span class="pp">~<\/span>\$/);
  assert.match(html, /<span class="pu">hero@kernelia<\/span>:<span class="pp">~\/portal<\/span>\$/);
});

test('typed characters are escaped and revealed one by one', () => {
  const html = termHTML([{ type: 'a>b' }]);
  assert.equal((html.match(/class="k"/g) ?? []).length, 3);
  assert.match(html, /&gt;/);
});

test('output lines are escaped, and a failing line\'s output is shown as an error', () => {
  const html = termHTML([{ type: 'cat x', output: ['cat: x: <oops>'], fails: true }]);
  assert.match(html, /class="ln out err[^"]*"[^>]*>cat: x: &lt;oops&gt;</);
});
