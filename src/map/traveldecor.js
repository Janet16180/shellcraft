/**
 * Decor for chapter 21's area of the overworld. ~/travel is a camp at the
 * edge of the realm, at dusk: a loaded cart on the left, a dirt road from the
 * way out up to a stone stairway on the right that leads down to Ring Zero,
 * lit from below in its colours. ~/travel/unpacked is a room where an opened
 * chest spills its things across the floor. The bottom-left corner stays
 * clear for the player's job row (jobs.js).
 */

import { INK } from './palette.js';
import { SPRITES } from './sprites.js';
import { box, drawSprite } from './paint.js';

const SKY = ['#2a1f45', '#3d2a55', '#5a3560', '#86465e', '#b85e58', '#e08a5a', '#f0a860'];
const HILLS = { far: '#4a3352', near: '#2e2238' };
const GROUND = { grass: '#5f7a3a', tuft: '#8aa04a', road: '#a08858', rut: '#7e6a44', pebble: '#c4ad7a' };
const WOOD = { plank: '#6b4a30', dark: '#3a281a', light: '#8a6440', seam: '#2e2016' };
const CLOTH = { sack: '#c9a26b', fold: '#9a7a4a', rope: '#e8d0a0', red: '#b33a3a', blue: '#3a6bb3' };
const STAIRS = { x: 252, w: 60, top: 62, h: 58 };
const CART = { x: 8, y: 78 };
const CHEST = { x: 8, y: 24 };

function pool(ctx, cx, cy, rx, ry, colour) {
  for (let r = -ry; r <= ry; r++) {
    const half = Math.round(rx * Math.sqrt(1 - (r * r) / (ry * ry)));
    box(ctx, colour, cx - half, cy + r, 2 * half, 1);
  }
}

function sky(ctx, wall) {
  SKY.forEach((colour, i) => {
    const from = Math.round((i * wall) / SKY.length);
    box(ctx, colour, 0, from, 320, Math.round(((i + 1) * wall) / SKY.length) - from);
  });
  for (let x = 0; x < 320; x += 4) {
    const far = Math.round(8 + 6 * Math.sin(x / 23) + 4 * Math.sin(x / 9));
    box(ctx, HILLS.far, x, wall - 1 - far - 6, 4, far + 6);
    const near = Math.round(4 + 3 * Math.sin(x / 31 + 2));
    box(ctx, HILLS.near, x, wall - 1 - near, 4, near);
  }
  for (const [x, y] of [[30, 4], [84, 9], [150, 3], [210, 7], [276, 5], [300, 12]]) box(ctx, INK.w, x, y, 1, 1);
  box(ctx, INK.s, 0, wall - 2, 320, 3);
  for (let x = 0; x < 320; x += 10) box(ctx, INK.d, x, wall - 2, 1, 3);
  box(ctx, INK.l, 0, wall - 2, 320, 1);
}

function ground(ctx, wall) {
  box(ctx, GROUND.grass, 0, wall + 1, 320, 200 - wall - 1);
  for (let i = 0; i < 40; i++) {
    const x = (i * 71) % 316;
    const y = wall + 8 + ((i * 37) % (190 - wall));
    box(ctx, GROUND.tuft, x, y, 1, 2);
    box(ctx, GROUND.tuft, x + 2, y - 1, 1, 3);
  }
}

// From the way out at the bottom, the road bends up to the stairway on the right.
function road(ctx, wall) {
  const top = wall + STAIRS.top + STAIRS.h - 4;
  for (let y = 200; y > top; y -= 1) {
    const p = (200 - y) / (200 - top);
    const cx = Math.round(160 + (STAIRS.x + STAIRS.w / 2 - 160) * p * p);
    const half = Math.round(18 - 4 * p);
    box(ctx, GROUND.road, cx - half, y, 2 * half, 1);
    if (y % 3 === 0) {
      box(ctx, GROUND.rut, cx - half + 4, y, 2, 1);
      box(ctx, GROUND.rut, cx + half - 6, y, 2, 1);
    }
  }
  for (let i = 0; i < 12; i++) {
    const y = top + 6 + ((i * 29) % (200 - top - 8));
    const p = (200 - y) / (200 - top);
    box(ctx, GROUND.pebble, Math.round(160 + (STAIRS.x + STAIRS.w / 2 - 160) * p * p) + ((i * 13) % 20) - 10, y, 2, 1);
  }
}

function stairway(ctx, wall) {
  const { x, w, h } = STAIRS;
  const top = wall + STAIRS.top;
  box(ctx, INK.k, x - 3, top - 3, w + 6, h + 6);
  box(ctx, INK.s, x - 2, top - 2, w + 4, h + 4);
  for (let bx = x - 2; bx < x + w + 2; bx += 8) box(ctx, INK.d, bx, top - 2, 1, 2);
  box(ctx, INK.k, x, top, w, h);
  for (let i = 0; i < 7; i++) {
    const inset = i * 4;
    const y = top + i * 7;
    box(ctx, [INK.l, INK.l, INK.s, INK.s, INK.d, INK.d, INK.n][i], x + inset, y, w - 2 * inset, 3);
    box(ctx, INK.k, x + inset, y + 3, w - 2 * inset, 1);
    box(ctx, INK.n, x + inset, y + 4, w - 2 * inset, 3);
  }
  box(ctx, INK.l, x - 2, top - 2, w + 4, 1);
}

function signpost(ctx, wall) {
  const x = STAIRS.x - 38;
  const y = wall + STAIRS.top + 14;
  box(ctx, WOOD.dark, x + 7, y + 12, 3, 26);
  box(ctx, INK.k, x - 1, y - 1, 19, 15);
  box(ctx, WOOD.light, x, y, 17, 13);
  box(ctx, WOOD.plank, x, y + 11, 17, 2);
  drawSprite(ctx, SPRITES.ring, x + 3, y + 1);
  box(ctx, 'rgba(0, 0, 0, 0.25)', x + 4, y + 38, 10, 2);
}

function wheel(ctx, cx, cy) {
  pool(ctx, cx, cy, 8, 8, INK.k);
  pool(ctx, cx, cy, 7, 7, WOOD.plank);
  pool(ctx, cx, cy, 5, 5, WOOD.dark);
  box(ctx, WOOD.light, cx - 5, cy, 10, 1);
  box(ctx, WOOD.light, cx, cy - 5, 1, 10);
  box(ctx, INK.s, cx - 1, cy - 1, 3, 3);
}

function sack(ctx, x, y, colour, shade) {
  box(ctx, INK.k, x - 1, y + 1, 14, 12);
  box(ctx, colour, x, y + 2, 12, 10);
  box(ctx, shade, x, y + 9, 12, 3);
  box(ctx, INK.k, x + 4, y - 2, 4, 4);
  box(ctx, colour, x + 5, y - 1, 2, 3);
  box(ctx, CLOTH.rope, x + 3, y + 2, 6, 1);
}

function cart(ctx, wall) {
  const x = CART.x;
  const y = wall + CART.y;
  box(ctx, 'rgba(0, 0, 0, 0.25)', x - 2, y + 26, 66, 4);
  sack(ctx, x + 6, y - 12, CLOTH.sack, CLOTH.fold);
  sack(ctx, x + 20, y - 15, CLOTH.blue, '#2a4a82');
  drawSprite(ctx, SPRITES.strapped, x + 34, y - 15, { scale: 2 });
  box(ctx, INK.k, x - 1, y - 1, 58, 14);
  box(ctx, WOOD.plank, x, y, 56, 12);
  box(ctx, WOOD.light, x, y, 56, 2);
  for (let px = x + 8; px < x + 56; px += 10) box(ctx, WOOD.seam, px, y + 2, 1, 10);
  box(ctx, WOOD.dark, x + 56, y + 6, 10, 2);
  box(ctx, WOOD.dark, x + 64, y + 4, 2, 6);
  wheel(ctx, x + 12, y + 18);
  wheel(ctx, x + 44, y + 18);
  box(ctx, WOOD.dark, x + 2, y - 30, 2, 30);
}

function camp(ctx, wall) {
  sky(ctx, wall);
  ground(ctx, wall);
  road(ctx, wall);
  stairway(ctx, wall);
  signpost(ctx, wall);
  cart(ctx, wall);
}

// The kernel's light, from the bottom of the stairway: Ring Zero's gold and red, breathing.
function stairsGlow(ctx, wall, t) {
  const { x, w, h } = STAIRS;
  const top = wall + STAIRS.top;
  const breath = 0.5 + 0.5 * Math.sin(t / 700);
  ctx.globalAlpha = 0.35 + 0.25 * breath;
  box(ctx, INK.e, x + 24, top + h - 14, w - 48, 6);
  box(ctx, INK.o, x + 26, top + h - 10, w - 52, 4);
  box(ctx, INK.y, x + 28, top + h - 8, w - 56, 2);
  ctx.globalAlpha = 0.1 + 0.08 * breath;
  box(ctx, INK.v, x, top, w, h);
  ctx.globalAlpha = 1;
}

function pennant(ctx, t, wall) {
  const x = CART.x + 4;
  const y = wall + CART.y - 30;
  for (let c = 0; c < 12; c++) {
    const wave = Math.round(Math.sin(t / 220 - c / 2) * (c / 6));
    const half = Math.max(0, 3 - Math.floor(c / 4));
    box(ctx, c % 4 === 3 ? '#8a2a2a' : CLOTH.red, x + c, y + 1 + wave + (3 - half), 1, 2 * half + 1);
  }
}

function torches(ctx, t, wall) {
  const top = wall + STAIRS.top;
  box(ctx, WOOD.dark, STAIRS.x - 9, top + 22, 3, 22);
  box(ctx, 'rgba(0, 0, 0, 0.25)', STAIRS.x - 11, top + 43, 8, 2);
  drawSprite(ctx, SPRITES.torch[Math.floor(t / 200) % 3], STAIRS.x - 12, top + 4);
}

function birds(ctx, t, wall) {
  for (let i = 0; i < 3; i++) {
    const x = Math.round((t / 60 + i * 110) % 360) - 20;
    const y = 8 + i * 7 + Math.round(Math.sin(t / 500 + i) * 2);
    if (y > wall - 14) continue;
    const flap = Math.floor(t / 200 + i) % 2;
    box(ctx, HILLS.near, x, y + flap, 2, 1);
    box(ctx, HILLS.near, x + 2, y + 1, 1, 1);
    box(ctx, HILLS.near, x + 3, y + flap, 2, 1);
  }
}

function sparks(ctx, t, wall) {
  const top = wall + STAIRS.top;
  for (let i = 0; i < 4; i++) {
    const p = ((t / 2400) + i / 4) % 1;
    ctx.globalAlpha = 0.8 * (1 - p);
    box(ctx, i % 2 ? INK.y : INK.v, STAIRS.x + 18 + i * 8 + Math.round(Math.sin(t / 300 + i) * 2), top + STAIRS.h - 12 - Math.round(p * 40), 1, 1);
  }
  ctx.globalAlpha = 1;
}

function planks(ctx, wall) {
  for (let y = wall + 1; y < 200; y += 8) {
    box(ctx, WOOD.seam, 0, y, 320, 1);
    const shift = ((y - wall) / 8) % 2 ? 20 : 0;
    for (let x = shift; x < 320; x += 40) box(ctx, WOOD.seam, x, y, 1, 8);
  }
}

function openChest(ctx, wall) {
  const x = CHEST.x;
  const y = wall + CHEST.y;
  box(ctx, 'rgba(0, 0, 0, 0.3)', x - 2, y + 40, 60, 4);
  box(ctx, INK.k, x + 1, y - 20, 50, 22);
  box(ctx, INK.y, x + 2, y - 19, 48, 20);
  box(ctx, INK.r, x + 4, y - 17, 44, 16);
  box(ctx, '#4a2018', x + 6, y - 15, 40, 12);
  box(ctx, INK.y, x + 2, y - 3, 48, 3);
  box(ctx, INK.k, x - 1, y - 1, 54, 42);
  box(ctx, INK.b, x, y, 52, 40);
  box(ctx, INK.k, x + 2, y + 1, 48, 6);
  box(ctx, '#d9c070', x + 4, y + 2, 10, 4);
  box(ctx, INK.w, x + 18, y + 1, 8, 5);
  box(ctx, '#3a6bb3', x + 30, y + 2, 6, 4);
  box(ctx, INK.y, x, y + 8, 52, 4);
  box(ctx, INK.r, x, y + 22, 52, 2);
  box(ctx, INK.y, x, y + 30, 52, 4);
  box(ctx, INK.l, x + 22, y + 12, 8, 9);
  box(ctx, INK.k, x + 25, y + 15, 2, 4);
  box(ctx, INK.r, x + 6, y + 12, 1, 18);
  box(ctx, INK.r, x + 45, y + 12, 1, 18);
}

// What spilled out, in a trail from the chest's lip across the floor: coins, straw, cloth, a cup, a
// little book. Nothing here looks like an item, which is a file.
const SPILL = [
  ['coins', 62, 44], ['straw', 70, 54], ['cloth', 66, 68], ['coin', 86, 62], ['book', 92, 76], ['straw', 56, 82],
  ['coin', 108, 90], ['cup', 24, 96], ['coins', 120, 104], ['straw', 98, 106], ['coin', 74, 100], ['gem', 50, 104],
  ['coin', 136, 116], ['straw', 30, 118],
];

function coin(ctx, x, y) {
  box(ctx, INK.k, x - 1, y, 6, 3);
  box(ctx, INK.o, x, y + 1, 4, 2);
  box(ctx, INK.y, x, y, 4, 2);
}

const SPILLED = {
  coin,
  coins: (ctx, x, y) => [[0, 4], [5, 4], [2, 1], [9, 5], [4, -2]].forEach(([dx, dy]) => coin(ctx, x + dx, y + dy)),
  straw: (ctx, x, y) => {
    box(ctx, '#e0c060', x, y, 7, 1);
    box(ctx, '#c4a040', x + 2, y + 1, 6, 1);
    box(ctx, '#e0c060', x + 1, y + 2, 4, 1);
  },
  cloth: (ctx, x, y) => {
    box(ctx, INK.k, x - 1, y - 1, 26, 8);
    box(ctx, CLOTH.blue, x, y, 24, 6);
    box(ctx, '#2a4a82', x, y + 4, 24, 2);
    for (let cx = x + 3; cx < x + 24; cx += 6) box(ctx, INK.y, cx, y + 2, 2, 1);
    box(ctx, INK.k, x + 18, y - 3, 8, 10);
    box(ctx, '#2a4a82', x + 19, y - 2, 6, 8);
  },
  cup: (ctx, x, y) => {
    box(ctx, INK.k, x - 1, y - 1, 8, 9);
    box(ctx, INK.y, x, y, 6, 7);
    box(ctx, INK.o, x, y + 5, 6, 2);
    box(ctx, INK.k, x + 6, y + 2, 3, 3);
  },
  book: (ctx, x, y) => drawSprite(ctx, SPRITES.book, x, y),
  gem: (ctx, x, y) => drawSprite(ctx, SPRITES.gem, x, y, { colours: { c: '#ff4d6d', l: '#ffb3c1', d: '#a3122f' } }),
};

function spilled(ctx, wall) {
  for (const [kind, x, dy] of SPILL) SPILLED[kind](ctx, x, wall + dy);
}

function spill(ctx, wall) {
  planks(ctx, wall);
  openChest(ctx, wall);
  spilled(ctx, wall);
}

function glints(ctx, t, wall) {
  for (let i = 0; i < 5; i++) {
    if (Math.sin(t / 260 + i * 1.7) < 0.6) continue;
    const [, x, dy] = SPILL.filter(([kind]) => kind.startsWith('coin') || kind === 'gem')[i % 5];
    box(ctx, INK.w, x + 3, wall + dy - 3, 1, 3);
    box(ctx, INK.w, x + 2, wall + dy - 2, 3, 1);
  }
  const p = (t / 1600) % 1;
  ctx.globalAlpha = 0.6 * (1 - p);
  box(ctx, INK.y, CHEST.x + 14 + Math.round(p * 6), wall + CHEST.y - Math.round(p * 12), 1, 1);
  box(ctx, INK.y, CHEST.x + 34 - Math.round(p * 4), wall + CHEST.y - 4 - Math.round(p * 10), 1, 1);
  ctx.globalAlpha = 1;
}

/** Still decor of chapter 21's areas, by biome. */
export const TRAVEL_DECOR = {
  departure: camp,
  unpacked: spill,
};

/** Moving decor of chapter 21's areas, by biome: (ctx, t, wall). */
export const TRAVEL_AMBIENT = {
  departure: (ctx, t, wall) => {
    stairsGlow(ctx, wall, t);
    torches(ctx, t, wall);
    sparks(ctx, t, wall);
    pennant(ctx, t, wall);
    birds(ctx, t, wall);
  },
  unpacked: glints,
};
