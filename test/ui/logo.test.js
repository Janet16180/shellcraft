import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, logoSVG } from '../../src/ui/logo.js';

test('every glyph is 5 pixels wide and 7 tall', () => {
  for (const [letter, rows] of Object.entries(GLYPHS)) {
    assert.equal(rows.length, 7, letter);
    for (const row of rows) assert.match(row, /^[#.]{5}$/, letter);
  }
});

test('the C is open on the right, so it cannot be read as an O', () => {
  const right = GLYPHS.C.map(row => row[4]);
  assert.deepEqual(right.slice(1, 6), ['.', '.', '.', '.', '.']);
});

test('the logo is one pixel grid: 6 pixels per letter, plus 2 for the shadow', () => {
  const svg = logoSVG('SHELLCRAFT');
  assert.match(svg, /viewBox="0 0 61 9"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
});

test('the logo carries its word for screen readers', () => {
  assert.match(logoSVG('SHELLCRAFT'), /role="img" aria-label="Shellcraft"/);
});

test('the letters, their shadow and their shading each get one path', () => {
  assert.equal((logoSVG('SHELLCRAFT').match(/<path /g) ?? []).length, 4);
});

test('a letter without a glyph is a bug and raises', () => {
  assert.throws(() => logoSVG('SHELLCRAFT!'), /glyph/);
});
