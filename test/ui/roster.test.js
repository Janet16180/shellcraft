import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER, picksHTML } from '../../src/ui/roster.js';
import { KEY_KINDS } from '../../src/map/map.js';

test('every picture in the map key is one the map can draw', () => {
  for (const { kind } of ROSTER) assert.ok(KEY_KINDS.includes(kind), kind);
});

test('every map key entry has a name and a plain explanation', () => {
  for (const { kind, name, what } of ROSTER) {
    assert.ok(name, kind);
    assert.ok(what.endsWith('.'), kind);
  }
});

test('the room picks list doors with a slash, then items, then the way back', () => {
  const html = picksHTML([
    { kind: 'door', name: 'forest', path: '/home/hero/forest', locked: false },
    { kind: 'item', name: 'readme.txt', path: '/home/hero/readme.txt', locked: false },
    { kind: 'exit', name: '..', path: '/home', locked: false },
  ]);
  assert.match(html, /data-pick="0"[^>]*>forest\/<\/button>.*data-pick="1"[^>]*>readme\.txt<\/button>.*data-pick="2"[^>]*>\.\.<\/button>/s);
});

test('a locked pick says so to screen readers', () => {
  const html = picksHTML([{ kind: 'door', name: 'root', path: '/root', locked: true }]);
  assert.match(html, /aria-label="root\/, padlocked"/);
});

test('names in picks are escaped', () => {
  assert.match(picksHTML([{ kind: 'item', name: '<b>.txt', path: '/x', locked: false }]), /&lt;b&gt;\.txt/);
});

test('an empty room has no picks', () => {
  assert.equal(picksHTML([]), '');
});
