/**
 * The pictures of the ending, painted on a 320 x 200 canvas like the map:
 * the travel camp at dusk, the hero walking down the stairway into the
 * kernel, and the kernel's chamber, where Ring Zero's ring glows. Everything
 * moves with t; a frozen t gives a still frame.
 */

import { INK } from '../map/palette.js';
import { SPRITES } from '../map/sprites.js';
import { ART } from '../map/layout.js';
import { box, drawSprite, tile } from '../map/paint.js';
import { background, ambient } from '../map/overworld.js';
import { drawPlayer } from '../map/things.js';

/** How long the walk down the stairs takes, in ms. */
export const DESCENT_MS = 5200;
// The still frame of the walk, for reduced motion: the hero halfway down.
const STILL_PROGRESS = 0.55;
const CAMP = { biome: 'departure', layout: { wall: 52 }, gateOpen: false };
const STEP = { w: 18, h: 9, count: 13, left: 18, top: 62 };
const DUSK = ['#2a1f45', '#5a3560', '#b85e58', '#f0a860'];
const RING = { cx: 160, top: 46, scale: 4 };

function hero(ctx, x, y, t, walking) {
  drawPlayer(ctx, { x, y, walking }, t);
  drawSprite(ctx, SPRITES.bundle, x - 15, y - 17);
}

function camp(ctx, t) {
  background(ctx, CAMP);
  ambient(ctx, CAMP, t);
  hero(ctx, 236, 186, t, false);
}

function stairTop(x) {
  const i = Math.max(0, Math.min(STEP.count - 1, Math.floor((x - STEP.left) / STEP.w)));
  return STEP.top + i * STEP.h;
}

function shaft(ctx) {
  tile(ctx, SPRITES.brick, 0, 0, ART.width, ART.height);
  DUSK.forEach((colour, i) => box(ctx, colour, 6, 6 + i * 10, 46, 10));
  box(ctx, INK.k, 4, 4, 50, 2);
  box(ctx, INK.k, 4, 4, 2, 44);
  box(ctx, INK.k, 52, 4, 2, 44);
  box(ctx, INK.s, 4, 46, 50, 3);
}

function stairs(ctx) {
  for (let i = 0; i < STEP.count; i++) {
    const x = STEP.left + i * STEP.w;
    const y = STEP.top + i * STEP.h;
    box(ctx, INK.d, x, y, STEP.w, ART.height - y);
    box(ctx, INK.l, x, y, STEP.w, 2);
    box(ctx, INK.s, x, y + 2, STEP.w, 2);
    box(ctx, INK.k, x, y, 1, STEP.h);
  }
  box(ctx, INK.d, 0, STEP.top, STEP.left, ART.height - STEP.top);
  box(ctx, INK.l, 0, STEP.top, STEP.left, 2);
}

// The arch at the foot of the stairs, open on the kernel's light.
function arch(ctx, t) {
  const x = 262;
  const y = 120;
  const breath = 0.5 + 0.5 * Math.sin(t / 600);
  box(ctx, INK.k, x - 4, y - 4, 58, 84);
  box(ctx, INK.s, x - 2, y - 2, 54, 82);
  box(ctx, INK.p, x, y, 50, 80);
  ctx.globalAlpha = 0.5 + 0.3 * breath;
  box(ctx, INK.v, x + 6, y + 6, 38, 74);
  box(ctx, INK.y, x + 16, y + 20, 18, 60);
  ctx.globalAlpha = 1;
  drawSprite(ctx, SPRITES.ring, x + 20, y + 28);
}

function light(ctx) {
  for (let i = 0; i < 8; i++) {
    const x = i * 40;
    box(ctx, `rgba(240, 168, 96, ${(0.14 * (1 - i / 8)).toFixed(3)})`, x, 0, 40, ART.height);
    box(ctx, `rgba(11, 10, 18, ${(0.05 * i).toFixed(3)})`, x, 0, 40, ART.height);
  }
}

function descent(ctx, t, still) {
  const progress = still ? STILL_PROGRESS : Math.min(1, t / DESCENT_MS);
  shaft(ctx);
  stairs(ctx);
  light(ctx);
  for (const [x, y] of [[96, 40], [186, 70]]) drawSprite(ctx, SPRITES.torch[Math.floor(t / 200 + x) % 3], x, y);
  arch(ctx, t);
  const x = STEP.left + 10 + progress * (STEP.w * (STEP.count - 1));
  hero(ctx, x, stairTop(x) + 1, t, progress < 1);
}

function pool(ctx, cx, cy, rx, ry, colour) {
  for (let r = -ry; r <= ry; r++) {
    const half = Math.round(rx * Math.sqrt(1 - (r * r) / (ry * ry)));
    box(ctx, colour, cx - half, cy + r, 2 * half, 1);
  }
}

function ringGlow(ctx, t) {
  const { cx, top, scale } = RING;
  const breath = 0.5 + 0.5 * Math.sin(t / 700);
  for (let r = 4; r > 0; r--) {
    ctx.globalAlpha = 0.07 + 0.04 * breath;
    pool(ctx, cx, top + 20, 18 + r * 9, 16 + r * 8, r > 2 ? INK.v : INK.y);
  }
  ctx.globalAlpha = 1;
  drawSprite(ctx, SPRITES.ring, cx - 5 * scale, top + Math.round(Math.sin(t / 500) * 2), { scale });
  for (let i = 0; i < 6; i++) {
    const p = ((t / 3000) + i / 6) % 1;
    ctx.globalAlpha = 0.9 * (1 - p);
    box(ctx, i % 2 ? INK.y : INK.v, cx - 30 + i * 12 + Math.round(Math.sin(t / 400 + i) * 3), 130 - Math.round(p * 100), 2, 2);
  }
  ctx.globalAlpha = 1;
}

function kernel(ctx, t) {
  tile(ctx, SPRITES.brick, 0, 0, ART.width, 120);
  tile(ctx, SPRITES.flagstone, 0, 120, ART.width, 80);
  box(ctx, INK.k, 0, 118, ART.width, 3);
  box(ctx, 'rgba(11, 10, 18, 0.2)', 0, 0, ART.width, ART.height);
  for (const x of [40, 272]) drawSprite(ctx, SPRITES.torch[Math.floor(t / 200 + x) % 3], x, 54);
  box(ctx, INK.k, 128, 96, 64, 34);
  box(ctx, INK.s, 130, 98, 60, 30);
  box(ctx, INK.l, 130, 98, 60, 3);
  box(ctx, INK.d, 136, 108, 48, 2);
  ringGlow(ctx, t);
  hero(ctx, 124, 168, t, false);
}

const SCENES = { camp, descent, kernel };

/**
 * Paint one picture of the ending.
 *
 * @param {CanvasRenderingContext2D} ctx The 320 x 200 canvas.
 * @param {'camp'|'descent'|'kernel'} scene Which picture.
 * @param {number} t Time since the step opened, in ms.
 * @param {boolean} still Reduced motion: the walk shows the hero halfway down, standing.
 * @throws {Error} If the scene is unknown.
 */
export function drawEndScene(ctx, scene, t, still) {
  if (!Object.hasOwn(SCENES, scene)) throw new Error(`unknown ending scene: ${scene}`);
  ctx.imageSmoothingEnabled = false;
  SCENES[scene](ctx, t, still);
}
