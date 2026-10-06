import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, span } from '../../src/shell/html.js';

test('esc escapes markup characters', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('span wraps escaped text in a class', () => {
  assert.equal(span('c-dir', 'a&b'), '<span class="c-dir">a&amp;b</span>');
});
