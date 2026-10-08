/**
 * Saving and restoring the whole machine state, for a line that must run
 * again from its start: a line waiting for typed input is replayed with the
 * answers given so far (see backend.js).
 */

const LIVE = ['now', 'random'];

function clone(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  let copy;
  if (value instanceof Map) {
    copy = new Map();
    seen.set(value, copy);
    for (const [k, v] of value) copy.set(k, clone(v, seen));
  } else if (value instanceof Set) {
    copy = new Set();
    seen.set(value, copy);
    for (const v of value) copy.add(clone(v, seen));
  } else {
    copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    seen.set(value, copy);
    for (const key of Object.keys(value)) copy[key] = clone(value[key], seen);
  }
  return copy;
}

/**
 * A deep copy that keeps shared nodes shared (hard links), prototypes
 * (null-prototype name tables) and functions as they are.
 *
 * @param {*} value Anything the machine state holds.
 * @returns {*} The copy.
 */
export const deepCopy = value => clone(value, new Map());

/**
 * Copy the machine state, except its clock and random source.
 *
 * @param {object} sys The machine state.
 * @returns {object} The saved state.
 */
export function saveState(sys) {
  return deepCopy(Object.fromEntries(Object.entries(sys).filter(([key]) => !LIVE.includes(key))));
}

/**
 * Put the machine back as it was saved. The saved copy stays untouched, so
 * it can be restored again.
 *
 * @param {object} sys The machine state.
 * @param {object} saved What saveState returned.
 * @returns {void}
 */
export function restoreState(sys, saved) {
  const state = deepCopy(saved);
  for (const key of Object.keys(sys)) if (!(key in state) && !LIVE.includes(key)) delete sys[key];
  Object.assign(sys, state);
}

/**
 * Record the clock and random numbers a run uses, and give the same ones,
 * in the same order, to a replay; past the recorded ones, the live sources.
 *
 * @param {object} sys The machine state, whose now and random are wrapped.
 * @returns {{play: (work: () => *) => *}} play runs work with the recorded values from the start.
 */
export function createTape(sys) {
  const live = { now: sys.now, random: sys.random };
  const recorded = { now: [], random: [] };
  const source = (name, pos) => () => {
    if (pos[name] === recorded[name].length) recorded[name].push(live[name]());
    return recorded[name][pos[name]++];
  };
  return {
    play: work => {
      const pos = { now: 0, random: 0 };
      Object.assign(sys, { now: source('now', pos), random: source('random', pos) });
      try {
        return work();
      } finally {
        Object.assign(sys, live);
      }
    },
  };
}
