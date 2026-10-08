/**
 * The overworld painter: the player's home and the areas below it, in the
 * original game's outdoor style.
 */

import { BIOMES } from './biomes.js';
import { INK, NIGHT, TOON } from './palette.js';
import { ART } from './layout.js';
import { box } from './paint.js';
import { AREA_DECOR, AREA_AMBIENT } from './areadecor.js';
import { HALL_DECOR, HALL_AMBIENT } from './halldecor.js';
import { THRONE_DECOR, THRONE_AMBIENT } from './crowndecor.js';
import { PORTAL_DECOR, PORTAL_AMBIENT } from './portaldecor.js';
import { SMITHY_DECOR, SMITHY_AMBIENT } from './smithydecor.js';
import { TRAVEL_DECOR, TRAVEL_AMBIENT } from './traveldecor.js';

function tree(ctx, x, y) {
  box(ctx, '#5a3a1e', x + 6, y + 18, 4, 8);
  const shades = ['#2f6b2a', '#3b8034', '#2a5e25'];
  shades.forEach((shade, i) => {
    const w = 16 - i * 4;
    const top = y + 12 - i * 6;
    for (let r = 0; r < 8; r++) box(ctx, shade, x + 8 - Math.round((w * r) / 16), top + r, Math.max(2, Math.round((w * r) / 8)), 1);
  });
}

const trees = (ctx, wall) => [[0, wall + 8], [294, wall + 8], [4, 140], [292, 150]].forEach(([x, y]) => tree(ctx, x, y));

function shelves(ctx, wall) {
  const books = ['#b33a3a', '#3a6bb3', '#3ab37a', '#d9a13a', '#8a3ab3'];
  for (const x of [2, 302]) {
    box(ctx, '#3a2216', x, wall + 6, 16, 176 - wall - 6);
    for (let y = wall + 10; y < 170; y += 12) {
      for (let i = 0; i < 4; i++) box(ctx, books[(y + i * 3 + x) % 5], x + 2 + i * 3, y, 2, 9);
      box(ctx, '#24140c', x, y + 9, 16, 2);
    }
  }
}

function stalactites(ctx) {
  for (let x = 4; x < ART.width; x += 18) {
    const h = 5 + ((x * 7) % 9);
    box(ctx, '#15161f', x, 0, 4, h);
    box(ctx, '#15161f', x + 1, h, 2, 3);
  }
}

function awning(ctx) {
  for (let x = 0; x < ART.width; x += 16) {
    const stripe = (x / 16) % 2 ? '#e0524f' : '#fff1d0';
    box(ctx, stripe, x, 0, 16, 7);
    box(ctx, stripe, x + 2, 7, 12, 2);
  }
  for (const [x, y] of [[4, 150], [296, 140], [290, 84]]) {
    box(ctx, '#7a4a22', x, y, 18, 14);
    box(ctx, '#5a3514', x, y + 6, 18, 2);
    box(ctx, '#5a3514', x + 8, y, 2, 14);
  }
}

function junk(ctx, wall) {
  const colours = ['#5c4a3a', '#8a7a6a', '#4a5a4a', '#6a4a2a'];
  for (let i = 0; i < 22; i++) box(ctx, colours[i % 4], ((i * 53) % 312) + 2, wall + 8 + ((i * 29) % (190 - wall - 8)), 3 + (i % 4), 2 + (i % 3));
}

function rug(ctx) {
  box(ctx, '#7a2533', 100, 150, 120, 46);
  box(ctx, '#c9a26b', 104, 154, 112, 2);
  box(ctx, '#c9a26b', 104, 190, 112, 2);
  for (let x = 108; x < 212; x += 8) box(ctx, '#a8394b', x, 170, 4, 4);
}

function stream(ctx) {
  box(ctx, '#2f6fa8', 0, 146, ART.width, 12);
  box(ctx, '#3f86c4', 0, 148, ART.width, 8);
  box(ctx, '#7a5230', 136, 143, 48, 18);
  for (let x = 138; x < 184; x += 6) box(ctx, '#5c3c22', x, 143, 1, 18);
  box(ctx, '#9a6a40', 136, 143, 48, 2);
  box(ctx, '#9a6a40', 136, 159, 48, 2);
}

const STATIC_DECOR = {
  cottage: (ctx) => rug(ctx),
  forest: (ctx, wall) => trees(ctx, wall),
  camp: (ctx, wall) => trees(ctx, wall),
  river: (ctx, wall) => {
    trees(ctx, wall);
    stream(ctx);
  },
  cave: ctx => stalactites(ctx),
  library: (ctx, wall) => shelves(ctx, wall),
  market: ctx => awning(ctx),
  junk: (ctx, wall) => junk(ctx, wall),
  ...AREA_DECOR,
  ...HALL_DECOR,
  ...THRONE_DECOR,
  ...PORTAL_DECOR,
  ...SMITHY_DECOR,
  ...TRAVEL_DECOR,
};

/**
 * Paint what never moves in an overworld room: floor, wall and still decor.
 *
 * @param {CanvasRenderingContext2D} ctx The 320 x 200 art canvas.
 * @param {{biome: string, layout: import('./layout.js').Layout}} scene The room.
 */
export function background(ctx, { biome, layout }) {
  const look = BIOMES[biome];
  const { wall } = layout;
  box(ctx, look.floor, 0, wall, ART.width, ART.height - wall);
  box(ctx, look.wall[0], 0, 0, ART.width, wall);
  for (let y = 0; y < wall - 2; y += 8) {
    const offset = (y / 8) % 2 ? 8 : 0;
    for (let x = -offset; x < ART.width; x += 16) box(ctx, look.wall[1], x + 1, y + 1, 14, 6);
  }
  box(ctx, look.trim, 0, wall - 1, ART.width, 2);
  box(ctx, 'rgba(0, 0, 0, 0.25)', 0, wall + 1, ART.width, 4);
  STATIC_DECOR[biome]?.(ctx, wall);
}

function gate(ctx, t, open) {
  const x = 110;
  const w = 100;
  box(ctx, '#2a2d33', x - 6, 2, w + 12, 50);
  box(ctx, open ? `rgba(255, 220, 140, ${0.7 + 0.2 * Math.sin(t / 200)})` : '#0d0e12', x, 8, w, 44);
  const lift = open ? 38 : 0;
  for (let bx = x + 4; bx < x + w; bx += 10) box(ctx, '#8b8f99', bx, 8, 3, 44 - lift);
  for (let by = 14; by < 52 - lift; by += 10) box(ctx, '#8b8f99', x, by, w, 2);
  for (let i = 0; i < 5; i++) box(ctx, open ? TOON.y : '#6b707a', x + 12 + i * 18, 4, 6, 2);
}

function drips(ctx, t) {
  ctx.fillStyle = `rgba(140, 200, 255, ${0.5 + 0.4 * Math.sin(t / 500)})`;
  for (const [x, y] of [[14, 170], [300, 120], [30, 110]]) {
    ctx.fillRect(x, y, 3, 7);
    ctx.fillRect(x + 4, y + 3, 2, 4);
  }
}

function stars(ctx, t, wall) {
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + 0.35 * Math.sin(t / 300 + i)})`;
    ctx.fillRect((i * 97) % 316, 3 + ((i * 37) % (wall - 8)), 1, 1);
  }
}

function ripples(ctx, t) {
  const shift = Math.floor(t / 160) % 12;
  const underBridge = x => x > 132 && x < 186;
  for (let x = -12 + shift; x < ART.width; x += 12) {
    if (!underBridge(x)) box(ctx, '#9fd3f5', x, 150 + ((x + 300) % 3), 4, 1);
  }
}

/**
 * Paint what moves in an overworld room (drips, stars, water, the gate).
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{biome: string, layout: object, gateOpen: boolean}} scene The room.
 * @param {number} t Animation clock in ms (frozen at 0 with reduced motion).
 */
export function ambient(ctx, { biome, layout, gateOpen }, t) {
  if (biome === 'cave') drips(ctx, t);
  if (biome === 'tower') stars(ctx, t, layout.wall);
  if (biome === 'river') ripples(ctx, t);
  if (biome === 'gate') gate(ctx, t, gateOpen);
  AREA_AMBIENT[biome]?.(ctx, t, layout.wall);
  HALL_AMBIENT[biome]?.(ctx, t, layout.wall);
  THRONE_AMBIENT[biome]?.(ctx, t, layout.wall);
  PORTAL_AMBIENT[biome]?.(ctx, t, layout.wall);
  SMITHY_AMBIENT[biome]?.(ctx, t, layout.wall);
  TRAVEL_AMBIENT[biome]?.(ctx, t, layout.wall);
}

/**
 * Paint a door in the original style: a trimmed wooden door with a gold knob.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {import('./layout.js').Placed} door The door.
 * @param {{biome: string}} scene The room.
 */
export function door(ctx, { x, y, w, h, hidden }, { biome }) {
  const look = BIOMES[biome];
  ctx.globalAlpha = hidden ? 0.6 : 1;
  box(ctx, look.trim, x - 2, y - 2, w + 4, h + 2);
  box(ctx, look.door, x, y, w, h);
  for (let px = x + 5; px < x + w; px += 6) box(ctx, 'rgba(0, 0, 0, 0.35)', px, y + 2, 1, h - 2);
  box(ctx, TOON.y, x + w - 5, y + 18, 2, 2);
  ctx.globalAlpha = 1;
}

/**
 * Paint the exit. From home itself it is a stone stairway down into the
 * dungeon, lit from below; elsewhere a path out in the biome's trim colour.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{x: number, y: number, w: number, h: number}} exit The exit box.
 * @param {{biome: string, path: string, home: string}} scene The room.
 */
export function exit(ctx, { x, y, w, h }, { biome, path, home }) {
  const toDungeon = path === home;
  box(ctx, toDungeon ? INK.k : NIGHT, x, y, w, h);
  if (toDungeon) box(ctx, 'rgba(240, 138, 42, 0.35)', x + 4, y + h - 4, w - 8, 4);
  for (let i = 0; i < 4; i++) box(ctx, toDungeon ? [INK.l, INK.s, INK.d, INK.n][i] : BIOMES[biome].trim, x + 2 + i * 2, y + 2 + i * 3, w - 4 - i * 4, 2);
}

/**
 * The colour of a door leaf in this room, for a door drawn ajar.
 *
 * @returns {string} CSS colour.
 */
export const leafColour = () => TOON.k;
