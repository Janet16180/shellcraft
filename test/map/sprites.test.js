import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES } from '../../src/map/sprites.js';
import { PALETTES } from '../../src/map/palette.js';

const all = Object.entries(SPRITES).flatMap(([name, s]) => (Array.isArray(s) ? s.map((f, i) => [`${name}[${i}]`, f]) : [[name, s]]));

test('every sprite is a rectangle', () => {
  for (const [name, { rows }] of all) {
    assert.ok(rows.length > 0, name);
    for (const row of rows) assert.equal(row.length, rows[0].length, name);
  }
});

test('every sprite letter is a colour of its palette', () => {
  for (const [name, { pal, rows }] of all) {
    const colours = PALETTES[pal];
    assert.ok(colours, `${name} names an unknown palette`);
    for (const ch of rows.join('')) assert.ok(ch === '.' || ch in colours, `${name} uses ${ch}`);
  }
});

test('the frames of an animation share one size', () => {
  for (const frames of Object.values(SPRITES).filter(Array.isArray)) {
    const size = f => `${f.rows[0].length}x${f.rows.length}`;
    assert.ok(frames.every(f => size(f) === size(frames[0])));
  }
});
