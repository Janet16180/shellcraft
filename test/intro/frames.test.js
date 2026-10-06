import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linesBefore, anatomyHTML, partsHTML, keysHTML, nextLabel } from '../../src/intro/frames.js';
import { PROMPT_PIECES, STEPS } from '../../src/intro/steps.js';
import { PLAYER } from '../../src/backend/player.js';

test('the lines replayed before a step are the typed lines of the steps before it, in order', () => {
  const steps = [{ id: 'a' }, { id: 'b', type: 'ls' }, { id: 'c', type: 'cd x' }, { id: 'd', type: 'pwd' }];
  assert.deepEqual(linesBefore(steps, 3), ['ls', 'cd x']);
  assert.deepEqual(linesBefore(steps, 0), []);
});

test('the prompt anatomy lights the piece in focus and labels the pieces explained so far', () => {
  const html = anatomyHTML(PROMPT_PIECES, 'host');
  assert.match(html, new RegExp(`<span class="piece on role-host"><span class="txt">${PLAYER.host}</span><span class="lbl">machine</span></span>`));
  assert.match(html, new RegExp(`<span class="piece role-user"><span class="txt">${PLAYER.user}</span><span class="lbl">user</span></span>`));
  assert.match(html, /<span class="piece role-cwd"><span class="txt">~<\/span><span class="lbl"><\/span><\/span>/);
});

test('a split line shows each word over its role', () => {
  const html = partsHTML([['ls', 'command'], ['-l', 'option']]);
  assert.equal(html, '<span class="part role-command"><code>ls</code><span class="lbl">command</span></span><span class="part role-option"><code>-l</code><span class="lbl">option</span></span>');
});

test('keys are listed with their meaning, the meaning kept as trusted HTML', () => {
  assert.equal(keysHTML([['Tab', 'completes <code>fo</code>']]), '<dl class="keys-list"><dt><kbd>Tab</kbd></dt><dd>completes <code>fo</code></dd></dl>');
});

test('commands in the key list are shown as code, keys as keyboard keys', () => {
  assert.match(keysHTML([['man', 'manual']]), /<dt><code>man<\/code><\/dt>/);
});

test('the last step hands over to the real terminal', () => {
  assert.equal(nextLabel(STEPS, STEPS.length - 1), 'Start playing');
  assert.equal(nextLabel(STEPS, 0), 'Next');
});
