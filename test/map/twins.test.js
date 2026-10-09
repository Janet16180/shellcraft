import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twinRune, RUNE_COLOURS, RUNE_GLYPHS } from '../../src/map/twins.js';

test('two names with the same inode get the same rune', () => {
  assert.deepEqual(twinRune(1847), twinRune(1847));
});

test('neighbouring inode numbers get different runes, so two pairs in one room tell apart', () => {
  const marks = [1847, 1848, 1849, 1850].map(ino => JSON.stringify(twinRune(ino)));
  assert.equal(new Set(marks).size, marks.length);
});

test('a rune is a colour of the set and a glyph of rows of 0 and 1, all the same width', () => {
  for (const ino of [0, 1, 99, 123456]) {
    const { colour, glyph } = twinRune(ino);
    assert.ok(RUNE_COLOURS.includes(colour));
    assert.ok(RUNE_GLYPHS.includes(glyph));
  }
  for (const glyph of RUNE_GLYPHS) {
    assert.ok(glyph.every(row => /^[01]+$/.test(row) && row.length === glyph[0].length));
  }
});

test('an inode that is not a whole number at or above 0 is a bug and raises', () => {
  for (const bad of [-1, 1.5, null, '12']) assert.throws(() => twinRune(bad), /inode/);
});
