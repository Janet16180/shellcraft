/**
 * Decor for chapter 18's area of the overworld: ~/crown, the steward's
 * throne room. A tapestry with the crown over an empty throne at the head of
 * a red carpet, banners of the two factions, the crown on a cushion and a
 * sword stand, with candles that flicker.
 */

import { INK } from './palette.js';
import { box } from './paint.js';

const GOLD = { light: '#ffe9a8', mid: '#ffd36b', dark: '#c9a26b', deep: '#8a6a44' };
const ROYAL = { cloth: '#5a2a8a', fold: '#45206b', velvet: '#b8303c', deep: '#7a2533' };
const MARBLE = { line: 'rgba(11, 10, 18, 0.18)', shine: 'rgba(255, 255, 255, 0.06)' };
const CANDLES = [[128, 46], [188, 46]];

function marble(ctx, wall) {
  for (let y = wall + 4; y < 200; y += 14) {
    for (let x = ((y - wall) / 14) % 2 ? 0 : 14; x < 320; x += 28) box(ctx, MARBLE.shine, x, y, 14, 14);
    box(ctx, MARBLE.line, 0, y, 320, 1);
  }
}

function crownMark(ctx, x, y, colour) {
  box(ctx, colour, x, y + 4, 12, 4);
  for (const px of [0, 5, 10]) box(ctx, colour, x + px, y, 2, 4);
  box(ctx, INK.e, x + 5, y + 5, 2, 2);
}

function tapestry(ctx, wall) {
  const top = 4;
  const h = wall - 8;
  box(ctx, GOLD.dark, 132, top - 2, 56, 3);
  box(ctx, INK.k, 135, top + 1, 50, h);
  box(ctx, ROYAL.cloth, 136, top + 1, 48, h - 1);
  for (let fx = 140; fx < 184; fx += 8) box(ctx, ROYAL.fold, fx, top + 1, 2, h - 1);
  box(ctx, GOLD.mid, 136, top + h - 4, 48, 2);
  for (let fx = 137; fx < 184; fx += 4) box(ctx, GOLD.mid, fx, top + h - 2, 2, 3);
  crownMark(ctx, 154, top + 8, GOLD.mid);
}

function throne(ctx, wall) {
  const x = 144;
  const y = wall - 24;
  box(ctx, 'rgba(11, 10, 18, 0.35)', x - 6, y + 40, 44, 4);
  box(ctx, INK.k, x - 6, y + 34, 44, 8);
  box(ctx, GOLD.deep, x - 5, y + 35, 42, 6);
  box(ctx, GOLD.dark, x - 5, y + 35, 42, 1);
  box(ctx, INK.k, x - 1, y - 1, 34, 37);
  box(ctx, GOLD.mid, x, y, 32, 35);
  box(ctx, GOLD.light, x, y, 32, 2);
  box(ctx, ROYAL.velvet, x + 5, y + 4, 22, 18);
  box(ctx, ROYAL.deep, x + 5, y + 18, 22, 4);
  box(ctx, ROYAL.velvet, x + 3, y + 24, 26, 6);
  box(ctx, GOLD.dark, x + 2, y + 30, 28, 2);
  for (const px of [x - 3, x + 31]) {
    box(ctx, INK.k, px - 1, y + 14, 6, 21);
    box(ctx, GOLD.mid, px, y + 15, 4, 19);
  }
  for (const px of [x + 1, x + 14, x + 27]) {
    box(ctx, INK.k, px - 1, y - 6, 6, 6);
    box(ctx, GOLD.mid, px, y - 5, 4, 5);
  }
  box(ctx, INK.e, x + 15, y - 3, 2, 2);
}

function carpet(ctx, wall) {
  const top = wall + 16;
  box(ctx, GOLD.dark, 142, top, 36, 200 - top);
  box(ctx, ROYAL.velvet, 144, top, 32, 200 - top);
  for (let y = top + 6; y < 200; y += 12) box(ctx, ROYAL.deep, 158, y, 4, 4);
}

function banner(ctx, x, wall, colour) {
  const top = 6;
  const h = wall - 16;
  box(ctx, GOLD.dark, x - 2, top - 2, 20, 2);
  box(ctx, INK.k, x - 1, top, 18, h + 1);
  box(ctx, colour, x, top, 16, h);
  for (let i = 0; i < 8; i++) box(ctx, colour, x + (i < 4 ? i : 15 - i), top + h, 1, 4 - (i < 4 ? i : 7 - i));
  box(ctx, GOLD.mid, x + 1, top + 2, 14, 1);
  crownMark(ctx, x + 2, top + 10, GOLD.light);
}

function candelabrum(ctx, x, y) {
  box(ctx, GOLD.deep, x + 2, y + 4, 2, 18);
  box(ctx, GOLD.dark, x - 2, y + 20, 10, 2);
  box(ctx, GOLD.dark, x - 3, y + 4, 12, 2);
  for (const cx of [x - 3, x + 2, x + 7]) box(ctx, INK.w, cx, y - 2, 2, 6);
}

function cushion(ctx, x, y) {
  box(ctx, 'rgba(11, 10, 18, 0.35)', x - 2, y + 40, 34, 4);
  box(ctx, INK.k, x + 7, y + 16, 16, 26);
  box(ctx, INK.l, x + 8, y + 17, 14, 24);
  box(ctx, INK.w, x + 8, y + 17, 3, 24);
  box(ctx, INK.k, x + 3, y + 14, 24, 4);
  box(ctx, INK.k, x - 1, y + 5, 32, 10);
  box(ctx, ROYAL.cloth, x, y + 6, 30, 8);
  box(ctx, ROYAL.fold, x, y + 11, 30, 3);
  for (const tx of [x - 1, x + 29]) box(ctx, GOLD.mid, tx, y + 13, 2, 4);
  crownMark(ctx, x + 9, y - 2, GOLD.mid);
}

function swordStand(ctx, x, y) {
  box(ctx, 'rgba(11, 10, 18, 0.35)', x - 4, y + 44, 30, 4);
  box(ctx, INK.k, x - 3, y + 38, 28, 8);
  box(ctx, '#5a3a1e', x - 2, y + 39, 26, 6);
  box(ctx, INK.k, x + 9, y + 2, 4, 37);
  box(ctx, INK.w, x + 10, y + 2, 2, 36);
  box(ctx, INK.l, x + 11, y + 2, 1, 36);
  box(ctx, INK.k, x + 3, y - 2, 16, 4);
  box(ctx, GOLD.mid, x + 4, y - 1, 14, 2);
  box(ctx, INK.r, x + 10, y - 9, 2, 7);
  box(ctx, GOLD.mid, x + 9, y - 11, 4, 3);
}

function throneRoom(ctx, wall) {
  marble(ctx, wall);
  carpet(ctx, wall);
  banner(ctx, 22, wall, '#e2434f');
  banner(ctx, 282, wall, '#7b5cff');
  tapestry(ctx, wall);
  throne(ctx, wall);
  for (const [x, y] of CANDLES) candelabrum(ctx, x, y);
  cushion(ctx, 16, 128);
  swordStand(ctx, 284, 128);
}

function flames(ctx, t) {
  CANDLES.forEach(([x, y], i) => {
    for (const [j, cx] of [x - 3, x + 2, x + 7].entries()) {
      const flick = (Math.floor(t / 230) + i + j) % 2;
      box(ctx, flick ? INK.y : INK.o, cx, y - 5 + flick, 2, 3 - flick);
    }
  });
}

function sparkle(ctx, t) {
  if (Math.sin(t / 420) < 0.75) return;
  box(ctx, INK.w, 30, 120, 1, 5);
  box(ctx, INK.w, 28, 122, 5, 1);
}

/** Still decor of the throne room, by biome: (ctx, wall). */
export const THRONE_DECOR = { throne: throneRoom };

/** Moving decor of the throne room, by biome: (ctx, t, wall). */
export const THRONE_AMBIENT = {
  throne: (ctx, t) => {
    flames(ctx, t);
    sparkle(ctx, t);
  },
};
