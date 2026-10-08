/**
 * How the player's jobs look: a small green worker at an anvil per job, on a
 * dark plaque in the picture's corner. It swings its hammer while its job
 * runs and sleeps, grey, with a rising "z", while the job is stopped.
 */

import { INK } from './palette.js';
import { box, drawSprite } from './paint.js';
import { jobFrame, JOB_ROW } from './jobs.js';

const ink = rows => ({ pal: 'ink', rows });

/** The worker's frames, at its anvil: hammer up, hammer down on the anvil, and asleep with the hammer laid on it. */
export const JOB_SPRITES = {
  up: ink([
    '.k...k.kkkk.',
    '.kk.kk.kllk.',
    'kGGGGGkkkkk.',
    'kGyGyGk.b...',
    'kGGGGGk.b...',
    '.kgggkGGb...',
    'kGGGGGk.....',
    'kGGGGGk.llll',
    '.kGkGk...ss.',
    '.k...k..ssss',
  ]),
  down: ink([
    '.k...k......',
    '.kk.kk......',
    'kGGGGGk.....',
    'kGyGyGk.....',
    'kGGGGGk..kk.',
    '.kgggkGGbll.',
    'kGGGGGk..kk.',
    'kGGGGGk.llll',
    '.kGkGk...ss.',
    '.k...k..ssss',
  ]),
  asleep: ink([
    '............',
    '.k...k......',
    '.kk.kk......',
    'kGGGGGk.....',
    'kGGGGGk.....',
    'kGkGkGk.....',
    '.kgggk..bbkl',
    'kGGGGGk.llll',
    'kGGGGGk..ss.',
    '.k...k..ssss',
  ]),
};

const ASLEEP = { G: INK.l, g: INK.s };
const PLAQUE = { back: 'rgba(11, 10, 18, 0.62)', edge: INK.d };
const SCALE = 2;
const SPRITE_X = 1;
// Workers side by side swing out of step.
const PHASE_MS = 170;
const Z_MS = 1600;

/** Particle colours for a job's end. */
export const JOB_BURST = [INK.G, INK.y, INK.w, INK.g];

/**
 * The centre of a badge's worker, where its end bursts.
 *
 * @param {{x: number, y: number}} badge The badge.
 * @returns {{x: number, y: number}} Art pixels.
 */
export function workerCentre({ x, y }) {
  return { x: x + SPRITE_X + 12, y: y + JOB_ROW.h / 2 };
}

function drawZ(ctx, x, y, alpha) {
  ctx.globalAlpha = alpha;
  box(ctx, INK.w, x, y, 4, 1);
  box(ctx, INK.w, x + 2, y + 1, 1, 1);
  box(ctx, INK.w, x + 1, y + 2, 1, 1);
  box(ctx, INK.w, x, y + 3, 4, 1);
  ctx.globalAlpha = 1;
}

function drawWorker(ctx, { id, x, y, state }, t) {
  const frame = jobFrame(state, t + id * PHASE_MS);
  const sx = x + SPRITE_X;
  const sy = y + 1;
  drawSprite(ctx, JOB_SPRITES[frame], sx, sy, { scale: SCALE, colours: frame === 'asleep' ? ASLEEP : undefined });
  if (frame === 'down') {
    box(ctx, INK.y, sx + 23, sy + 8, 1, 1);
    box(ctx, INK.o, sx + 15, sy + 9, 1, 1);
  }
  if (frame === 'asleep') {
    const p = (t / Z_MS) % 1;
    drawZ(ctx, sx + 13, sy + 6 - Math.round(p * 6), 1 - p * 0.7);
  }
}

/**
 * Draw the job row: a plaque, then a worker per badge.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{badges: import('./jobs.js').JobBadge[], more: number}} jobs The row, from placeJobs.
 * @param {number} t Animation clock in ms (0 with reduced motion).
 */
export function drawJobs(ctx, { badges, more }, t) {
  if (badges.length === 0) return;
  const w = badges.length * JOB_ROW.w + (more ? 16 : 0);
  const { x, y, h } = JOB_ROW;
  box(ctx, PLAQUE.edge, x - 1, y - 1, w + 2, h + 2);
  box(ctx, PLAQUE.back, x, y, w, h);
  for (const badge of badges) drawWorker(ctx, badge, t);
}
