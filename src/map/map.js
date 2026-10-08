/**
 * The map: the working directory drawn as a room on a canvas. It draws only
 * from an Observation plus the effects of the last line, and never asks the
 * shell anything.
 *
 * The picture is painted at 320 x 200 art pixels, scaled up without
 * smoothing, and the names are written over it at screen resolution in IBM
 * Plex Mono.
 */

import { pickAt, STAND } from './layout.js';
import { picksOf } from './room.js';
import { createStage, settle, fitCanvas, say, showBanner, shake, flash, burstAt, creaturesWithKey } from './stage.js';
import { paintFrame } from './render.js';
import { journey } from './journey.js';
import { INK, TOON } from './palette.js';
import { SLOTS } from './creatures.js';
import { CREATURE_BURST } from './creatureart.js';

export { biomeFor, placeOf } from './biomes.js';
export { layoutRoom } from './layout.js';
export { describeRoom } from './describe.js';
export { drawKey, KEY_KINDS } from './key.js';

const SPARKLE = [INK.y, INK.G, INK.w];
const DUST = [INK.l, INK.s, INK.w];

/**
 * The map animates travel, created, removed, reveal, unknown-command, guardian,
 * proc-defied {key} (that creature flashes), proc-killed {key} (it bursts),
 * daemon-defied and daemon-killed (the same, for key 'daemon') and
 * gate-opened, and ignores other kinds. A creature whose process vanished
 * between observations always bursts a little.
 *
 * @typedef {import('../game/effects.js').Effect} Effect
 */

/**
 * @typedef {object} GameMap
 * @property {(obs: object) => void} show Draw the room at obs.cwd at once, as
 *   after loading a world (boot, chapter start, restore): it forgets revealed
 *   hidden files and the open gate.
 * @property {(effects: Effect[], obs: object) => Promise<void>} play Animate
 *   the effects of a line, then settle on obs. A newer call cuts an older one short.
 * @property {(text: string, who?: string) => void} say Show a speech bubble over the player (default)
 *   or over the creature with that process key ('daemon', 'stubborn', ...).
 * @property {(title: string, sub?: string) => void} banner Show a banner across the room (the title in the pixel font).
 * @property {(name: string|null) => void} focus Ring the door or item with this name ('..' for the exit)
 *   in pulsing gold while it is on show; null clears it. show() clears it too.
 * @property {() => {kind: 'door'|'item'|'exit', name: string, path: string, locked: boolean}[]} picks
 *   Everything the player could pick in the room on show (also what the picture folds into "+N"),
 *   for keyboard play.
 * @property {() => void} destroy Stop drawing and listening.
 */

const BEFORE = {
  removed: (stage, e, layout) => burstAt(stage, e.path, DUST, layout),
  reveal: (stage, e) => stage.state.revealed.add(e.path),
};

function revealSparkle(stage, e) {
  const { scene } = stage.state;
  if (e.path !== scene.path) return;
  [...scene.layout.doors, ...scene.layout.items].filter(x => x.hidden).forEach(x => burstAt(stage, x.path, [INK.w, INK.v]));
}

const DEFIED_MS = 600;

function defied(stage, key) {
  const until = performance.now() + DEFIED_MS;
  stage.state.creatures.filter(c => c.key === key).forEach(c => { c.flashUntil = until; });
  shake(stage);
}

function killed(stage, key) {
  const found = creaturesWithKey(stage, key);
  const fallback = { x: SLOTS[0].cx, y: SLOTS[0].cy, kind: key === 'daemon' ? 'daemon' : 'imp' };
  for (const c of found.length ? found : [fallback]) stage.motion.burst(c.x, c.y, CREATURE_BURST[c.kind], 50, 2.4);
  shake(stage);
}

const AFTER = {
  created: (stage, e) => burstAt(stage, e.path, SPARKLE),
  reveal: revealSparkle,
  'unknown-command': stage => say(stage, '?', 'player', 1400),
  guardian: stage => {
    flash(stage);
    shake(stage);
    say(stage, 'Ouch!');
  },
  'proc-defied': (stage, e) => defied(stage, e.key),
  'proc-killed': (stage, e) => killed(stage, e.key),
  'daemon-defied': stage => defied(stage, 'daemon'),
  'daemon-killed': stage => killed(stage, 'daemon'),
  'gate-opened': stage => {
    stage.state.gateOpen = true;
    stage.state.scene.gateOpen = true;
    stage.motion.burst(160, 40, [TOON.y, INK.w], 50, 2);
    shake(stage);
  },
};

function show(stage, obs) {
  const { state } = stage;
  state.token += 1;
  stage.motion.finish();
  Object.assign(state, { fade: 0, trip: null, gateOpen: false, hover: null, focus: null, banner: null, bubbles: [], flashUntil: 0, shakeUntil: 0, creatures: [], fallen: [] });
  Object.assign(state.player, STAND, { walking: false });
  state.revealed.clear();
  settle(stage, obs);
}

async function play(stage, effects, obs) {
  const { state } = stage;
  if (!state.scene) {
    show(stage, obs);
    return;
  }
  const token = ++state.token;
  stage.motion.finish();
  Object.assign(state, { fade: 0, trip: null });
  state.player.walking = false;
  const before = state.scene;
  for (const effect of effects) BEFORE[effect.kind]?.(stage, effect, before.layout);
  if (obs.cwd !== before.path) await journey(stage, before.path, obs, token);
  else settle(stage, obs);
  const current = token === state.token;
  if (current) for (const effect of effects) AFTER[effect.kind]?.(stage, effect);
}

function pickFrom(stage, event) {
  const { canvas, view, state } = stage;
  if (!state.scene || state.trip) return null;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * (canvas.width / rect.width) - view.ox) / view.scale;
  const y = ((event.clientY - rect.top) * (canvas.height / rect.height) - view.oy) / view.scale;
  return pickAt(state.scene.layout, x, y);
}

function listen(stage, onPick) {
  const { canvas, state } = stage;
  const hover = pick => {
    state.hover = pick?.path ?? null;
    canvas.style.cursor = pick ? 'pointer' : '';
  };
  const handlers = {
    click: event => {
      const pick = pickFrom(stage, event);
      if (pick) onPick(pick);
    },
    pointermove: event => hover(pickFrom(stage, event)),
    pointerleave: () => hover(null),
  };
  Object.entries(handlers).forEach(([type, fn]) => canvas.addEventListener(type, fn));
  return () => Object.entries(handlers).forEach(([type, fn]) => canvas.removeEventListener(type, fn));
}

/**
 * Create a map on a canvas. Give the canvas a definite size in CSS (for
 * example `width: 100%; aspect-ratio: 16 / 10`); the map follows its size and
 * the device pixel ratio, and keeps the canvas's aria-label describing the room.
 *
 * @param {HTMLCanvasElement} canvas Where to draw.
 * @param {{reducedMotion?: boolean, onPick?: (pick: {kind: 'door'|'item'|'exit', name: string, path: string}) => void}} [opts]
 *   Reduced motion makes every transition instant and drops particles; onPick
 *   is called when the player clicks or taps a door, an item or the exit.
 * @returns {GameMap} The map.
 */
export function createMap(canvas, { reducedMotion = false, onPick = () => {} } = {}) {
  const stage = createStage(canvas, reducedMotion);
  const observer = new ResizeObserver(() => fitCanvas(stage));
  observer.observe(canvas);
  const unlisten = listen(stage, onPick);
  canvas.setAttribute('role', 'img');
  document.fonts?.load('16px "IBM Plex Mono"');
  document.fonts?.load('16px "Pixelify Sans"');
  fitCanvas(stage);

  let frameId = 0;
  const frame = now => {
    paintFrame(stage, now);
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  return {
    show: obs => show(stage, obs),
    play: (effects, obs) => play(stage, effects, obs),
    say: (text, who) => say(stage, text, who),
    banner: (title, sub) => showBanner(stage, { title, sub }),
    focus: name => { stage.state.focus = name; },
    picks: () => (stage.state.scene ? picksOf(stage.state.scene.room) : []),
    destroy: () => {
      stage.state.token += 1;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      unlisten();
      stage.motion.finish();
    },
  };
}
