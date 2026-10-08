/**
 * Decor for the act II areas of the overworld: the Hall of Mirrors, the
 * Wishing Well, the Imp Den, the Forge and its Ore Pile. Still decor is painted
 * once into the room's background; ambient decor moves every frame.
 */

import { INK } from './palette.js';
import { SPRITES } from './sprites.js';
import { box, drawSprite } from './paint.js';

function pool(ctx, cx, cy, rx, ry, colour) {
  for (let r = -ry; r <= ry; r++) {
    const half = Math.round(rx * Math.sqrt(1 - (r * r) / (ry * ry)));
    box(ctx, colour, cx - half, cy + r, 2 * half, 1);
  }
}

const GLASS = { frame: '#8a93a8', rim: '#dfe6f2', glass: '#8fb4dc', deep: '#6d93c0' };

function mirror(ctx, x, top, bottom) {
  const h = bottom - top;
  box(ctx, INK.k, x - 1, top - 1, 18, h + 2);
  box(ctx, GLASS.frame, x, top, 16, h);
  box(ctx, GLASS.rim, x, top, 16, 1);
  box(ctx, GLASS.deep, x + 2, top + 2, 12, h - 4);
  box(ctx, GLASS.glass, x + 2, top + 2, 12, Math.round((h - 4) * 0.55));
  for (let i = 0; i < 8; i++) box(ctx, 'rgba(255, 255, 255, 0.55)', x + 3 + i, top + 20 - i * 2, 1, 2);
  for (let i = 0; i < 5; i++) box(ctx, 'rgba(255, 255, 255, 0.35)', x + 4 + i, top + 46 - i * 2, 1, 2);
}

function mirrors(ctx, wall) {
  for (let y = wall + 4; y < 200; y += 16) {
    for (let x = (y / 16) % 2 ? 0 : 16; x < 320; x += 32) box(ctx, 'rgba(207, 230, 255, 0.07)', x, y, 16, 16);
  }
  mirror(ctx, 2, wall + 8, 172);
  mirror(ctx, 302, wall + 8, 172);
  for (const [x, y] of [[44, 184], [252, 190], [96, 194]]) {
    box(ctx, GLASS.rim, x, y, 3, 1);
    box(ctx, GLASS.glass, x + 1, y + 1, 2, 1);
  }
}

function shine(ctx, t, wall) {
  const y = wall + 10 + (Math.floor(t / 60) % 160);
  if (y > 168) return;
  for (const x of [4, 304]) box(ctx, 'rgba(255, 255, 255, 0.45)', x, y, 12, 2);
}

function pine(ctx, x, y) {
  box(ctx, '#5a3a1e', x + 6, y + 18, 4, 8);
  for (let r = 0; r < 18; r++) box(ctx, r % 6 < 3 ? '#2f6b2a' : '#3b8034', x + 8 - Math.round(r / 2.4), y + r, Math.max(2, Math.round(r / 1.2)), 1);
}

const WELL = { x: 262, y: 136, w: 44 };

function stones(ctx, x, y, w, rows) {
  box(ctx, INK.k, x - 1, y - 1, w + 2, rows * 5 + 2);
  for (let r = 0; r < rows; r++) {
    for (let sx = r % 2 ? -3 : 0; sx < w; sx += 7) {
      const left = Math.max(x, x + sx);
      box(ctx, (sx + r) % 3 ? '#7d828c' : '#959aa4', left, y + r * 5, Math.min(6, x + w - left), 4);
    }
  }
}

function well(ctx, wall) {
  const { x, y, w } = WELL;
  [[0, wall + 8], [4, 132]].forEach(([px, py]) => pine(ctx, px, py));
  box(ctx, 'rgba(0, 0, 0, 0.25)', x - 2, y + 22, w + 6, 4);
  box(ctx, '#5a3a1e', x + 3, y - 30, 3, 32);
  box(ctx, '#5a3a1e', x + w - 6, y - 30, 3, 32);
  box(ctx, '#3a2414', x + 3, y - 24, w - 6, 2);
  for (let r = 0; r < 7; r++) box(ctx, r % 2 ? '#8a3a2a' : '#a24f34', x - 3 + r, y - 38 + r, w + 6 - 2 * r, 1);
  box(ctx, '#c9a26b', x + w / 2, y - 22, 1, 10);
  box(ctx, '#7a5230', x + w / 2 - 3, y - 12, 7, 6);
  box(ctx, '#3a2414', x + w / 2 - 3, y - 10, 7, 1);
  stones(ctx, x, y, w, 4);
  box(ctx, '#1f4a6e', x + 3, y + 1, w - 6, 3);
  box(ctx, '#2f6fa8', x + 5, y + 2, w - 10, 1);
  for (const [sx, sy] of [[40, 186], [76, 176], [214, 188], [240, 172], [120, 196]]) {
    box(ctx, '#6b6f78', sx, sy, 5, 3);
    box(ctx, '#959aa4', sx + 1, sy, 3, 1);
  }
  for (const [gx, gy] of [[60, 160], [100, 190], [200, 176], [236, 194], [30, 194]]) {
    box(ctx, '#3e6b2a', gx, gy, 1, 3);
    box(ctx, '#3e6b2a', gx + 2, gy - 1, 1, 4);
    box(ctx, '#3e6b2a', gx + 4, gy, 1, 3);
  }
}

function ripple(ctx, t) {
  const { x, y, w } = WELL;
  const p = (t / 1400) % 1;
  const width = Math.round(4 + p * (w - 12));
  ctx.globalAlpha = 1 - p;
  box(ctx, '#9fd3f5', x + w / 2 - Math.floor(width / 2), y + 2, width, 1);
  ctx.globalAlpha = 1;
}

const DEN_CRACKS = [[30, 16], [96, 30], [214, 12], [286, 34], [150, 6]];

function den(ctx, wall) {
  for (let x = 2; x < 320; x += 14) {
    const h = 4 + ((x * 11) % 10);
    box(ctx, '#170a07', x, 0, 5, h);
    box(ctx, '#170a07', x + 1, h, 3, 3);
    box(ctx, '#170a07', x + 2, h + 3, 1, 2);
  }
  for (const [x, y] of DEN_CRACKS) box(ctx, '#0b0504', x - 3, y - 2, 9, 5);
  for (let y = wall + 6; y < 200; y += 7) {
    for (let x = (y * 3) % 23; x < 320; x += 29) box(ctx, '#3e2218', x, y, 4, 1);
  }
  nest(ctx, 40, 172);
  drawSprite(ctx, SPRITES.bones, 230, 186, { scale: 2 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const sx = Math.round(FIRE_PIT.x + Math.cos(a) * 14);
    const sy = Math.round(FIRE_PIT.y + 12 + Math.sin(a) * 5);
    box(ctx, INK.k, sx - 1, sy - 1, 8, 6);
    box(ctx, INK.s, sx, sy, 6, 4);
    box(ctx, INK.l, sx + 1, sy, 3, 1);
  }
}

const FIRE_PIT = { x: 280, y: 156 };

function nest(ctx, cx, cy) {
  pool(ctx, cx, cy, 30, 9, '#8a6a2a');
  pool(ctx, cx, cy, 22, 5, '#5e3e18');
  for (let i = 0; i < 26; i++) box(ctx, i % 3 ? '#c9a24a' : '#8a6a2a', cx - 28 + ((i * 11) % 54), cy - 8 + ((i * 5) % 16), 5, 1);
}

function embers(ctx, t) {
  DEN_CRACKS.forEach(([x, y], i) => {
    if (Math.sin(t / 900 + i * 1.7) < -0.6) return;
    box(ctx, i % 2 ? INK.y : INK.e, x - 2, y, 1, 1);
    box(ctx, i % 2 ? INK.y : INK.e, x + 2, y, 1, 1);
  });
  const { x, y } = FIRE_PIT;
  pool(ctx, x + 3, y + 13, 28, 9, `rgba(255, 122, 61, ${0.12 + 0.05 * Math.sin(t / 180)})`);
  box(ctx, '#5a3a1e', x - 6, y + 12, 18, 3);
  drawSprite(ctx, SPRITES.fire[Math.floor(t / 180) % 2], x - 5, y - 2, { scale: 2 });
}

const FURNACE = { x: 270, w: 44 };

function forge(ctx, wall) {
  const { x, w } = FURNACE;
  const top = wall - 30;
  box(ctx, INK.k, x + 14, 0, 16, top);
  box(ctx, INK.d, x + 15, 0, 14, top);
  box(ctx, INK.k, x - 1, top - 1, w + 2, 140 - top);
  for (let y = top; y < 138; y += 6) {
    for (let bx = (y / 6) % 2 ? x - 4 : x; bx < x + w; bx += 9) box(ctx, (bx + y) % 3 ? INK.s : INK.d, Math.max(x, bx), y, Math.min(8, x + w - Math.max(x, bx)), 5);
  }
  box(ctx, INK.k, x + 8, 92, w - 16, 34);
  box(ctx, INK.k, x + 10, 88, w - 20, 4);
  drawSprite(ctx, SPRITES.anvil, 14, 160, { scale: 2 });
  box(ctx, '#7a5230', 48, 166, 12, 2);
  box(ctx, INK.s, 58, 162, 5, 8);
  box(ctx, INK.l, 58, 162, 5, 1);
  mound(ctx, 250, 170, 12, COAL);
}

function furnaceGlow(ctx, t) {
  const { x, w } = FURNACE;
  const flicker = Math.floor(t / 150) % 3;
  box(ctx, INK.r, x + 10, 94, w - 20, 32);
  box(ctx, INK.o, x + 12, 104 + flicker, w - 24, 22 - flicker);
  box(ctx, INK.y, x + 16, 114 + flicker, w - 32, 12 - flicker);
  pool(ctx, x + w / 2, 146, 44, 14, `rgba(240, 138, 42, ${0.1 + 0.03 * flicker})`);
  pool(ctx, x + w / 2, 144, 26, 7, `rgba(255, 211, 72, ${0.1 + 0.03 * flicker})`);
  const spark = (t / 700) % 1;
  if (spark < 0.6) {
    for (let i = 0; i < 3; i++) box(ctx, i % 2 ? INK.y : INK.o, 24 + i * 7 + Math.round(spark * (i - 1) * 10), 158 - Math.round(spark * 30) - i * 3, 1, 1);
  }
}

const ORE = [[INK.y, 22, 168], [INK.o, 38, 158], [INK.v, 50, 172], [INK.y, 270, 162], [INK.o, 292, 172], [INK.v, 282, 154]];

function mound(ctx, x, y, size, [dark, mid, light]) {
  box(ctx, 'rgba(0, 0, 0, 0.25)', x - size * 1.2, y + size, size * 2.4, 3);
  for (let r = 0; r < size; r++) {
    const half = Math.round(Math.sqrt(size * size - (size - r) * (size - r)) * 1.2);
    box(ctx, INK.k, x - half - 1, y + r, 2 * half + 2, 1);
    box(ctx, r < size / 3 ? light : mid, x - half, y + r, 2 * half, 1);
    box(ctx, dark, x + Math.round(half * 0.4), y + r, Math.round(half * 0.6), 1);
  }
  for (let i = 0; i < size; i += 3) box(ctx, dark, x - size + ((i * 13) % (2 * size)), y + size / 3 + ((i * 7) % (size * 0.6)), 3, 2);
}

const ROCK = ['#463c34', '#7d7064', '#9a8c7c'];
const COAL = ['#120e0c', '#241c18', '#3a302a'];

function ore(ctx, wall) {
  for (const x of [20, 294]) {
    box(ctx, '#5a3a1e', x, 0, 6, wall);
    box(ctx, '#3a2414', x + 5, 0, 1, wall);
  }
  box(ctx, '#5a3a1e', 0, 4, 320, 5);
  mound(ctx, 38, 152, 22, ROCK);
  mound(ctx, 282, 148, 24, ROCK);
  for (const [colour, x, y] of ORE) box(ctx, colour, x, y, 3, 2);
  box(ctx, INK.k, 200, 176, 30, 12);
  box(ctx, INK.s, 201, 177, 28, 8);
  box(ctx, INK.l, 201, 177, 28, 1);
  for (const wx of [205, 221]) box(ctx, INK.k, wx, 186, 5, 5);
  box(ctx, '#7a5230', 92, 170, 2, 22);
  box(ctx, INK.l, 86, 168, 14, 3);
}

function glints(ctx, t) {
  ORE.forEach(([, x, y], i) => {
    if (Math.sin(t / 400 + i * 2.1) > 0.75) {
      box(ctx, INK.w, x + 1, y - 2, 1, 5);
      box(ctx, INK.w, x - 1, y, 5, 1);
    }
  });
}

/** Still decor of the act II areas, by biome. */
export const AREA_DECOR = { mirrors, well, den, forge, ore };

/** Moving decor of the act II areas, by biome: (ctx, t, wall). */
export const AREA_AMBIENT = {
  mirrors: (ctx, t, wall) => shine(ctx, t, wall),
  well: ripple,
  den: embers,
  forge: furnaceGlow,
  ore: glints,
};
