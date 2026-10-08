/**
 * The map key: one picture of each thing the map draws, painted with the same
 * painters as the rooms, so the legend under the map shows what the player
 * really sees.
 */

import * as overworld from './overworld.js';
import * as dungeon from './dungeon.js';
import { drawItem, drawPlayer, padlockDoor, darkDoor } from './things.js';
import { makeCanvas } from './paint.js';
import { drawCreature } from './creatureart.js';
import { joinPath } from '../backend/tree.js';
import { PLAYER } from '../backend/player.js';

const HOME = PLAYER.home;
const FOREST = joinPath(HOME, 'forest');
const COTTAGE = { biome: 'cottage', path: FOREST, home: HOME };
const DOOR = { x: 2, y: 2, w: 22, h: 34, hidden: false, path: FOREST };
const ITEM = { x: 4, y: 3, name: 'readme.txt', path: joinPath(HOME, 'readme.txt'), hidden: false, locked: false, runnable: false };
const EXIT = { x: 2, y: 2, w: 28, h: 14 };

const KEYS = {
  hero: { w: 22, h: 28, paint: ctx => drawPlayer(ctx, { x: 11, y: 26, walking: false }, 0) },
  door: { w: 26, h: 36, paint: ctx => overworld.door(ctx, DOOR, COTTAGE) },
  locked: {
    w: 26, h: 36,
    paint: ctx => {
      overworld.door(ctx, DOOR, COTTAGE);
      padlockDoor(ctx, DOOR);
    },
  },
  'dark-door': {
    w: 26, h: 36,
    paint: ctx => {
      overworld.door(ctx, DOOR, COTTAGE);
      darkDoor(ctx, DOOR, overworld.leafColour(COTTAGE));
    },
  },
  exit: { w: 32, h: 18, paint: ctx => overworld.exit(ctx, EXIT, COTTAGE) },
  'stairs-down': { w: 32, h: 18, paint: ctx => overworld.exit(ctx, EXIT, { ...COTTAGE, path: HOME }) },
  item: { w: 24, h: 22, paint: ctx => drawItem(ctx, ITEM, 'cottage', 0, 0) },
  chained: { w: 24, h: 22, paint: ctx => drawItem(ctx, { ...ITEM, locked: true }, 'cottage', 0, 0) },
  runnable: { w: 24, h: 22, paint: ctx => drawItem(ctx, { ...ITEM, name: 'spell.sh', runnable: true }, 'cottage', 0, 0) },
  hidden: { w: 24, h: 22, paint: ctx => drawItem(ctx, { ...ITEM, name: '.secret_map', hidden: true }, 'cottage', 200, 0) },
  'dungeon-door': { w: 28, h: 36, paint: ctx => dungeon.door(ctx, { ...DOOR, x: 3, path: '/etc' }, { home: HOME }) },
  'home-door': { w: 36, h: 50, paint: ctx => dungeon.door(ctx, { ...DOOR, x: 7, path: HOME }, { home: HOME }) },
  imp: { w: 26, h: 28, paint: ctx => drawCreature(ctx, { kind: 'imp', x: 13, y: 12 }, false) },
  'armoured-imp': { w: 30, h: 30, paint: ctx => drawCreature(ctx, { kind: 'armoured', x: 15, y: 14 }, false) },
  daemon: { w: 26, h: 30, paint: ctx => drawCreature(ctx, { kind: 'daemon', x: 13, y: 13 }, false) },
};

/** The kinds drawKey knows, in a sensible legend order. */
export const KEY_KINDS = Object.keys(KEYS);

/**
 * Paint one key picture centred on a canvas, scaled up without smoothing.
 * Kinds: hero, door, locked (a padlocked door), dark-door (a door ajar on darkness:
 * x without r), exit (..), stairs-down (.. from
 * home, into the dungeon), item (a file), chained (a file you may not read),
 * runnable (a file you may run), hidden (a dotfile), dungeon-door (a directory
 * outside your home), home-door (the door back into your home, from /home), imp (a
 * process), armoured-imp (a process that ignores a polite kill), daemon (the Shadow Daemon).
 *
 * @param {HTMLCanvasElement} canvas The canvas to paint on; its pixel size is used as is.
 * @param {string} kind One of KEY_KINDS.
 * @throws {Error} If the kind is unknown.
 */
export function drawKey(canvas, kind) {
  if (!(kind in KEYS)) throw new Error(`unknown map key kind: ${kind}`);

  const key = KEYS[kind];
  const art = makeCanvas(key.w, key.h);
  key.paint(art.getContext('2d'));
  const fit = Math.min(canvas.width / key.w, canvas.height / key.h);
  const scale = fit >= 2 ? Math.floor(fit) : fit;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const w = Math.round(key.w * scale);
  const h = Math.round(key.h * scale);
  ctx.drawImage(art, Math.round((canvas.width - w) / 2), Math.round((canvas.height - h) / 2), w, h);
}
