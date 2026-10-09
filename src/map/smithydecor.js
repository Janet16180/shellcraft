/**
 * Decor for chapter 20's area of the overworld: ~/workshop, a busy smithy
 * where long jobs run in the background. A hearth with working bellows on the
 * left, an anvil with a glowing bar and a quench barrel on the right, and a
 * bench at the front where finished work waits, timed by an hourglass. The
 * bottom-left corner stays clear for the player's job row (jobs.js).
 */

import { INK } from './palette.js';
import { box } from './paint.js';

const WOOD = { plank: '#4a3424', seam: '#2e2016', light: '#6b4a30', dark: '#3a281a' };
const LEATHER = { hide: '#9a5a32', fold: '#6e3c1c' };
const STONE = { flag: '#665850', seam: '#4e423c', soot: '#3e3530' };
const BRICK = { a: '#7a3a2a', b: '#8e4630', mortar: '#3a2018' };
const GLASS = 'rgba(207, 230, 255, 0.35)';
const HEARTH = { x: 2, w: 36, h: 44 };
const BELLOWS = { x: 42, y: 50, w: 24 };
const ANVIL = { x: 272, y: 150 };
const BARREL = { x: 244, y: 150 };
const BENCH = { x: 206, y: 182, w: 110 };
const HOURGLASS = { x: 296, y: 170 };

function pool(ctx, cx, cy, rx, ry, colour) {
  for (let r = -ry; r <= ry; r++) {
    const half = Math.round(rx * Math.sqrt(1 - (r * r) / (ry * ry)));
    box(ctx, colour, cx - half, cy + r, 2 * half, 1);
  }
}

function planks(ctx, wall) {
  box(ctx, WOOD.plank, 0, 0, 320, wall - 1);
  for (let x = 0; x < 320; x += 12) {
    box(ctx, WOOD.seam, x, 0, 1, wall - 1);
    box(ctx, WOOD.light, x + 1, 0, 1, wall - 1);
    for (let y = 6 + ((x * 7) % 11); y < wall - 4; y += 22) box(ctx, WOOD.seam, x + 5, y, 2, 1);
  }
  box(ctx, WOOD.dark, 0, 4, 320, 4);
  box(ctx, WOOD.light, 0, 4, 320, 1);
}

function tools(ctx) {
  for (const x of [56, 132, 206, 262]) {
    box(ctx, INK.k, x, 8, 1, 3);
    box(ctx, WOOD.light, x - 1, 11, 3, 10);
    box(ctx, INK.s, x - 4, 20, 9, 4);
    box(ctx, INK.l, x - 4, 20, 9, 1);
  }
  for (const x of [94, 236]) {
    box(ctx, INK.k, x + 3, 8, 1, 3);
    box(ctx, INK.s, x, 11, 2, 16);
    box(ctx, INK.s, x + 5, 11, 2, 16);
    box(ctx, INK.l, x + 1, 11, 5, 2);
  }
}

function flagstones(ctx, wall) {
  for (let y = wall + 6; y < 200; y += 12) {
    const shift = ((y - wall) / 12) % 2 ? 14 : 0;
    box(ctx, STONE.seam, 0, y, 320, 1);
    for (let x = shift; x < 320; x += 28) box(ctx, STONE.seam, x, y, 1, 12);
  }
  for (let i = 0; i < 18; i++) box(ctx, STONE.soot, 40 + ((i * 47) % 260), wall + 10 + ((i * 31) % 110), 2 + (i % 3), 1);
}

function hearth(ctx, wall) {
  const { x, w, h } = HEARTH;
  const top = wall + 8;
  box(ctx, INK.k, x + 6, 0, w - 12, top);
  box(ctx, BRICK.mortar, x + 7, 0, w - 14, top);
  for (let y = 2; y < top; y += 5) box(ctx, BRICK.a, x + 8, y, w - 16, 3);
  box(ctx, INK.k, x - 1, top - 1, w + 2, h + 2);
  box(ctx, BRICK.mortar, x, top, w, h);
  for (let y = top; y < top + h; y += 6) {
    for (let bx = (y / 6) % 2 ? x - 4 : x; bx < x + w; bx += 9) box(ctx, (bx + y) % 3 ? BRICK.a : BRICK.b, Math.max(x, bx), y + 1, Math.min(8, x + w - Math.max(x, bx)), 4);
  }
  box(ctx, INK.k, x + 6, top + 16, w - 12, 22);
  box(ctx, INK.k, x + 8, top + 13, w - 16, 3);
  box(ctx, INK.s, x - 2, top - 3, w + 4, 3);
}

function bellows(ctx, wall) {
  const cy = wall + BELLOWS.y;
  box(ctx, INK.k, HEARTH.x + HEARTH.w - 1, cy - 2, 6, 4);
  box(ctx, INK.s, HEARTH.x + HEARTH.w - 1, cy - 1, 6, 2);
  box(ctx, 'rgba(0, 0, 0, 0.25)', BELLOWS.x + 2, cy + 12, 26, 2);
}

function anvil(ctx) {
  const { x, y } = ANVIL;
  box(ctx, 'rgba(0, 0, 0, 0.25)', x - 2, y + 26, 34, 3);
  box(ctx, INK.k, x + 6, y + 11, 18, 16);
  box(ctx, WOOD.plank, x + 7, y + 12, 16, 15);
  box(ctx, WOOD.light, x + 7, y + 12, 16, 2);
  for (const sx of [10, 15, 19]) box(ctx, WOOD.dark, x + sx, y + 16, 1, 9);
  box(ctx, INK.k, x - 1, y - 1, 32, 7);
  box(ctx, INK.k, x + 9, y + 5, 12, 8);
  box(ctx, INK.s, x, y, 30, 5);
  box(ctx, INK.l, x, y, 30, 1);
  box(ctx, INK.s, x + 10, y + 5, 10, 7);
  box(ctx, INK.k, x - 6, y + 1, 6, 2);
  box(ctx, INK.s, x - 5, y + 1, 5, 1);
}

function barrel(ctx) {
  const { x, y } = BARREL;
  box(ctx, 'rgba(0, 0, 0, 0.25)', x - 1, y + 20, 20, 3);
  box(ctx, INK.k, x - 1, y - 1, 20, 22);
  box(ctx, WOOD.plank, x, y, 18, 20);
  for (const bx of [4, 9, 14]) box(ctx, WOOD.seam, x + bx, y + 2, 1, 18);
  box(ctx, INK.s, x, y + 4, 18, 2);
  box(ctx, INK.s, x, y + 15, 18, 2);
  box(ctx, '#1f4a6e', x + 1, y, 16, 2);
  box(ctx, '#2f6fa8', x + 3, y, 12, 1);
}

function bench(ctx) {
  const { x, y, w } = BENCH;
  box(ctx, 'rgba(0, 0, 0, 0.25)', x, y + 14, w, 3);
  for (const lx of [x + 4, x + w - 10]) box(ctx, WOOD.seam, lx, y + 4, 4, 12);
  box(ctx, INK.k, x - 1, y - 1, w + 2, 6);
  box(ctx, WOOD.light, x, y, w, 4);
  box(ctx, WOOD.plank, x, y + 3, w, 1);
  box(ctx, INK.k, x + 6, y - 9, 16, 9);
  box(ctx, '#c9a26b', x + 7, y - 8, 14, 7);
  box(ctx, WOOD.seam, x + 13, y - 8, 2, 7);
  box(ctx, WOOD.seam, x + 7, y - 5, 14, 1);
  for (const [hx, hy] of [[0, 0], [1, -2], [3, -3], [5, -3], [7, -2], [8, 0]]) box(ctx, INK.s, x + 28 + hx, y - 3 + hy, 2, 2);
  box(ctx, INK.k, x + 44, y - 4, 30, 4);
  box(ctx, INK.l, x + 45, y - 3, 21, 2);
  box(ctx, WOOD.light, x + 66, y - 3, 7, 2);
  const { x: gx, y: gy } = HOURGLASS;
  box(ctx, '#c9a26b', gx - 1, gy, 11, 2);
  box(ctx, '#c9a26b', gx - 1, gy + 10, 11, 2);
  box(ctx, GLASS, gx, gy + 2, 9, 8);
}

function smithy(ctx, wall) {
  planks(ctx, wall);
  tools(ctx);
  flagstones(ctx, wall);
  hearth(ctx, wall);
  bellows(ctx, wall);
  barrel(ctx);
  anvil(ctx);
  bench(ctx);
}

function fire(ctx, t, wall) {
  const top = wall + 8;
  const { x, w, h } = HEARTH;
  const puff = bellowsPuff(t);
  const flicker = Math.floor(t / 140) % 3;
  box(ctx, INK.r, x + 7, top + 26, w - 14, 12);
  box(ctx, INK.o, x + 9, top + 30 - puff + flicker, w - 18, 8 + puff - flicker);
  box(ctx, INK.y, x + 13, top + 34 - puff, w - 26, 4 + puff);
  ctx.globalAlpha = 0.1 + 0.04 * puff;
  pool(ctx, x + w / 2, top + h + 6, w / 2 + 10, 7, INK.o);
  pool(ctx, x + w / 2, top + h + 4, w / 4 + 4, 3, INK.y);
  ctx.globalAlpha = 1;
}

// 0 (bellows open) to 3 (pressed shut), and back, every 1.2 s.
function bellowsPuff(t) {
  const p = (t / 1200) % 1;
  return Math.round(3 * (p < 0.5 ? p * 2 : 2 - p * 2));
}

// A wedge of leather between two boards, pointing its nozzle into the hearth; pressed, it flattens.
function pump(ctx, t, wall) {
  const cy = wall + BELLOWS.y;
  const { x, w } = BELLOWS;
  const open = 3 + (3 - bellowsPuff(t));
  for (let c = 0; c < w; c++) {
    const half = 1 + Math.round((open * c) / w);
    box(ctx, INK.k, x + c, cy - half - 2, 1, 2 * half + 4);
    box(ctx, c % 4 ? LEATHER.hide : LEATHER.fold, x + c, cy - half, 1, 2 * half);
    box(ctx, WOOD.light, x + c, cy - half - 1, 1, 1);
    box(ctx, WOOD.dark, x + c, cy + half, 1, 1);
  }
  const back = 1 + open;
  box(ctx, WOOD.light, x + w, cy - back - 4, 2, 4);
  box(ctx, WOOD.dark, x + w, cy + back, 2, 4);
}

function glowingBar(ctx, t) {
  const { x, y } = ANVIL;
  const heat = 0.5 + 0.5 * Math.sin(t / 400);
  box(ctx, INK.e, x + 6, y - 2, 14, 2);
  ctx.globalAlpha = heat;
  box(ctx, INK.o, x + 7, y - 2, 11, 2);
  box(ctx, INK.y, x + 9, y - 2, 6, 1);
  ctx.globalAlpha = 1;
  const p = (t / 900) % 1;
  if (p < 0.5) {
    for (let i = 0; i < 4; i++) box(ctx, i % 2 ? INK.y : INK.o, x + 12 + Math.round((i - 1.5) * p * 16), y - 4 - Math.round(p * 18) + i * 2, 1, 1);
  }
}

function steam(ctx, t) {
  const { x, y } = BARREL;
  for (let i = 0; i < 3; i++) {
    const p = ((t / 1800) + i / 3) % 1;
    ctx.globalAlpha = 0.45 * (1 - p);
    box(ctx, INK.w, x + 4 + i * 4 + Math.round(Math.sin(t / 300 + i) * 2), y - 3 - Math.round(p * 16), 2, 2);
  }
  ctx.globalAlpha = 1;
}

// The hourglass runs out over 6 seconds and starts again.
function sand(ctx, t) {
  const { x, y } = HOURGLASS;
  const p = (t / 6000) % 1;
  const upper = Math.round(3 * (1 - p));
  const lower = Math.round(3 * p);
  box(ctx, '#ffd36b', x + 2, y + 6 - upper, 5, upper);
  box(ctx, '#ffd36b', x + 2, y + 10 - lower, 5, lower);
  if (Math.floor(t / 120) % 2) box(ctx, '#ffd36b', x + 4, y + 6, 1, 4 - lower);
}

/** Still decor of chapter 20's area, by biome. */
export const SMITHY_DECOR = { smithy };

/** Moving decor of chapter 20's area, by biome: (ctx, t, wall). */
export const SMITHY_AMBIENT = {
  smithy: (ctx, t, wall) => {
    fire(ctx, t, wall);
    pump(ctx, t, wall);
    glowingBar(ctx, t);
    steam(ctx, t);
    sand(ctx, t);
  },
};
