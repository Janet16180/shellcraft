/**
 * Decor for the act III areas of the overworld: the guild outpost at
 * ~/guild, and ~/hall, the common hall of the guild, with its strongroom
 * (vault), records room (archive) and shared room. Still decor is painted once
 * into the room's background; ambient decor moves every frame.
 */

import { INK } from './palette.js';
import { SPRITES } from './sprites.js';
import { box, drawSprite } from './paint.js';

const WOOD = { dark: '#3a2414', mid: '#5a3a1e', light: '#7a5230', top: '#9a6a40' };
const CLOTH = { smiths: '#e2434f', scribes: '#7b5cff', gold: '#ffd36b', cream: '#f3e3bd' };

function planks(ctx, wall) {
  for (let y = wall + 4; y < 200; y += 9) {
    box(ctx, 'rgba(0, 0, 0, 0.16)', 0, y, 320, 1);
    for (let x = ((y * 7) % 48); x < 320; x += 48) box(ctx, 'rgba(0, 0, 0, 0.16)', x, y + 1, 1, 8);
    box(ctx, 'rgba(255, 255, 255, 0.05)', 0, y + 1, 320, 1);
  }
}

function tiles(ctx, wall) {
  for (let y = wall + 4; y < 200; y += 16) {
    box(ctx, 'rgba(0, 0, 0, 0.22)', 0, y, 320, 1);
    for (let x = (y / 16) % 2 ? 8 : 0; x < 320; x += 16) box(ctx, 'rgba(0, 0, 0, 0.22)', x, y, 1, 16);
  }
}

function pine(ctx, x, y) {
  box(ctx, WOOD.mid, x + 6, y + 18, 4, 8);
  for (let r = 0; r < 18; r++) box(ctx, r % 6 < 3 ? '#2f6b2a' : '#3b8034', x + 8 - Math.round(r / 2.4), y + r, Math.max(2, Math.round(r / 1.2)), 1);
}

function tent(ctx, x, y) {
  const w = 64;
  const h = 40;
  box(ctx, 'rgba(0, 0, 0, 0.25)', x - 2, y + h, w + 6, 4);
  for (let r = 0; r < h; r++) {
    const half = Math.round(((r + 1) / h) * (w / 2));
    box(ctx, '#3a2a18', x + w / 2 - half - 1, y + r, 2 * half + 2, 1);
    box(ctx, r % 8 < 4 ? CLOTH.cream : '#e0cfa2', x + w / 2 - half, y + r, half, 1);
    box(ctx, r % 8 < 4 ? CLOTH.smiths : '#b8303c', x + w / 2, y + r, half, 1);
  }
  for (let r = 14; r < h; r++) box(ctx, '#2a1a10', x + w / 2 - Math.round((r - 14) / 3), y + r, 2 * Math.round((r - 14) / 3) + 1, 1);
  box(ctx, WOOD.dark, x + w / 2, y - 12, 1, 12);
}

function noticeBoard(ctx, x, y) {
  box(ctx, WOOD.mid, x + 4, y + 26, 3, 22);
  box(ctx, WOOD.mid, x + 33, y + 26, 3, 22);
  box(ctx, WOOD.dark, x - 1, y - 1, 42, 30);
  box(ctx, WOOD.light, x, y, 40, 28);
  box(ctx, WOOD.top, x, y, 40, 2);
  for (const [px, py, colour] of [[4, 5, CLOTH.cream], [16, 4, '#fff1d0'], [27, 7, CLOTH.cream], [8, 16, '#fff1d0'], [22, 16, CLOTH.cream]]) {
    box(ctx, colour, x + px, y + py, 9, 9);
    box(ctx, '#8a6a44', x + px + 2, y + py + 3, 5, 1);
    box(ctx, '#8a6a44', x + px + 2, y + py + 5, 4, 1);
    box(ctx, CLOTH.smiths, x + px + 4, y + py, 1, 1);
  }
}

const BUNTING = [CLOTH.smiths, CLOTH.gold, CLOTH.scribes, CLOTH.cream];

function bunting(ctx, wall, t) {
  const wave = Math.floor(t / 400) % 2;
  for (let x = 6; x < 316; x += 12) {
    const sag = Math.round(4 * Math.sin((x / 316) * Math.PI));
    const y = wall - 20 + sag;
    box(ctx, WOOD.dark, x, y, 12, 1);
    const colour = BUNTING[(x / 12) % BUNTING.length | 0];
    for (let r = 0; r < 5; r++) box(ctx, colour, x + 2 + Math.floor(r / 2) + (r === 4 ? wave : 0), y + 1 + r, 6 - 2 * Math.floor(r / 2), 1);
  }
}

function outpost(ctx, wall) {
  [[0, wall + 8], [294, wall + 8]].forEach(([x, y]) => pine(ctx, x, y));
  tent(ctx, 14, 136);
  noticeBoard(ctx, 262, 128);
  for (const [gx, gy] of [[96, 180], [212, 188], [240, 170], [120, 194]]) {
    box(ctx, '#3e6b2a', gx, gy, 1, 3);
    box(ctx, '#3e6b2a', gx + 2, gy - 1, 1, 4);
  }
}

function hangingBanner(ctx, x, top, colour, mark) {
  box(ctx, WOOD.dark, x - 2, top, 18, 2);
  box(ctx, '#1b1209', x - 1, top + 2, 16, 40);
  box(ctx, colour, x, top + 2, 14, 36);
  box(ctx, colour, x, top + 38, 6, 3);
  box(ctx, colour, x + 8, top + 38, 6, 3);
  box(ctx, CLOTH.gold, x + 1, top + 4, 12, 1);
  box(ctx, CLOTH.gold, x + 2, top + 12, 10, 11);
  box(ctx, CLOTH.cream, x + 3, top + 13, 8, 9);
  drawSprite(ctx, SPRITES[mark], x + 3, top + 14, { colours: { k: '#1b1209' } });
}

function bench(ctx, x, y, w) {
  box(ctx, WOOD.dark, x, y, w, 5);
  box(ctx, WOOD.light, x + 1, y + 1, w - 2, 2);
  box(ctx, WOOD.dark, x + 3, y + 5, 2, 4);
  box(ctx, WOOD.dark, x + w - 5, y + 5, 2, 4);
}

function feastTable(ctx, x, top, w) {
  box(ctx, 'rgba(0, 0, 0, 0.25)', x, top + 18, w, 4);
  for (const lx of [x + 6, x + w / 2 - 3, x + w - 12]) box(ctx, WOOD.dark, lx, top + 8, 6, 12);
  box(ctx, WOOD.dark, x - 1, top - 1, w + 2, 11);
  box(ctx, WOOD.light, x, top, w, 6);
  box(ctx, WOOD.top, x, top, w, 1);
  box(ctx, WOOD.mid, x, top + 6, w, 3);
  box(ctx, CLOTH.cream, x + w / 2 - 30, top, 60, 6);
  box(ctx, CLOTH.smiths, x + w / 2 - 30, top + 6, 60, 2);
  bench(ctx, x + 6, top + 22, w / 2 - 12);
  bench(ctx, x + w / 2 + 6, top + 22, w / 2 - 12);
}

const CANDLES = [[110, 0], [210, 0]];

function commons(ctx, wall) {
  planks(ctx, wall);
  box(ctx, '#7a2533', 136, wall + 4, 48, 196 - wall);
  for (let y = wall + 8; y < 196; y += 10) box(ctx, '#a8394b', 158, y, 4, 4);
  hangingBanner(ctx, 2, 4, CLOTH.smiths, 'smithsMark');
  hangingBanner(ctx, 304, 4, CLOTH.scribes, 'scribesMark');
  feastTable(ctx, 52, 116, 216);
  for (const [x] of CANDLES) {
    box(ctx, '#c9a26b', x - 2, 114, 7, 2);
    box(ctx, CLOTH.cream, x, 106, 3, 8);
  }
  for (const [x, colour] of [[78, '#c4c8d4'], [140, CLOTH.gold], [236, '#c4c8d4']]) {
    box(ctx, colour, x, 113, 6, 3);
    box(ctx, 'rgba(0, 0, 0, 0.3)', x, 115, 6, 1);
  }
}

function candles(ctx, t) {
  CANDLES.forEach(([x], i) => {
    const flick = (Math.floor(t / 220) + i) % 2;
    box(ctx, flick ? INK.y : INK.o, x, 103 + flick, 3, 3 - flick);
    box(ctx, INK.w, x + 1, 104 + flick, 1, 1);
  });
}

function bars(ctx, x, top, bottom) {
  box(ctx, '#16181d', x, top, 18, bottom - top);
  for (let bx = x + 1; bx < x + 18; bx += 4) box(ctx, '#8b8f99', bx, top, 2, bottom - top);
  for (const by of [top + 4, bottom - 8]) box(ctx, '#6b707a', x, by, 18, 3);
}

function safe(ctx, x, y) {
  const w = 46;
  const h = 40;
  box(ctx, 'rgba(0, 0, 0, 0.3)', x - 2, y + h, w + 6, 4);
  box(ctx, '#16181d', x - 1, y - 1, w + 2, h + 2);
  box(ctx, '#6b707a', x, y, w, h);
  box(ctx, '#8b8f99', x, y, w, 2);
  box(ctx, '#4a4f58', x + 4, y + 5, w - 8, h - 10);
  for (const [rx, ry] of [[2, 3], [w - 4, 3], [2, h - 5], [w - 4, h - 5]]) box(ctx, '#c7ccd6', x + rx, y + ry, 2, 2);
  box(ctx, '#e0b84a', x + 15, y + 12, 16, 16);
  box(ctx, '#8a6a20', x + 17, y + 14, 12, 12);
  box(ctx, '#e0b84a', x + 22, y + 15, 2, 10);
  box(ctx, '#e0b84a', x + 18, y + 19, 10, 2);
}

const COINS = [[240, 176], [250, 182], [262, 174], [272, 186], [256, 190]];

function strongroom(ctx, wall) {
  tiles(ctx, wall);
  bars(ctx, 0, wall + 6, 176);
  bars(ctx, 302, wall + 6, 176);
  safe(ctx, 28, 134);
  for (const [x, y] of COINS) {
    box(ctx, '#8a6a20', x, y + 1, 6, 3);
    box(ctx, '#e0b84a', x, y, 6, 3);
  }
}

function glint(ctx, t) {
  COINS.forEach(([x, y], i) => {
    if (Math.sin(t / 380 + i * 1.9) > 0.8) {
      box(ctx, INK.w, x + 2, y - 2, 1, 5);
      box(ctx, INK.w, x, y, 5, 1);
    }
  });
}

function cubbies(ctx, x, top, bottom) {
  box(ctx, WOOD.dark, x, top, 16, bottom - top);
  for (let y = top + 2; y + 10 < bottom; y += 10) {
    for (let i = 0; i < 2; i++) {
      box(ctx, '#1c0e12', x + 1 + i * 7, y, 7, 9);
      box(ctx, '#f3e3bd', x + 2 + i * 7, y + 3, 5, 5);
      box(ctx, '#c9a26b', x + 3 + i * 7, y + 4, 3, 3);
    }
  }
}

function lectern(ctx, x, y) {
  box(ctx, WOOD.dark, x + 10, y + 10, 6, 26);
  box(ctx, WOOD.dark, x + 4, y + 34, 18, 4);
  box(ctx, WOOD.dark, x - 1, y - 1, 28, 13);
  box(ctx, WOOD.light, x, y, 26, 11);
  box(ctx, '#f3e3bd', x + 2, y + 1, 10, 8);
  box(ctx, '#f3e3bd', x + 14, y + 1, 10, 8);
  for (let r = 0; r < 3; r++) {
    box(ctx, '#8a6a44', x + 4, y + 3 + r * 2, 6, 1);
    box(ctx, '#8a6a44', x + 16, y + 3 + r * 2, 6, 1);
  }
  box(ctx, WOOD.dark, x + 12, y + 1, 2, 9);
}

function records(ctx, wall) {
  planks(ctx, wall);
  cubbies(ctx, 2, wall + 6, 176);
  cubbies(ctx, 302, wall + 6, 176);
  lectern(ctx, 30, 138);
  box(ctx, '#c9a26b', 230, 150, 1, 26);
  box(ctx, '#c9a26b', 290, 150, 1, 26);
  for (let x = 231; x < 290; x += 2) box(ctx, '#b33a3a', x, 156 + Math.round(3 * Math.sin(((x - 231) / 59) * Math.PI)), 2, 1);
  box(ctx, '#7a2533', 256, 158, 8, 8);
  box(ctx, '#d84a5a', 258, 160, 4, 4);
}

function stool(ctx, x, y, colour) {
  box(ctx, 'rgba(0, 0, 0, 0.25)', x - 1, y + 14, 18, 3);
  box(ctx, WOOD.dark, x + 2, y + 5, 3, 10);
  box(ctx, WOOD.dark, x + 11, y + 5, 3, 10);
  box(ctx, WOOD.dark, x - 1, y - 1, 18, 7);
  box(ctx, colour, x, y, 16, 5);
  box(ctx, 'rgba(255, 255, 255, 0.3)', x, y, 16, 1);
}

function roundTable(ctx, cx, cy) {
  const [rx, ry] = [44, 12];
  box(ctx, 'rgba(0, 0, 0, 0.25)', cx - rx + 4, cy + ry + 12, 2 * rx - 8, 4);
  box(ctx, WOOD.dark, cx - 5, cy + 4, 10, 20);
  for (let r = -ry; r <= ry; r++) {
    const half = Math.round(rx * Math.sqrt(1 - (r * r) / (ry * ry)));
    box(ctx, WOOD.dark, cx - half - 1, cy + r, 2 * half + 2, 1);
    box(ctx, r < -ry / 2 ? WOOD.top : WOOD.light, cx - half, cy + r, 2 * half, 1);
  }
  box(ctx, WOOD.mid, cx - rx + 2, cy + ry - 2, 2 * rx - 4, 2);
  box(ctx, CLOTH.cream, cx - 18, cy - 5, 14, 9);
  for (const dy of [-3, -1, 1]) box(ctx, '#8a6a44', cx - 16, cy + dy, 10, 1);
  box(ctx, '#3a2a18', cx + 8, cy - 5, 6, 7);
  box(ctx, CLOTH.cream, cx + 12, cy - 12, 1, 8);
}

function pegs(ctx, x, wall, colours) {
  box(ctx, WOOD.dark, x, wall - 34, 6 + colours.length * 14, 3);
  colours.forEach((colour, i) => {
    const px = x + 4 + i * 14;
    box(ctx, WOOD.dark, px + 4, wall - 32, 2, 3);
    box(ctx, '#1b1209', px - 1, wall - 30, 12, 24);
    box(ctx, colour, px, wall - 29, 10, 22);
    box(ctx, colour, px - 1, wall - 10, 12, 3);
    box(ctx, 'rgba(0, 0, 0, 0.25)', px + 6, wall - 29, 3, 22);
  });
}

function chest(ctx, x, y, colour) {
  box(ctx, 'rgba(0, 0, 0, 0.25)', x, y + 16, 26, 3);
  box(ctx, WOOD.dark, x - 1, y - 1, 26, 18);
  box(ctx, WOOD.light, x, y, 24, 16);
  box(ctx, colour, x, y, 24, 5);
  box(ctx, WOOD.dark, x, y + 5, 24, 1);
  box(ctx, CLOTH.gold, x + 10, y + 4, 4, 4);
}

function shared(ctx, wall) {
  planks(ctx, wall);
  pegs(ctx, 4, wall, [CLOTH.smiths, CLOTH.scribes]);
  pegs(ctx, 278, wall, [CLOTH.gold, '#2c5aa8']);
  roundTable(ctx, 72, 150);
  stool(ctx, 6, 146, CLOTH.smiths);
  stool(ctx, 122, 146, CLOTH.scribes);
  stool(ctx, 64, 172, CLOTH.gold);
  chest(ctx, 236, 160, CLOTH.scribes);
  chest(ctx, 270, 168, CLOTH.smiths);
}

/** Still decor of the act III areas, by biome. */
export const HALL_DECOR = { outpost, commons, strongroom, records, shared };

/** Moving decor of the act III areas, by biome: (ctx, t, wall). */
export const HALL_AMBIENT = {
  outpost: (ctx, t, wall) => bunting(ctx, wall, t),
  commons: candles,
  strongroom: glint,
};
