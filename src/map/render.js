/**
 * One frame of the map: the room (or the stairway) painted at art size, then
 * scaled onto the screen canvas with the labels, bubbles, banner and fades.
 */

import { ART } from './layout.js';
import * as overworld from './overworld.js';
import * as dungeon from './dungeon.js';
import { drawItem, drawMore, drawPlayer, drawDaemon, drawParticles, padlockDoor } from './things.js';
import { drawLabels, drawBubbles, drawBanner, drawVeil } from './overlay.js';
import { drawStairs } from './stairs.js';
import { NIGHT, INK } from './palette.js';
import { FLASH_MS } from './stage.js';

const PAINTERS = { overworld, dungeon };
const BANNER_MS = 2800;

function background(stage, scene) {
  const { state, bg } = stage;
  const key = `${scene.biome}:${scene.layout.wall}`;
  if (key !== state.bgKey) {
    const ctx = bg.getContext('2d');
    ctx.clearRect(0, 0, ART.width, ART.height);
    PAINTERS[scene.realm].background(ctx, scene);
    state.bgKey = key;
  }
  return bg;
}

function paintRoom(stage, t, now) {
  const { ax, state } = stage;
  const { scene } = state;
  const painter = PAINTERS[scene.realm];
  const { layout } = scene;
  ax.drawImage(background(stage, scene), 0, 0);
  painter.ambient(ax, scene, t);
  for (const door of layout.doors) {
    painter.door(ax, door, scene, t);
    if (door.locked) padlockDoor(ax, door);
  }
  if (layout.moreDoors) drawMore(ax, layout.moreDoors, 'door');
  layout.items.forEach((item, i) => drawItem(ax, item, scene.biome, t, i));
  if (layout.moreItems) drawMore(ax, layout.moreItems, 'item');
  if (layout.exit) painter.exit(ax, layout.exit, scene, t);
  if (!scene.daemon) return;
  state.daemon.x = 262 + Math.round(Math.sin(t / 700) * 10);
  state.daemon.y = 70 + Math.round(Math.cos(t / 500) * 6);
  drawDaemon(ax, state.daemon, now < state.daemon.flashUntil);
}

function paintArt(stage, t, now) {
  const { ax, state, motion } = stage;
  ax.clearRect(0, 0, ART.width, ART.height);
  if (state.trip) drawStairs(ax, state.trip, t);
  else if (state.scene) paintRoom(stage, t, now);
  if (state.scene) drawPlayer(ax, state.player, t);
  drawParticles(ax, motion.particles);
  if (state.scene && !state.trip) PAINTERS[state.scene.realm].lighting?.(ax, t);
}

function bannerAlpha(banner, now, reducedMotion) {
  const p = (now - banner.start) / BANNER_MS;
  return reducedMotion ? 1 : Math.max(0, Math.min(1, p / 0.15, (1 - p) / 0.2));
}

function paintScreen(stage, now) {
  const { g, view, state, ax } = stage;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = NIGHT;
  g.fillRect(0, 0, view.width, view.height);
  g.imageSmoothingEnabled = false;
  const shaking = !stage.reducedMotion && now < state.shakeUntil;
  const jitter = shaking ? Math.round((Math.random() * 2 - 1) * 2 * view.scale) : 0;
  g.drawImage(ax.canvas, view.ox + jitter, view.oy, ART.width * view.scale, ART.height * view.scale);
  if (state.scene && !state.trip) drawLabels(g, view, state.scene.layout, state.hover);
  state.bubbles = state.bubbles.filter(b => b.until > now);
  if (state.banner && now - state.banner.start >= BANNER_MS) state.banner = null;
  const anchors = { player: { x: state.player.x, y: state.player.y - 28 }, daemon: { x: state.daemon.x + 12, y: state.daemon.y - 4 } };
  drawBubbles(g, view, state.bubbles, anchors);
  if (state.banner) drawBanner(g, view, state.banner, bannerAlpha(state.banner, now, stage.reducedMotion));
  drawVeil(g, view, Math.max(0, ((state.flashUntil - now) / FLASH_MS) * 0.35), INK.e);
  drawVeil(g, view, state.fade);
}

/**
 * Advance the motion clock and paint one frame.
 *
 * @param {import('./stage.js').Stage} stage The stage.
 * @param {number} now The frame time in ms (performance.now() clock).
 */
export function paintFrame(stage, now) {
  stage.motion.step(now);
  const t = stage.reducedMotion ? 0 : now;
  paintArt(stage, t, now);
  paintScreen(stage, now);
}
