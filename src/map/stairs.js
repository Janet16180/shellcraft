/**
 * The stairway between home and the dungeon: shown while the player leaves
 * their home for the rest of the system (daylight fades to torchlight) or
 * climbs back (the reverse).
 */

import { INK } from './palette.js';
import { SPRITES } from './sprites.js';
import { ART } from './layout.js';
import { box, drawSprite, tile } from './paint.js';

const SHAFT = { left: 96, right: 224 };
const STEP = 12;
const BANDS = 8;

function steps(ctx, offset) {
  for (let y = -STEP + offset; y < ART.height; y += STEP) {
    box(ctx, INK.s, SHAFT.left, y, SHAFT.right - SHAFT.left, STEP);
    box(ctx, INK.l, SHAFT.left, y, SHAFT.right - SHAFT.left, 3);
    box(ctx, INK.k, SHAFT.left, y + STEP - 1, SHAFT.right - SHAFT.left, 1);
  }
  box(ctx, INK.k, SHAFT.left - 2, 0, 2, ART.height);
  box(ctx, INK.k, SHAFT.right, 0, 2, ART.height);
}

function light(ctx, day) {
  const band = ART.height / BANDS;
  for (let i = 0; i < BANDS; i++) {
    const fromTop = i / BANDS;
    box(ctx, `rgba(255, 233, 168, ${(day * (1 - fromTop) * 0.55).toFixed(3)})`, 0, i * band, ART.width, band);
    box(ctx, `rgba(11, 10, 18, ${((1 - day) * fromTop * 0.6).toFixed(3)})`, 0, i * band, ART.width, band);
  }
}

/**
 * Draw the stairway at some point of the trip.
 *
 * @param {CanvasRenderingContext2D} ctx The 320 x 200 art canvas.
 * @param {{direction: 'descend'|'climb', progress: number}} trip Which way, and how far (0 to 1).
 * @param {number} t Animation clock in ms.
 */
export function drawStairs(ctx, { direction, progress }, t) {
  const down = direction === 'descend';
  const travelled = Math.round(progress * STEP * 8);
  const offset = (down ? STEP - (travelled % STEP) : travelled % STEP) % STEP;
  tile(ctx, SPRITES.brick, 0, 0, ART.width, ART.height);
  steps(ctx, offset);
  const day = down ? 1 - progress : progress;
  if (day < 0.7) {
    drawSprite(ctx, SPRITES.torch[Math.floor(t / 200) % 3], SHAFT.left - 14, 70);
    drawSprite(ctx, SPRITES.torch[(Math.floor(t / 200) + 2) % 3], SHAFT.right + 6, 70);
  }
  light(ctx, day);
}
