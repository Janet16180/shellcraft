/**
 * Decor for the guild's services under /srv, where chapter 18's boss sends
 * the player: the mill, the bakery, the stables, the lighthouse and the
 * granary. Each is a dungeon room (owned by root, outside the home) with a few
 * things that say what the service is. Still decor is painted once into the
 * room's background; ambient decor moves every frame.
 */

import { INK } from './palette.js';
import { box } from './paint.js';

const FLOUR = '#e8dcc0';
const GRAIN = { light: '#ffe08a', mid: INK.y, dark: '#c89a2e' };
const SEA = { deep: '#14284f', mid: INK.u, foam: '#9fd3f5' };

const shadow = (ctx, x, y, w) => box(ctx, 'rgba(11, 10, 18, 0.35)', x, y, w, 3);

function disc(ctx, cx, cy, r, fill, edge) {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    box(ctx, edge, cx - half - 1, cy + dy, 2 * half + 2, 1);
    box(ctx, fill, cx - half, cy + dy, 2 * half, 1);
  }
}

function ellipse(ctx, cx, cy, rx, ry, colour) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
    box(ctx, colour, cx - half, cy + dy, 2 * half, 1);
  }
}

function sack(ctx, x, y, w = 18, h = 16) {
  box(ctx, INK.k, x - 1, y + 3, w + 2, h - 2);
  box(ctx, INK.k, x + 2, y - 1, w - 4, 5);
  box(ctx, FLOUR, x, y + 4, w, h - 4);
  box(ctx, FLOUR, x + 3, y, w - 6, 4);
  box(ctx, INK.l, x + w - 4, y + 5, 3, h - 6);
  box(ctx, INK.b, x + 3, y + 3, w - 6, 1);
  box(ctx, INK.b, x + w / 2 - 1, y - 2, 2, 2);
}

function millstone(ctx, cx, cy) {
  shadow(ctx, cx - 22, cy + 20, 44);
  disc(ctx, cx, cy, 20, INK.s, INK.k);
  disc(ctx, cx, cy, 15, INK.l, INK.s);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (let d = 5; d < 15; d += 2) box(ctx, INK.s, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
  }
  disc(ctx, cx, cy, 3, INK.k, INK.k);
  for (const [x, w] of [[cx - 30, 14], [cx + 16, 12]]) box(ctx, FLOUR, x, cy + 19, w, 2);
}

function gear(ctx, cx, cy, t) {
  const turn = Math.floor(t / 120) / 24;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10 + turn) * Math.PI * 2;
    box(ctx, INK.r, Math.round(cx + Math.cos(a) * 17) - 2, Math.round(cy + Math.sin(a) * 17) - 2, 5, 5);
  }
  disc(ctx, cx, cy, 15, INK.b, INK.r);
  disc(ctx, cx, cy, 11, INK.r, INK.r);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4 + turn) * Math.PI * 2;
    for (let d = 0; d < 12; d++) box(ctx, INK.b, Math.round(cx + Math.cos(a) * d) - 1, Math.round(cy + Math.sin(a) * d) - 1, 3, 3);
  }
  disc(ctx, cx, cy, 3, INK.y, INK.k);
}

function mill(ctx) {
  millstone(ctx, 40, 152);
  sack(ctx, 258, 160);
  sack(ctx, 280, 164);
  sack(ctx, 268, 146);
  box(ctx, FLOUR, 248, 180, 10, 2);
}

function oven(ctx, x, y) {
  const w = 56;
  const h = 46;
  shadow(ctx, x, y + h, w);
  for (let r = 0; r < h; r++) {
    const half = r < 22 ? Math.round((w / 2) * Math.sqrt(1 - ((22 - r) / 22) ** 2)) : w / 2;
    box(ctx, INK.k, x + w / 2 - half - 1, y + r, 2 * half + 2, 1);
    for (let bx = x + w / 2 - half; bx < x + w / 2 + half; bx += 8) {
      const shift = (Math.floor(r / 5) % 2) * 4;
      box(ctx, r % 5 === 4 ? INK.r : INK.b, bx + shift, y + r, Math.min(7, x + w / 2 + half - bx - shift), 1);
    }
  }
  for (let r = 0; r < 20; r++) {
    const half = r < 8 ? Math.round(12 * Math.sqrt(1 - ((8 - r) / 8) ** 2)) : 12;
    box(ctx, INK.k, x + w / 2 - half, y + 24 + r, 2 * half, 1);
  }
  box(ctx, INK.s, x - 2, y + h - 2, w + 4, 3);
}

function embers(ctx, t) {
  const flick = Math.floor(t / 180) % 3;
  box(ctx, 'rgba(240, 138, 42, 0.35)', 22, 154, 24, 14);
  box(ctx, flick ? INK.o : INK.y, 26, 160 - flick, 16, 4 + flick);
  box(ctx, INK.y, 30 + flick * 2, 158 - flick, 4, 3);
  box(ctx, INK.e, 24, 164, 20, 2);
}

const CRUST = { top: '#f0a848', mid: '#d9822b', low: INK.b, score: '#ffd9a0' };

function loaf(ctx, x, y) {
  box(ctx, INK.k, x + 2, y - 1, 9, 1);
  box(ctx, INK.k, x, y, 13, 7);
  box(ctx, CRUST.top, x + 3, y, 7, 1);
  box(ctx, CRUST.top, x + 1, y + 1, 11, 2);
  box(ctx, CRUST.mid, x + 1, y + 3, 11, 2);
  box(ctx, CRUST.low, x + 1, y + 5, 11, 1);
  for (const sx of [3, 6, 9]) box(ctx, CRUST.score, x + sx, y + 1, 2, 1);
}

function shelf(ctx, x, y, w) {
  box(ctx, INK.k, x - 1, y, w + 2, 4);
  box(ctx, INK.b, x, y, w, 3);
  for (const bx of [x + 4, x + w - 7]) box(ctx, INK.r, bx, y + 4, 3, 5);
}

function table(ctx, x, y, w) {
  shadow(ctx, x, y + 20, w);
  for (const lx of [x + 3, x + w - 7]) box(ctx, INK.r, lx, y + 6, 4, 15);
  box(ctx, INK.k, x - 1, y - 1, w + 2, 8);
  box(ctx, INK.b, x, y, w, 6);
  box(ctx, INK.o, x, y, w, 1);
}

function bakery(ctx, wall) {
  oven(ctx, 6, 128);
  table(ctx, 244, 158, 60);
  for (const [lx, ly] of [[248, 151], [264, 152], [282, 151]]) loaf(ctx, lx, ly);
  for (const sx of [36, 226]) {
    shelf(ctx, sx, wall - 22, 58);
    for (let i = 0; i < 4; i++) loaf(ctx, sx + 2 + i * 14, wall - 29);
  }
}

function bale(ctx, x, y, w, h) {
  box(ctx, INK.k, x - 1, y - 1, w + 2, h + 2);
  box(ctx, GRAIN.mid, x, y, w, h);
  box(ctx, GRAIN.light, x, y, w, 2);
  for (let sy = y + 4; sy < y + h; sy += 3) box(ctx, GRAIN.dark, x + 1 + (sy % 4), sy, w - 4, 1);
  for (const bx of [x + 5, x + w - 7]) box(ctx, INK.r, bx, y, 2, h);
}

function horseshoe(ctx, x, y) {
  box(ctx, INK.k, x, y, 2, 2);
  box(ctx, INK.l, x - 4, y + 2, 2, 8);
  box(ctx, INK.l, x + 4, y + 2, 2, 8);
  box(ctx, INK.l, x - 3, y + 10, 8, 2);
  box(ctx, INK.s, x - 4, y + 2, 1, 7);
}

function stall(ctx, wall) {
  const top = wall - 24;
  for (const px of [104, 158, 212]) box(ctx, INK.r, px, top - 4, 4, 28);
  for (const ry of [top, top + 9]) {
    box(ctx, INK.k, 102, ry - 1, 118, 6);
    box(ctx, INK.b, 102, ry, 118, 4);
    box(ctx, INK.o, 102, ry, 118, 1);
  }
}

function trough(ctx, x, y) {
  shadow(ctx, x, y + 14, 50);
  box(ctx, INK.k, x - 1, y - 1, 52, 15);
  box(ctx, INK.b, x, y, 50, 13);
  box(ctx, SEA.mid, x + 3, y + 1, 44, 3);
  box(ctx, SEA.foam, x + 6, y + 1, 10, 1);
  for (const lx of [x + 2, x + 44]) box(ctx, INK.r, lx, y + 13, 4, 4);
}

function stables(ctx, wall) {
  stall(ctx, wall);
  for (const hx of [56, 76, 244, 264]) horseshoe(ctx, hx, wall - 30);
  bale(ctx, 10, 160, 32, 16);
  bale(ctx, 44, 164, 26, 13);
  bale(ctx, 22, 144, 30, 15);
  trough(ctx, 248, 162);
  for (const [sx, sy] of [[80, 182], [90, 178], [236, 188], [76, 190], [226, 180]]) box(ctx, GRAIN.mid, sx, sy, 4, 1);
}

const PORTHOLE = { cx: 160, r: 18 };

function porthole(ctx, wall) {
  const cy = Math.round(wall / 2);
  disc(ctx, PORTHOLE.cx, cy, PORTHOLE.r + 3, INK.y, INK.k);
  disc(ctx, PORTHOLE.cx, cy, PORTHOLE.r, SEA.deep, INK.o);
  for (let dy = 2; dy < PORTHOLE.r; dy++) {
    const half = Math.round(Math.sqrt(PORTHOLE.r * PORTHOLE.r - dy * dy));
    box(ctx, dy % 4 === 2 ? SEA.foam : SEA.mid, PORTHOLE.cx - half, cy + dy, 2 * half, 1);
  }
  box(ctx, INK.w, PORTHOLE.cx + 7, cy - 10, 3, 3);
  for (const [sx, sy] of [[-10, -6], [-3, -12], [4, -4]]) box(ctx, INK.l, PORTHOLE.cx + sx, cy + sy, 1, 1);
}

function lantern(ctx, x, y) {
  shadow(ctx, x - 2, y + 52, 40);
  box(ctx, INK.k, x + 8, y + 30, 20, 24);
  box(ctx, INK.s, x + 9, y + 31, 18, 22);
  box(ctx, INK.l, x + 9, y + 31, 4, 22);
  box(ctx, INK.k, x + 2, y + 26, 32, 5);
  box(ctx, INK.k, x + 4, y + 2, 28, 25);
  box(ctx, '#fff3b0', x + 5, y + 3, 26, 23);
  for (const bx of [x + 11, x + 18, x + 25]) box(ctx, INK.k, bx, y + 3, 1, 23);
  box(ctx, INK.k, x + 8, y - 4, 20, 7);
  box(ctx, INK.e, x + 9, y - 3, 18, 5);
  box(ctx, INK.k, x + 17, y - 8, 2, 4);
}

function beam(ctx, t, wall) {
  const pulse = (Math.sin(t / 500) + 1) / 2;
  for (const [r, alpha] of [[30, 0.08], [22, 0.12], [15, 0.16]]) ellipse(ctx, 36, 135, r, Math.round(r * 0.8), `rgba(255, 211, 72, ${alpha + 0.08 * pulse})`);
  box(ctx, INK.y, 30, 128, 8, 8);
  box(ctx, INK.w, 32, 130, 4, 4);
  const sweep = Math.floor(t / 90) % 48;
  const cy = Math.round(wall / 2);
  if (sweep < 36) box(ctx, 'rgba(255, 243, 176, 0.55)', PORTHOLE.cx - PORTHOLE.r + sweep, cy - 6, 2, 8);
}

function rope(ctx, cx, cy) {
  shadow(ctx, cx - 18, cy + 6, 36);
  for (let turn = 0; turn < 3; turn++) {
    const y = cy - turn * 3;
    ellipse(ctx, cx, y, 17 - turn * 2, 6, INK.k);
    ellipse(ctx, cx, y, 16 - turn * 2, 5, INK.b);
    ellipse(ctx, cx, y - 1, 12 - turn * 2, 3, INK.r);
  }
  ellipse(ctx, cx, cy - 7, 5, 2, INK.k);
  for (let i = 0; i < 5; i++) box(ctx, '#d9822b', cx - 12 + i * 6, cy - 10 + (i % 2), 2, 1);
}

function anchor(ctx, x, y) {
  box(ctx, INK.k, x + 8, y, 6, 6);
  box(ctx, INK.l, x + 9, y + 1, 4, 4);
  box(ctx, INK.k, x + 10, y + 6, 3, 26);
  box(ctx, INK.l, x + 2, y + 9, 18, 3);
  box(ctx, INK.l, x, y + 26, 22, 3);
  box(ctx, INK.l, x, y + 20, 3, 7);
  box(ctx, INK.l, x + 19, y + 20, 3, 7);
}

function lighthouse(ctx, wall) {
  porthole(ctx, wall);
  lantern(ctx, 18, 122);
  rope(ctx, 270, 172);
  anchor(ctx, 284, 136);
}

function heap(ctx, cx, y, w, h) {
  shadow(ctx, cx - w / 2, y + h, w);
  for (let r = 0; r < h; r++) {
    const half = Math.round((w / 2) * Math.sqrt(r / h));
    box(ctx, GRAIN.dark, cx - half - 1, y + r, 2 * half + 2, 1);
    box(ctx, r < h / 3 ? GRAIN.light : GRAIN.mid, cx - half, y + r, 2 * half, 1);
  }
  for (let i = 0; i < 9; i++) box(ctx, GRAIN.dark, cx - w / 3 + ((i * 13) % Math.round(w / 1.5)), y + 6 + ((i * 7) % (h - 8)), 1, 1);
}

// A bundle of wheat hung head down from a peg: stalks above the tie, ears fanning out below.
function sheaf(ctx, x, top) {
  box(ctx, INK.k, x + 4, top, 2, 3);
  for (let i = 0; i < 5; i++) box(ctx, i % 2 ? GRAIN.dark : GRAIN.mid, x + 3 + i, top + 3, 1, 10);
  box(ctx, INK.r, x + 2, top + 12, 7, 2);
  for (let i = 0; i < 11; i++) {
    const lean = Math.round((i - 5) / 2);
    box(ctx, i % 2 ? GRAIN.dark : GRAIN.mid, x + i, top + 14, 1, 4);
    box(ctx, GRAIN.light, x + i + lean, top + 18, 1, 4);
  }
}

function granary(ctx, wall) {
  for (const sx of [40, 62, 84, 222, 244, 266]) sheaf(ctx, sx, wall - 32);
  sack(ctx, 10, 162);
  sack(ctx, 30, 164);
  sack(ctx, 50, 162);
  sack(ctx, 20, 148);
  sack(ctx, 40, 148);
  heap(ctx, 272, 146, 56, 30);
  box(ctx, INK.l, 236, 172, 12, 6);
  box(ctx, INK.s, 236, 172, 12, 1);
  box(ctx, INK.r, 228, 174, 9, 2);
}

/** Still decor of the guild's service rooms, by biome: (ctx, wall). */
export const SERVICE_DECOR = { mill, bakery, stables, lighthouse, granary };

/** Moving decor of the service rooms, by biome: (ctx, t, wall). */
export const SERVICE_AMBIENT = {
  mill: (ctx, t, wall) => gear(ctx, 160, Math.round(wall / 2) - 2, t),
  bakery: embers,
  lighthouse: beam,
};
