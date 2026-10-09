/**
 * The dungeon painter: everything outside the player's home, in Ring Zero's
 * Pixel Dungeon style. Brick walls, flagstone floors, two flickering wall
 * torches whose light falls off in hard bands, and decor that says what each
 * system directory holds.
 */

import { BIOMES } from './biomes.js';
import { INK } from './palette.js';
import { SPRITES } from './sprites.js';
import { ART, HERO_REST } from './layout.js';
import { box, drawSprite, makeCanvas, tile } from './paint.js';
import { SERVICE_DECOR, SERVICE_AMBIENT } from './servicedecor.js';

const TORCHES = [{ x: 2, y: 12 }, { x: 310, y: 12 }];
const GLOW_BANDS = [[22, 0.2], [40, 0.1], [62, 0.045]];
const SHADE_BANDS = [[0.64, 0], [0.82, 0.22], [Infinity, 0.42]];
const FLICKER = [1, 0.75, 0.9];

let lightCache = null;

function bandOf(bands, distance) {
  return bands.find(([edge]) => distance < edge)?.[1] ?? 0;
}

function bakeLight() {
  const glow = makeCanvas(ART.width, ART.height);
  const shade = makeCanvas(ART.width, ART.height);
  const glowData = glow.getContext('2d').createImageData(ART.width, ART.height);
  const shadeData = shade.getContext('2d').createImageData(ART.width, ART.height);
  for (let y = 0; y < ART.height; y++) {
    for (let x = 0; x < ART.width; x++) {
      const i = (y * ART.width + x) * 4;
      const near = Math.min(...TORCHES.map(t => Math.hypot(x - (t.x + 4), y - (t.y + 5))));
      const edge = Math.hypot((x - 160) / 190, (y - 112) / 140);
      glowData.data.set([240, 138, 42, 255 * bandOf(GLOW_BANDS, near)], i);
      shadeData.data.set([11, 10, 18, 255 * bandOf(SHADE_BANDS, edge)], i);
    }
  }
  glow.getContext('2d').putImageData(glowData, 0, 0);
  shade.getContext('2d').putImageData(shadeData, 0, 0);
  return { glow, shade };
}

const light = () => (lightCache ??= bakeLight());

const sides = wall => ({ top: wall + 6, bottom: 176 });

function rack(ctx, wall, draw) {
  const { top, bottom } = sides(wall);
  for (const x of [0, 309]) {
    box(ctx, INK.k, x, top, 11, bottom - top);
    box(ctx, INK.r, x + 1, top + 1, 9, bottom - top - 2);
    for (let y = top + 3; y < bottom - 10; y += 12) {
      draw(x + 1, y);
      box(ctx, INK.k, x + 1, y + 9, 9, 1);
    }
  }
}

function scrolls(ctx, wall) {
  rack(ctx, wall, (x, y) => {
    for (let i = 0; i < 3; i++) {
      box(ctx, INK.w, x + 1 + i * 3, y + 3, 2, 6);
      box(ctx, INK.l, x + 1 + i * 3, y + 3, 2, 1);
    }
  });
}

function books(ctx, wall) {
  const spines = [INK.e, INK.u, INK.g, INK.b, INK.p];
  rack(ctx, wall, (x, y) => {
    for (let i = 0; i < 4; i++) box(ctx, spines[(x + y + i) % spines.length], x + 1 + i * 2, y + 2, 2, 7);
  });
}

function weapons(ctx, wall) {
  rack(ctx, wall, (x, y) => {
    box(ctx, INK.l, x + 4, y, 1, 7);
    box(ctx, INK.y, x + 2, y + 6, 5, 1);
    box(ctx, INK.b, x + 4, y + 7, 1, 2);
  });
}

function guild(ctx, wall) {
  rack(ctx, wall, (x, y) => {
    box(ctx, INK.w, x + 1, y + 3, 7, 5);
    box(ctx, INK.G, x + 3, y + 5, 3, 3);
  });
  for (const x of [14, 298]) {
    box(ctx, INK.k, x - 1, 0, 10, 31);
    box(ctx, INK.g, x, 0, 8, 26);
    box(ctx, INK.g, x, 26, 3, 4);
    box(ctx, INK.g, x + 5, 26, 3, 4);
    box(ctx, INK.y, x + 3, 8, 2, 8);
    box(ctx, INK.y, x + 1, 11, 6, 2);
  }
}

function desk(ctx) {
  box(ctx, INK.k, 18, 160, 48, 14);
  box(ctx, INK.b, 19, 160, 46, 4);
  box(ctx, INK.r, 21, 164, 4, 10);
  box(ctx, INK.r, 59, 164, 4, 10);
  drawSprite(ctx, SPRITES.book, 34, 152);
  box(ctx, INK.w, 52, 152, 3, 8);
}

const big = (ctx, sprite, spots, opts = {}) => spots.forEach(([x, y]) => drawSprite(ctx, sprite, x, y, { scale: 2, ...opts }));

function scraps(ctx) {
  big(ctx, SPRITES.crate, [[16, 148], [8, 168], [32, 172], [272, 166], [292, 156]]);
  for (const [x, y] of [[62, 186], [76, 192], [94, 182], [226, 188], [244, 180], [258, 192]]) box(ctx, x % 3 ? INK.w : INK.l, x, y, 4, 2);
}

function rugWithRing(ctx, wall) {
  const top = wall + 12;
  const bottom = HERO_REST.y - 2;
  box(ctx, INK.k, 110, top, 100, bottom - top);
  box(ctx, INK.p, 112, top + 2, 96, bottom - top - 4);
  box(ctx, INK.v, 114, top + 4, 92, 1);
  box(ctx, INK.v, 114, bottom - 5, 92, 1);
  const scale = bottom - top >= 44 ? 3 : 2;
  const size = 10 * scale;
  drawSprite(ctx, SPRITES.ring, 160 - size / 2, Math.round((top + bottom - size) / 2), { scale, alpha: 0.9 });
}

function shields(ctx, wall) {
  big(ctx, SPRITES.shield, [[0, wall + 14], [304, wall + 14]]);
}

function bed(ctx) {
  box(ctx, INK.k, 14, 164, 44, 18);
  box(ctx, INK.r, 15, 165, 42, 16);
  box(ctx, INK.u, 15, 165, 30, 12);
  box(ctx, INK.w, 46, 166, 10, 6);
}

function cobwebs(ctx, wall) {
  drawSprite(ctx, SPRITES.web, 0, wall + 1, { scale: 2, alpha: 0.6 });
  drawSprite(ctx, SPRITES.web, ART.width - 16, wall + 1, { scale: 2, alpha: 0.6, flip: true });
  drawSprite(ctx, SPRITES.bones, 26, 182, { scale: 2 });
}

function banner(ctx, x, top, colour, emblem) {
  const h = 34;
  box(ctx, INK.y, x - 2, top, 16, 2);
  box(ctx, INK.k, x - 1, top + 2, 14, h);
  box(ctx, colour, x, top + 2, 12, h - 4);
  for (let i = 0; i < 6; i++) {
    box(ctx, colour, x, top + h - 2, 6 - i, 1 + Math.floor(i / 2));
    box(ctx, colour, x + 6 + i, top + h - 2, 6 - i, 1 + Math.floor(i / 2));
  }
  box(ctx, INK.y, x + 1, top + 4, 10, 1);
  box(ctx, INK.w, x + 2, top + 9, 8, 10);
  drawSprite(ctx, SPRITES[emblem], x + 2, top + 11);
}

function guildBanners(ctx, wall) {
  const top = Math.max(2, wall - 50);
  banner(ctx, 16, top, INK.e, 'smithsMark');
  banner(ctx, 292, top, INK.p, 'scribesMark');
}

function longTable(ctx, wall) {
  const top = Math.min(wall + 52, 112);
  box(ctx, 'rgba(11, 10, 18, 0.35)', 40, top + 16, 240, 4);
  for (const lx of [48, 156, 266]) box(ctx, INK.r, lx, top + 8, 6, 12);
  box(ctx, INK.k, 38, top - 1, 244, 11);
  box(ctx, INK.b, 39, top, 242, 6);
  box(ctx, INK.r, 39, top + 6, 242, 3);
  box(ctx, INK.o, 39, top, 242, 1);
  for (const [bx, by] of [[44, top + 22], [180, top + 22]]) {
    box(ctx, INK.k, bx, by, 96, 5);
    box(ctx, INK.r, bx + 1, by + 1, 94, 3);
  }
  for (const cx of [70, 250]) {
    box(ctx, INK.w, cx, top - 6, 3, 6);
    box(ctx, INK.l, cx + 2, top - 6, 1, 6);
  }
  box(ctx, INK.l, 120, top - 2, 6, 2);
  box(ctx, INK.w, 196, top - 3, 10, 3);
}

function services(ctx, wall) {
  guildBanners(ctx, wall);
  big(ctx, SPRITES.crate, [[24, 156], [276, 150]]);
  big(ctx, SPRITES.barrel, [[44, 164]]);
}

function guildhall(ctx, wall) {
  books(ctx, wall);
  guildBanners(ctx, wall);
  longTable(ctx, wall);
}

function pigeonholes(ctx, x, top, bottom) {
  box(ctx, INK.k, x, top, 36, bottom - top);
  for (let y = top + 1; y + 8 < bottom; y += 8) {
    for (let cx = x + 1; cx < x + 35; cx += 7) {
      box(ctx, INK.r, cx, y, 6, 7);
      if ((cx * 3 + y) % 5 !== 0) {
        box(ctx, INK.w, cx + 1, y + 2, 4, 4);
        box(ctx, INK.l, cx + 2, y + 3, 2, 2);
      }
    }
  }
}

function guildarchive(ctx, wall) {
  scrolls(ctx, wall);
  pigeonholes(ctx, 40, wall - 44, wall - 4);
  pigeonholes(ctx, 244, wall - 44, wall - 4);
  box(ctx, INK.k, 112, 162, 96, 22);
  box(ctx, INK.p, 113, 163, 94, 20);
  box(ctx, INK.v, 115, 165, 90, 1);
  box(ctx, INK.v, 115, 180, 90, 1);
}

const DECOR = {
  hall: (ctx, wall) => {
    rugWithRing(ctx, wall);
    shields(ctx, wall);
  },
  archive: scrolls,
  scriptorium: (ctx, wall) => {
    books(ctx, wall);
    desk(ctx);
  },
  cellar: ctx => big(ctx, SPRITES.barrel, [[10, 156], [30, 164], [266, 160], [288, 154]]),
  scrap: scraps,
  gatehouse: shields,
  quarters: bed,
  vault: ctx => big(ctx, SPRITES.chest, [[12, 150]]),
  armory: weapons,
  guild: (ctx, wall) => {
    guild(ctx, wall);
    desk(ctx);
  },
  workshop: ctx => big(ctx, SPRITES.anvil, [[18, 162]]),
  pit: ctx => big(ctx, SPRITES.rune, [[14, 156], [282, 156]], { alpha: 0.8 }),
  corridor: cobwebs,
  services,
  guildhall,
  guildarchive,
  ...SERVICE_DECOR,
};

/**
 * Paint what never moves in a dungeon room: brick wall, flagstones, decor
 * and the darkness gathering at the edges.
 *
 * @param {CanvasRenderingContext2D} ctx The 320 x 200 art canvas.
 * @param {{biome: string, layout: import('./layout.js').Layout}} scene The room.
 */
export function background(ctx, { biome, layout }) {
  const { wall } = layout;
  tile(ctx, SPRITES.flagstone, 0, wall, ART.width, ART.height - wall);
  tile(ctx, SPRITES.brick, 0, 0, ART.width, wall);
  box(ctx, INK.s, 0, wall - 2, ART.width, 1);
  box(ctx, INK.k, 0, wall - 1, ART.width, 2);
  box(ctx, 'rgba(11, 10, 18, 0.45)', 0, wall + 1, ART.width, 3);
  DECOR[biome](ctx, wall);
  ctx.drawImage(light().shade, 0, 0);
}

/**
 * Paint what moves in a dungeon room: the torches, a candle in the scriptorium,
 * and the moving parts of the guild's service rooms.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{biome: string, layout: import('./layout.js').Layout}} scene The room.
 * @param {number} t Animation clock in ms (frozen at 0 with reduced motion).
 */
export function ambient(ctx, { biome, layout }, t) {
  TORCHES.forEach((torch, i) => drawSprite(ctx, SPRITES.torch[(Math.floor(t / 200) + i * 2) % 3], torch.x, torch.y));
  if (biome === 'scriptorium') box(ctx, Math.floor(t / 250) % 2 ? INK.y : INK.o, 53, 147 + (Math.floor(t / 250) % 2), 1, 3);
  SERVICE_AMBIENT[biome]?.(ctx, t, layout.wall);
}

/**
 * Paint the torchlight over the finished room. It brightens rather than
 * covers, and flickers in steps like Ring Zero's.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {number} t Animation clock in ms.
 */
export function lighting(ctx, t) {
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = FLICKER[Math.floor(t / 400) % FLICKER.length];
  ctx.drawImage(light().glow, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function daylight(ctx, x, y, w, h) {
  box(ctx, INK.w, x, y + 1, w, h - 1);
  box(ctx, INK.y, x, y + h - 14, w, 4);
  box(ctx, INK.G, x, y + h - 10, w, 6);
  box(ctx, INK.g, x, y + h - 4, w, 4);
  box(ctx, INK.b, x, y + 1, 3, h - 1);
  ctx.fillStyle = 'rgba(255, 211, 72, 0.28)';
  for (let r = 0; r < 14; r++) ctx.fillRect(x - Math.floor(r / 2), y + h + r, w + r, 1);
}

function leaf(ctx, x, y, w, h) {
  [4, 2, 1].forEach((inset, r) => box(ctx, INK.b, x + inset, y + 1 + r, w - 2 * inset, 1));
  box(ctx, INK.b, x, y + 4, w, h - 4);
  for (let px = x + 5; px < x + w; px += 5) box(ctx, INK.r, px, y + 3, 1, h - 3);
  for (const by of [y + 8, y + h - 10]) {
    box(ctx, INK.k, x, by, w, 2);
    box(ctx, INK.l, x + 2, by, 1, 1);
    box(ctx, INK.l, x + w - 3, by, 1, 1);
  }
  box(ctx, INK.y, x + w - 6, y + Math.floor(h / 2), 3, 3);
  box(ctx, INK.k, x + w - 5, y + Math.floor(h / 2) + 1, 1, 1);
}

/**
 * Paint a dungeon door: an arched wooden door in a stone frame. The door into
 * the player's home stands open on daylight.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {import('./layout.js').Placed} door The door.
 * @param {{home: string}} scene The room.
 */
export function door(ctx, { x, y, w, h, hidden, path }, { home }) {
  ctx.globalAlpha = hidden ? 0.6 : 1;
  box(ctx, INK.s, x - 3, y - 2, w + 6, h + 2);
  box(ctx, INK.l, x - 3, y - 2, w + 6, 1);
  box(ctx, INK.d, x + w + 2, y - 1, 1, h + 1);
  box(ctx, INK.k, x, y + 1, w, h - 1);
  if (path === home) daylight(ctx, x, y, w, h);
  else leaf(ctx, x, y, w, h);
  ctx.globalAlpha = 1;
}

/**
 * Paint the exit: stone steps up toward the parent directory.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{x: number, y: number, w: number, h: number}} exit The exit box.
 * @param {{biome: string}} scene The room.
 */
export function exit(ctx, { x, y, w, h }, { biome }) {
  box(ctx, INK.k, x - 2, y - 2, w + 4, h + 2);
  for (let i = 0; i < 4; i++) box(ctx, [INK.l, INK.s, INK.d, INK.n][i], x + 2 + i * 2, y + 2 + i * 3, w - 4 - i * 4, 2);
  box(ctx, INK[BIOMES[biome].accent], x - 2, y - 2, w + 4, 1);
}

/**
 * The colour of a door leaf in the dungeon, for a door drawn ajar.
 *
 * @returns {string} CSS colour.
 */
export const leafColour = () => INK.b;
