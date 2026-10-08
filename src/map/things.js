/**
 * What stands in any room, whatever the realm: items, locks and chains, the
 * "+N" markers, the hero, the Shadow Daemon and particles.
 */

import { GEMS, INK, TOON, DAEMON, PEOPLE } from './palette.js';
import { SPRITES } from './sprites.js';
import { itemKind } from './room.js';
import { box, drawSprite } from './paint.js';

const ITEM_SCALE = 2;

function chain(ctx, x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 2) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    box(ctx, (i / 2) % 2 ? INK.l : INK.s, x, y, 2, 2);
  }
}

/**
 * Chain and padlock a door the player may not enter.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{x: number, y: number, w: number, h: number}} door The door box.
 */
export function padlockDoor(ctx, { x, y, w, h }) {
  chain(ctx, x, y + 4, x + w - 2, y + h - 6);
  chain(ctx, x + w - 2, y + 4, x, y + h - 6);
  drawSprite(ctx, SPRITES.padlock, x + w / 2 - 7, y + h / 2 - 8, { scale: 2 });
}

const QUERY = ['.lll.', 'l...l', '....l', '..ll.', '..l..', '.....', '..l..'];

/**
 * Show a door the player may enter but not list (x without r): it stands ajar
 * on darkness, with a question mark where the room should be.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{x: number, y: number, w: number, h: number}} door The door box.
 * @param {string} leaf Colour of the door leaf, swung open against the frame.
 */
export function darkDoor(ctx, { x, y, w, h }, leaf) {
  box(ctx, INK.k, x + 1, y + 2, w - 2, h - 2);
  box(ctx, leaf, x + 1, y + 2, 4, h - 2);
  box(ctx, 'rgba(0, 0, 0, 0.4)', x + 4, y + 2, 1, h - 2);
  const left = x + Math.round(w / 2) - 3;
  const top = y + Math.round(h / 2) - 7;
  QUERY.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === 'l') box(ctx, INK.l, left + c * 2 - 1, top + r * 2, 2, 2);
  }));
}

/**
 * Draw a person of the realm (the hero's sprite in their colours) standing
 * beside the door of their home.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{x: number, y: number, w: number, h: number}} door The door box.
 * @param {string} name A key of PEOPLE.
 * @param {number} t Animation clock in ms.
 */
export function drawResident(ctx, { x, y, w, h }, name, t) {
  const left = x + w - 2;
  const top = y + h - 16 + Math.round(Math.sin(t / 340 + x) * 0.6);
  box(ctx, 'rgba(0, 0, 0, 0.3)', left + 2, top + 23, 16, 3);
  drawSprite(ctx, SPRITES.player, left, top, { scale: 2, colours: PEOPLE[name] });
  drawSprite(ctx, SPRITES.legs[0], left, top + 22, { scale: 2 });
}

function chainItem(ctx, x, y) {
  chain(ctx, x - 3, y + 10, x + 17, y + 4);
  drawSprite(ctx, SPRITES.padlock, x + 10, y + 8);
}

function sprite(kind, item, t) {
  const gem = Object.keys(GEMS).find(word => item.name.toLowerCase().includes(word)) ?? 'opal';
  const potion = item.runnable ? {} : { g: TOON.G, l: '#c4c8d4' };
  const choices = {
    gem: [SPRITES.gem, GEMS[gem]],
    key: [SPRITES.key],
    fire: [SPRITES.fire[Math.floor(t / 180) % 2]],
    potion: [SPRITES.potion, potion],
    book: [SPRITES.book],
    void: [SPRITES.void],
    scroll: [SPRITES.scroll],
  };
  return choices[kind];
}

/**
 * Draw an item: its sprite bobbing gently, a glow under anything the player
 * may run, a twinkle on hidden files, a wax seal in its owner's colour when a
 * person of the realm owns it, chains on anything they may not read.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {import('./layout.js').Placed} item The item.
 * @param {string} biome Biome id of the room.
 * @param {number} t Animation clock in ms.
 * @param {number} i Index, to desynchronize the bobbing.
 */
export function drawItem(ctx, item, biome, t, i) {
  const bob = Math.round(Math.sin(t / 450 + i) * 1.2);
  const x = item.x;
  const y = item.y + bob;
  const [image, colours] = sprite(itemKind(item, biome), item, t);
  drawSprite(ctx, image, x, y, { scale: ITEM_SCALE, alpha: item.hidden ? 0.6 : 1, colours });
  if (item.runnable) box(ctx, `rgba(155, 225, 93, ${0.25 + 0.2 * Math.sin(t / 250)})`, x - 2, y + 15, 20, 2);
  if (item.hidden && Math.sin(t / 200 + i * 2) > 0.6) {
    box(ctx, INK.w, x + 14, y - 2, 1, 3);
    box(ctx, INK.w, x + 13, y - 1, 3, 1);
  }
  if (Object.hasOwn(PEOPLE, item.owner ?? '')) seal(ctx, x, y + 11, PEOPLE[item.owner].h);
  if (item.locked) chainItem(ctx, x, y);
}

function seal(ctx, x, y, colour) {
  box(ctx, INK.k, x - 1, y, 6, 4);
  box(ctx, INK.k, x, y - 1, 4, 6);
  box(ctx, colour, x, y, 4, 4);
  box(ctx, 'rgba(255, 255, 255, 0.5)', x, y, 1, 1);
}

/**
 * Ring an entry in pulsing gold, to point the player at it.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{x: number, y: number, w: number, h: number}} at The entry's box.
 * @param {number} t Animation clock in ms (a steady ring when frozen at 0).
 */
export function drawFocus(ctx, { x, y, w, h }, t) {
  const colour = Math.floor(t / 300) % 2 ? INK.w : INK.y;
  const [left, top, right, bottom] = [x - 4, y - 4, x + w + 3, y + h + 3];
  box(ctx, colour, left, top, right - left + 1, 1);
  box(ctx, colour, left, bottom, right - left + 1, 1);
  box(ctx, colour, left, top, 1, bottom - top);
  box(ctx, colour, right, top, 1, bottom - top);
}

/**
 * Draw the sign that stands for doors or items that did not fit.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{cx: number, y: number}} marker Where the sign goes.
 * @param {'door'|'item'} kind Doors get a tall sign on the wall, items a small one on the floor.
 */
export function drawMore(ctx, { cx, y }, kind) {
  const [w, h, top] = kind === 'door' ? [20, 14, y + 8] : [18, 12, y + 2];
  box(ctx, INK.k, cx - w / 2 - 1, top - 1, w + 2, h + 2);
  box(ctx, INK.b, cx - w / 2, top, w, h);
  box(ctx, INK.r, cx - w / 2, top + h - 2, w, 2);
  if (kind === 'item') box(ctx, INK.r, cx - 1, top + h, 2, 4);
}

/**
 * Draw the hero, standing on (x, y) with their feet.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{x: number, y: number, walking: boolean}} player Position and pose.
 * @param {number} t Animation clock in ms.
 */
export function drawPlayer(ctx, { x, y, walking }, t) {
  const left = Math.round(x - 10);
  const top = Math.round(y - 24) + (walking ? 0 : Math.round(Math.sin(t / 300)));
  box(ctx, 'rgba(0, 0, 0, 0.3)', left + 2, top + 23, 16, 3);
  drawSprite(ctx, SPRITES.player, left, top, { scale: 2 });
  drawSprite(ctx, SPRITES.legs[walking ? Math.floor(t / 120) % 2 : 0], left, top + 22, { scale: 2 });
}

/**
 * Draw the Shadow Daemon drifting at (x, y); it flashes red when hit.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {{x: number, y: number}} at Top-left corner.
 * @param {boolean} flash Whether it is flashing.
 */
export function drawDaemon(ctx, { x, y }, flash) {
  const colours = { k: flash ? DAEMON.eye : DAEMON.body, r: flash ? INK.w : DAEMON.eye, w: DAEMON.glow };
  drawSprite(ctx, SPRITES.ghost, x, y, { scale: 2, alpha: 0.9, colours });
  box(ctx, 'rgba(155, 90, 255, 0.25)', x + 4, y + 26, 16, 2);
}

/**
 * Draw particles as 2 x 2 squares fading out at the end of their life.
 *
 * @param {CanvasRenderingContext2D} ctx The art canvas.
 * @param {import('./motion.js').Particle[]} particles The particles.
 */
export function drawParticles(ctx, particles) {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 20);
    box(ctx, p.colour, Math.round(p.x), Math.round(p.y), 2, 2);
  }
  ctx.globalAlpha = 1;
}
