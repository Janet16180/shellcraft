import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERMINAL_KEYS, keymapHTML } from '../../src/ui/keymap.js';

test('the key list names every key the terminal answers, including the history search', () => {
  const keys = TERMINAL_KEYS.map(([key]) => key);
  for (const key of ['Enter', 'Tab', 'Up', 'Down', 'Ctrl+R', 'Ctrl+G', 'Ctrl+C', 'Ctrl+L', 'Ctrl+A', 'Ctrl+E', 'Esc']) assert.ok(keys.includes(key), key);
});

test('every meaning is one short plain sentence', () => {
  for (const [key, what] of TERMINAL_KEYS) {
    assert.match(what, /^[A-Z].*\.$/, key);
    assert.ok(what.length <= 140, key);
  }
});

test('the list renders as a description list with each key in kbd', () => {
  const html = keymapHTML();
  assert.match(html, /^<dl class="keymap">/);
  assert.match(html, /<dt><kbd>Ctrl\+R<\/kbd><\/dt><dd>/);
  assert.equal(html.match(/<dt>/g).length, TERMINAL_KEYS.length);
});
