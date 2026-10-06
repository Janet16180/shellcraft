/**
 * Small drawing helpers shared by every painter: sprites rendered once and
 * cached, tiled patterns, filled boxes.
 */

import { PALETTES } from './palette.js';

const rendered = new WeakMap();

/**
 * A fresh canvas of a given size.
 *
 * @param {number} width Pixels.
 * @param {number} height Pixels.
 * @returns {HTMLCanvasElement} The canvas.
 */
export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function render(sprite, colours) {
  const pal = { ...PALETTES[sprite.pal], ...colours };
  const canvas = makeCanvas(sprite.rows[0].length, sprite.rows.length);
  const ctx = canvas.getContext('2d');
  sprite.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = pal[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return canvas;
}

/**
 * A sprite as an image, rendered on first use and cached per colour override.
 *
 * @param {{pal: string, rows: string[]}} sprite The sprite.
 * @param {Record<string, string>} [colours] Letters to recolour.
 * @returns {HTMLCanvasElement} The image, one pixel per cell.
 */
export function spriteImage(sprite, colours) {
  const key = colours ? JSON.stringify(colours) : '';
  if (!rendered.has(sprite)) rendered.set(sprite, new Map());
  const byColour = rendered.get(sprite);
  if (!byColour.has(key)) byColour.set(key, render(sprite, colours));
  return byColour.get(key);
}

/**
 * Draw a sprite with its top-left corner at (x, y).
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {{pal: string, rows: string[]}} sprite The sprite.
 * @param {number} x Left.
 * @param {number} y Top.
 * @param {{scale?: number, alpha?: number, colours?: Record<string, string>, flip?: boolean}} [opts]
 *   Whole-number scale, opacity, recolouring, and a left-right mirror.
 */
export function drawSprite(ctx, sprite, x, y, { scale = 1, alpha = 1, colours, flip = false } = {}) {
  const image = spriteImage(sprite, colours);
  const w = image.width * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x) + (flip ? w : 0), Math.round(y));
  ctx.scale(flip ? -1 : 1, 1);
  ctx.drawImage(image, 0, 0, w, image.height * scale);
  ctx.restore();
}

/**
 * Fill a rectangle with a sprite repeated from the canvas origin.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {{pal: string, rows: string[]}} sprite The tile.
 * @param {number} x Left.
 * @param {number} y Top.
 * @param {number} w Width.
 * @param {number} h Height.
 */
export function tile(ctx, sprite, x, y, w, h) {
  ctx.fillStyle = ctx.createPattern(spriteImage(sprite), 'repeat');
  ctx.fillRect(x, y, w, h);
}

/**
 * Fill a rectangle with a colour.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {string} colour CSS colour.
 * @param {number} x Left.
 * @param {number} y Top.
 * @param {number} w Width.
 * @param {number} h Height.
 */
export function box(ctx, colour, x, y, w, h) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
}
