/**
 * How process creatures look: Ring Zero's imp, an armoured imp for processes
 * that shrug off a polite kill, and the Shadow Daemon from things.js.
 */

import { INK, TOON, DAEMON } from './palette.js';
import { box, drawSprite } from './paint.js';
import { drawDaemon } from './things.js';

const ink = rows => ({ pal: 'ink', rows });

/** The creature sprites, by kind (the daemon uses the ghost from sprites.js). */
export const CREATURE_SPRITES = {
  imp: ink([
    '..w......w..',
    '..kw....wk..',
    '..kekkkkek..',
    '.keeeeeeeek.',
    '.keeyeeyeek.',
    '.keekwwkeek.',
    '..keeeeeek..',
    '..kkeeeekk..',
    '.kekeeeekek.',
    '.kk.keek.kk.',
    '...keeeek...',
    '...kk..kk...',
  ]),
  armoured: ink([
    '...w......w...',
    '...kw....wk...',
    '..kllllllllk..',
    '.kllwllllllsk.',
    '.klkkykkykksk.',
    '.kssssssssssk.',
    '..keekwwkeek..',
    'kkkkkksllskek.',
    'kuyuk.ksslkek.',
    'kyyyk.kslsk.k.',
    'kuyuk.kssskk..',
    '.kuk.keeeek...',
    '..k..kk..kk...',
  ]),
};

const FLASH = { e: INK.w, s: INK.w, l: INK.w, u: INK.e };

/** Particle colours for a creature's end, by kind. */
export const CREATURE_BURST = {
  daemon: [DAEMON.body, DAEMON.eye, DAEMON.glow, TOON.y],
  armoured: [INK.l, INK.s, INK.e, INK.y],
  imp: [INK.e, INK.b, INK.y, INK.w],
};

/**
 * Draw a creature centred on (x, y); it flashes white when hit.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{kind: 'daemon'|'armoured'|'imp', x: number, y: number}} creature What and where.
 * @param {boolean} flash Whether it is flashing.
 */
export function drawCreature(ctx, { kind, x, y }, flash) {
  if (kind === 'daemon') {
    drawDaemon(ctx, { x: x - 12, y: y - 12 }, flash);
    return;
  }
  const sprite = CREATURE_SPRITES[kind];
  const w = sprite.rows[0].length * 2;
  const h = sprite.rows.length * 2;
  box(ctx, 'rgba(0, 0, 0, 0.3)', x - 8, y + 15, 16, 2);
  drawSprite(ctx, sprite, x - w / 2, y - h / 2, { scale: 2, colours: flash ? FLASH : undefined });
}
