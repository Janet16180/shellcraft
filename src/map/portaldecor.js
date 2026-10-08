/**
 * Decor for the link chapters' areas and the scribe's study: ~/portals, the
 * hall of portals (chapter 17), ~/maze, its boss maze of hedges and gates,
 * and ~/memory, the scribe's study (chapter 19). Still decor is painted once
 * into the room's background; ambient decor moves every frame.
 */

import { INK } from './palette.js';
import { box } from './paint.js';

const STONE = { dark: '#3a3654', mid: '#615b80', light: '#a3a0bf' };
const MAGIC = { deep: '#3b1d6e', mid: '#6d2f9c', light: '#c792ff', spark: '#f4f0e4' };
const HEDGE = { dark: '#16361f', mid: '#24522e', light: '#3b7a3f', top: '#5fa052' };
const WOOD = { dark: '#3a2414', mid: '#5a3a1e', light: '#7a5230', top: '#9a6a40' };
const PAPER = { page: '#f3e3bd', ink: '#8a6a44' };

function ring(ctx, cx, cy, rx, ry, colour, step = 1) {
  for (let a = 0; a < 360; a += step) {
    const r = (a * Math.PI) / 180;
    box(ctx, colour, Math.round(cx + Math.cos(r) * rx), Math.round(cy + Math.sin(r) * ry), 1, 1);
  }
}

function arch(ctx, x, y, w, h) {
  box(ctx, 'rgba(11, 10, 18, 0.35)', x - 2, y + h, w + 4, 4);
  box(ctx, INK.k, x - 1, y - 1, w + 2, h + 2);
  box(ctx, STONE.mid, x, y, w, h);
  for (let by = y + 2; by < y + h; by += 7) box(ctx, STONE.dark, x, by, w, 1);
  box(ctx, STONE.light, x, y, w, 2);
  box(ctx, INK.k, x + 5, y + 7, w - 10, h - 7);
  box(ctx, MAGIC.deep, x + 6, y + 8, w - 12, h - 8);
  box(ctx, MAGIC.light, x + w / 2 - 2, y + 2, 4, 3);
}

function swirl(ctx, x, y, w, h, t) {
  const cx = x + w / 2;
  const cy = y + 8 + (h - 8) / 2;
  const turn = Math.floor(t / 150) % 12;
  for (let i = 0; i < 3; i++) {
    const rx = (w - 14) / 2 - i * 4;
    const ry = (h - 12) / 2 - i * 6;
    for (let a = 0; a < 12; a++) {
      if ((a + turn + i * 4) % 3 !== 0) continue;
      const r = ((a * 30 + i * 15) * Math.PI) / 180;
      box(ctx, i === 2 ? MAGIC.spark : MAGIC.light, Math.round(cx + Math.cos(r) * rx), Math.round(cy + Math.sin(r) * ry), 2, 2);
    }
  }
  box(ctx, MAGIC.mid, cx - 2, cy - 2, 4, 4);
}

const GATES = [[8, 104, 38, 72], [274, 104, 38, 72]];

function crystal(ctx, x, top) {
  box(ctx, INK.k, x - 1, top - 1, 9, 22);
  box(ctx, STONE.dark, x, top + 12, 7, 8);
  box(ctx, MAGIC.mid, x + 1, top, 5, 12);
  box(ctx, MAGIC.light, x + 2, top + 1, 2, 9);
}

function portalHall(ctx, wall) {
  for (let y = wall + 6; y < 200; y += 12) box(ctx, 'rgba(199, 146, 255, 0.05)', 0, y, 320, 1);
  ring(ctx, 160, 146, 92, 22, 'rgba(199, 146, 255, 0.35)', 4);
  ring(ctx, 160, 146, 80, 18, 'rgba(199, 146, 255, 0.2)', 6);
  for (const [x, y, w, h] of GATES) arch(ctx, x, y, w, h);
  for (const x of [60, 100, 212, 252]) crystal(ctx, x, wall - 30);
}

function portalHallAmbient(ctx, t) {
  for (const [x, y, w, h] of GATES) swirl(ctx, x, y, w, h, t);
  for (let i = 0; i < 6; i++) {
    const phase = (t / 40 + i * 37) % 120;
    if (Math.sin(t / 300 + i) > 0.2) box(ctx, MAGIC.light, 70 + ((i * 41) % 180), 176 - Math.round(phase / 3), 1, 1);
  }
}

function hedge(ctx, x, y, w, h) {
  box(ctx, 'rgba(11, 10, 18, 0.35)', x, y + h, w, 3);
  box(ctx, INK.k, x - 1, y - 1, w + 2, h + 2);
  box(ctx, HEDGE.mid, x, y, w, h);
  box(ctx, HEDGE.top, x, y, w, 2);
  for (let ly = y + 3; ly < y + h - 1; ly += 3) {
    for (let lx = x + ((ly * 5) % 4); lx < x + w - 1; lx += 4) box(ctx, (lx + ly) % 3 ? HEDGE.light : HEDGE.dark, lx, ly, 2, 1);
  }
}

function leaves(ctx, wall) {
  for (let y = 2; y < wall - 3; y += 4) {
    for (let x = (y * 3) % 6; x < 320; x += 6) box(ctx, (x + y) % 4 ? HEDGE.light : HEDGE.top, x, y, 2, 2);
  }
}

function gravel(ctx, wall) {
  for (let i = 0; i < 90; i++) box(ctx, i % 3 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(11, 10, 18, 0.18)', (i * 53) % 320, wall + 6 + ((i * 29) % (194 - wall)), 2, 1);
}

function signpost(ctx, x, y) {
  box(ctx, WOOD.dark, x + 6, y + 6, 3, 22);
  box(ctx, INK.k, x - 1, y - 1, 18, 9);
  box(ctx, WOOD.light, x, y, 16, 7);
  box(ctx, MAGIC.light, x + 3, y + 3, 10, 1);
  box(ctx, WOOD.light, x + 14, y + 1, 3, 5);
}

function maze(ctx, wall) {
  leaves(ctx, wall);
  gravel(ctx, wall);
  hedge(ctx, 0, 112, 58, 10);
  hedge(ctx, 48, 122, 10, 34);
  hedge(ctx, 0, 160, 34, 10);
  hedge(ctx, 262, 112, 58, 10);
  hedge(ctx, 262, 122, 10, 34);
  hedge(ctx, 286, 160, 34, 10);
  hedge(ctx, 76, 176, 44, 10);
  hedge(ctx, 200, 176, 44, 10);
  signpost(ctx, 18, 132);
}

function fireflies(ctx, t) {
  for (let i = 0; i < 7; i++) {
    const x = 20 + ((i * 47 + Math.round(Math.sin(t / 700 + i) * 6)) % 280);
    const y = 120 + ((i * 23 + Math.round(Math.cos(t / 900 + i) * 4)) % 60);
    if (Math.sin(t / 250 + i * 2) > -0.2) box(ctx, i % 2 ? '#e8ffd0' : INK.y, x, y, 1, 1);
  }
}

function planks(ctx, wall) {
  for (let y = wall + 4; y < 200; y += 9) {
    box(ctx, 'rgba(0, 0, 0, 0.16)', 0, y, 320, 1);
    for (let x = (y * 7) % 48; x < 320; x += 48) box(ctx, 'rgba(0, 0, 0, 0.16)', x, y + 1, 1, 8);
  }
}

const SPINES = ['#e2434f', '#2c5aa8', '#3e7a3c', '#ffd348', '#6d2f9c', '#a24f34'];

function bookshelf(ctx, x, wall) {
  const top = 4;
  const bottom = wall - 2;
  box(ctx, INK.k, x - 1, top - 1, 58, bottom - top + 2);
  box(ctx, WOOD.mid, x, top, 56, bottom - top);
  for (let y = top + 2; y + 12 < bottom; y += 14) {
    box(ctx, WOOD.dark, x + 2, y, 52, 12);
    for (let bx = x + 3, i = 0; bx < x + 52; i++) {
      const w = 3 + ((bx + y) % 3);
      const h = 9 + ((bx * 7 + y) % 3);
      box(ctx, SPINES[(i + y) % SPINES.length], bx, y + 12 - h, w, h);
      box(ctx, 'rgba(255, 255, 255, 0.25)', bx, y + 12 - h + 2, w, 1);
      bx += w + 1;
    }
    box(ctx, WOOD.top, x, y + 12, 56, 2);
  }
}

function desk(ctx, x, y) {
  box(ctx, 'rgba(0, 0, 0, 0.25)', x, y + 26, 64, 4);
  for (const lx of [x + 3, x + 55]) box(ctx, WOOD.dark, lx, y + 8, 5, 20);
  box(ctx, INK.k, x - 1, y - 1, 66, 10);
  box(ctx, WOOD.light, x, y, 64, 8);
  box(ctx, WOOD.top, x, y, 64, 2);
  box(ctx, PAPER.page, x + 14, y - 3, 22, 4);
  box(ctx, WOOD.dark, x + 25, y - 3, 1, 4);
  for (const lx of [x + 16, x + 28]) box(ctx, PAPER.ink, lx, y - 2, 6, 1);
  box(ctx, INK.k, x + 42, y - 5, 6, 5);
  box(ctx, INK.u, x + 43, y - 4, 4, 3);
  box(ctx, INK.w, x + 46, y - 14, 1, 10);
  box(ctx, INK.l, x + 47, y - 15, 2, 4);
  box(ctx, INK.w, x + 6, y - 8, 3, 8);
}

function scrollChest(ctx, x, y) {
  box(ctx, 'rgba(0, 0, 0, 0.25)', x, y + 20, 40, 3);
  box(ctx, INK.k, x - 1, y - 1, 42, 22);
  box(ctx, WOOD.light, x, y, 40, 20);
  box(ctx, WOOD.dark, x, y + 6, 40, 1);
  for (const [sx, sy] of [[4, -6], [12, -8], [22, -5], [30, -7]]) {
    box(ctx, INK.k, x + sx - 1, y + sy - 1, 6, 10);
    box(ctx, PAPER.page, x + sx, y + sy, 4, 9);
    box(ctx, '#e0cfa2', x + sx, y + sy, 4, 1);
  }
}

function study(ctx, wall) {
  planks(ctx, wall);
  bookshelf(ctx, 16, wall);
  bookshelf(ctx, 248, wall);
  box(ctx, '#7a2533', 108, 150, 104, 30);
  box(ctx, '#c9a26b', 112, 154, 96, 1);
  box(ctx, '#c9a26b', 112, 175, 96, 1);
  desk(ctx, 10, 144);
  scrollChest(ctx, 266, 154);
}

function candle(ctx, t) {
  const flick = Math.floor(t / 220) % 2;
  for (const [r, alpha] of [[9, 0.08], [6, 0.12], [3, 0.16]]) {
    box(ctx, `rgba(255, 211, 72, ${alpha})`, 17 - r, 133 - r + 2, 2 * r + 1, 2 * r - 3);
    box(ctx, `rgba(255, 211, 72, ${alpha})`, 17 - r + 2, 133 - r, 2 * r - 3, 2 * r + 1);
  }
  box(ctx, flick ? INK.y : INK.o, 16, 132 + flick, 3, 3 - flick);
}

/** Still decor of these areas, by biome: (ctx, wall). */
export const PORTAL_DECOR = { portals: portalHall, maze, study };

/** Moving decor of these areas, by biome: (ctx, t, wall). */
export const PORTAL_AMBIENT = { portals: portalHallAmbient, maze: fireflies, study: candle };
