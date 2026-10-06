/**
 * The map's shared state (the "stage") and the small changes every other part
 * makes to it: settling on an observation, fitting the canvas, bubbles,
 * banners, shakes and bursts.
 */

import { biomeFor } from './biomes.js';
import { readRoom } from './room.js';
import { layoutRoom, ART } from './layout.js';
import { describeRoom } from './describe.js';
import { createMotion } from './motion.js';
import { makeCanvas } from './paint.js';

const DAEMON_KEY = 'daemon';
const NARROW_CSS = 560;
const BUBBLE_MS = 2600;
const SHAKE_MS = 360;

/** How long a red flash lasts, in ms. */
export const FLASH_MS = 320;

/** Where the hero stands when idle, in art pixels (feet). */
export const STAND = { x: 160, y: 178 };

/**
 * @typedef {object} Stage
 * @property {HTMLCanvasElement} canvas The screen canvas.
 * @property {CanvasRenderingContext2D} g Its context.
 * @property {CanvasRenderingContext2D} ax The 320 x 200 art canvas the room is painted on.
 * @property {HTMLCanvasElement} bg A cache of the room's still background.
 * @property {ReturnType<typeof createMotion>} motion Tweens and particles.
 * @property {boolean} reducedMotion
 * @property {import('./overlay.js').View & {narrow: boolean}} view How art maps to the screen.
 * @property {object} state Everything that changes: the observation, the scene, the hero, cues.
 */

/**
 * Build the stage for a canvas.
 *
 * @param {HTMLCanvasElement} canvas The screen canvas.
 * @param {boolean} reducedMotion Whether to skip motion.
 * @returns {Stage} The stage.
 */
export function createStage(canvas, reducedMotion) {
  return {
    canvas,
    g: canvas.getContext('2d'),
    ax: makeCanvas(ART.width, ART.height).getContext('2d'),
    bg: makeCanvas(ART.width, ART.height),
    motion: createMotion({ reducedMotion, random: Math.random }),
    reducedMotion,
    view: { scale: 1, ox: 0, oy: 0, dpr: 1, font: 12, width: 0, height: 0, narrow: false },
    state: {
      obs: null, scene: null, bgKey: '', revealed: new Set(),
      player: { ...STAND, walking: false }, daemon: { x: 262, y: 70, flashUntil: 0 },
      fade: 0, flashUntil: 0, shakeUntil: 0, banner: null, bubbles: [], trip: null, hover: null,
      gateOpen: false, token: 0,
    },
  };
}

/**
 * Make an observation the current room, and describe it in the canvas's aria-label.
 *
 * @param {Stage} stage The stage.
 * @param {object} obs The observation.
 */
export function settle(stage, obs) {
  const { state, view, canvas } = stage;
  const room = readRoom(obs, state.revealed);
  state.obs = obs;
  state.scene = {
    ...biomeFor(obs.cwd, obs.home),
    layout: layoutRoom(room, { narrow: view.narrow }),
    path: obs.cwd,
    home: obs.home,
    gateOpen: state.gateOpen,
    daemon: obs.procs.some(p => p.key === DAEMON_KEY),
  };
  canvas.setAttribute('aria-label', describeRoom(obs, { revealed: state.revealed }));
}

/**
 * Match the canvas's pixels to its CSS size and the device pixel ratio, and
 * switch to the narrow layout on small screens.
 *
 * @param {Stage} stage The stage.
 */
export function fitCanvas(stage) {
  const { canvas, view, state } = stage;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width || ART.width;
  const cssHeight = rect.height || (cssWidth * ART.height) / ART.width;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const scale = Math.min(canvas.width / ART.width, canvas.height / ART.height);
  Object.assign(view, {
    scale, dpr, width: canvas.width, height: canvas.height,
    font: Math.round(Math.min(15, Math.max(11, cssWidth / 50)) * dpr),
    ox: Math.round((canvas.width - ART.width * scale) / 2),
    oy: Math.round((canvas.height - ART.height * scale) / 2),
  });
  const narrow = cssWidth < NARROW_CSS;
  const relayout = narrow !== view.narrow && state.obs !== null;
  view.narrow = narrow;
  if (relayout) settle(stage, state.obs);
}

/**
 * Show a speech bubble, replacing the speaker's previous one.
 *
 * @param {Stage} stage The stage.
 * @param {string} text What is said.
 * @param {'player'|'daemon'} [who] The speaker.
 * @param {number} [ms] How long it stays.
 */
export function say(stage, text, who = 'player', ms = BUBBLE_MS) {
  const { state } = stage;
  state.bubbles = state.bubbles.filter(b => b.who !== who);
  state.bubbles.push({ text, who, until: performance.now() + ms });
}

/**
 * Show a banner across the room.
 *
 * @param {Stage} stage The stage.
 * @param {{title: string, sub?: string}} banner The title (pixel font) and subtitle (mono font).
 */
export function showBanner(stage, { title, sub = '' }) {
  stage.state.banner = { title, sub, start: performance.now() };
}

/**
 * Shake the picture briefly (not with reduced motion).
 *
 * @param {Stage} stage The stage.
 */
export function shake(stage) {
  stage.state.shakeUntil = performance.now() + SHAKE_MS;
}

/**
 * Flash the picture red briefly.
 *
 * @param {Stage} stage The stage.
 */
export function flash(stage) {
  stage.state.flashUntil = performance.now() + FLASH_MS;
}

/**
 * Throw particles from the door or item at a path, if it is on show.
 *
 * @param {Stage} stage The stage.
 * @param {string} path Absolute path of the entry.
 * @param {string[]} colours Particle colours.
 * @param {import('./layout.js').Layout} [layout] The layout to look in; the current room's by default.
 */
export function burstAt(stage, path, colours, layout = stage.state.scene.layout) {
  const entry = [...layout.doors, ...layout.items].find(e => e.path === path);
  if (entry) stage.motion.burst(entry.cx, entry.y + entry.h / 2, colours, 26);
}
