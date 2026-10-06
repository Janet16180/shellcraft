/**
 * Walking from one room to another: the hero walks to the door or the exit,
 * the picture fades (or takes the stairway between home and the dungeon), the
 * new room appears with the hero where they came in, and they step forward.
 */

import { planTravel } from './travel.js';
import { settle, showBanner, STAND } from './stage.js';
import { INK, TOON } from './palette.js';

const EXIT_STAND = { x: 160, y: 196 };
const WARP = [INK.v, INK.w, TOON.y];
const TRIP_MS = 1100;
const TRIP_BANNERS = {
  descend: home => ({ title: 'THE DUNGEON', sub: `outside your home, ${home}` }),
  climb: home => ({ title: 'BACK HOME', sub: `${home}, your home` }),
};

async function walk(stage, x, y, ms) {
  const { player } = stage.state;
  const from = { x: player.x, y: player.y };
  player.walking = true;
  await stage.motion.tween(ms, p => Object.assign(player, { x: from.x + (x - from.x) * p, y: from.y + (y - from.y) * p }));
  player.walking = false;
}

function fadeTo(stage, target, ms = 180) {
  const start = stage.state.fade;
  return stage.motion.tween(ms, p => { stage.state.fade = start + (target - start) * p; });
}

function doorStand(layout, path) {
  const door = layout.doors.find(d => d.path === path);
  let spot = null;
  if (door) spot = { x: door.cx, y: door.y + door.h + 4 };
  else if (layout.moreDoors) spot = { x: layout.moreDoors.cx, y: layout.moreDoors.y + 38 };
  return spot;
}

function arrive(stage, how, from) {
  const back = how === 'door' ? doorStand(stage.state.scene.layout, from) : null;
  let spot = { ...STAND };
  if (back) spot = back;
  else if (how === 'exit') spot = { x: STAND.x, y: 198 };
  else stage.motion.burst(STAND.x, STAND.y - 12, WARP, 30);
  Object.assign(stage.state.player, spot);
}

function approach(stage, plan, to) {
  const { player, scene } = stage.state;
  const moves = {
    door: () => {
      const spot = doorStand(scene.layout, to) ?? STAND;
      return walk(stage, spot.x, spot.y, 380);
    },
    exit: () => walk(stage, EXIT_STAND.x, EXIT_STAND.y, 320),
    none: () => stage.motion.burst(player.x, player.y - 12, WARP, 30),
  };
  return moves[plan.approach];
}

function stairway(stage, direction) {
  const { state, motion } = stage;
  return [
    () => {
      state.trip = { direction, progress: 0 };
      Object.assign(state.player, { x: 160, y: 132, walking: true });
      return fadeTo(stage, 0);
    },
    () => motion.tween(TRIP_MS, p => { state.trip.progress = p; }),
    () => fadeTo(stage, 1),
    () => {
      state.trip = null;
      state.player.walking = false;
    },
  ];
}

/**
 * Animate the move from one room to another and settle on the new observation.
 * Each step first checks the token, so a newer line cuts this one short.
 *
 * @param {import('./stage.js').Stage} stage The stage.
 * @param {string} from Absolute path of the room on show.
 * @param {object} obs The observation after the move (its cwd differs from `from`).
 * @param {number} token The play() call this journey belongs to.
 * @returns {Promise<void>} Resolves when the hero has stepped into the new room, or was cut short.
 */
export async function journey(stage, from, obs, token) {
  const plan = planTravel(from, obs.cwd, obs.home);
  const banner = TRIP_BANNERS[plan.transition];
  const steps = [
    approach(stage, plan, obs.cwd),
    () => fadeTo(stage, 1),
    ...(banner ? stairway(stage, plan.transition) : []),
    () => {
      settle(stage, obs);
      arrive(stage, plan.arrive, from);
      return fadeTo(stage, 0);
    },
    () => {
      if (banner) showBanner(stage, banner(obs.home));
      return walk(stage, STAND.x, STAND.y, 300);
    },
  ];
  for (const step of steps) {
    if (token === stage.state.token) await step();
  }
}
