import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREATURE_SPRITES, CREATURE_BURST } from '../../src/map/creatureart.js';
import { PALETTES } from '../../src/map/palette.js';

test('every creature sprite is a rectangle of its palette letters', () => {
  for (const [name, { pal, rows }] of Object.entries(CREATURE_SPRITES)) {
    for (const row of rows) assert.equal(row.length, rows[0].length, name);
    for (const ch of rows.join('')) assert.ok(ch === '.' || ch in PALETTES[pal], `${name} uses ${ch}`);
  }
});

test('every kind of creature has burst colours', () => {
  for (const kind of ['daemon', 'armoured', 'imp']) assert.ok(CREATURE_BURST[kind].length > 0, kind);
});
