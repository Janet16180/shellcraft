/**
 * Seeded randomness for boss rooms and anything else that must be
 * reproducible in tests. Chapters receive a random function and never call
 * Math.random themselves.
 */

/** Characters a pixel font cannot confuse: no 0/O, 1/l/I, 2/Z, 5/S, 8/B. */
export const TOKEN_ALPHABET = 'acdefhjkmnprtuvwxy34679';

/**
 * Create a seeded pseudo-random generator (mulberry32).
 *
 * @param {number} seed An integer seed.
 * @returns {() => number} A function returning numbers in [0, 1).
 * @throws {Error} If the seed is not an integer.
 */
export function createRandom(seed) {
  if (!Number.isInteger(seed)) throw new Error(`seed must be an integer, got ${seed}`);

  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Choose one element.
 *
 * @template T
 * @param {() => number} random A function returning numbers in [0, 1).
 * @param {T[]} items The candidates.
 * @returns {T} One of the items.
 * @throws {Error} If items is empty.
 */
export function pick(random, items) {
  if (items.length === 0) throw new Error('cannot pick from an empty list');
  return items[Math.floor(random() * items.length)];
}

/**
 * Shuffle a copy of a list (Fisher-Yates).
 *
 * @template T
 * @param {() => number} random A function returning numbers in [0, 1).
 * @param {T[]} items The list; it is not modified.
 * @returns {T[]} A new list with the same elements in random order.
 */
export function shuffle(random, items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Make a random token from TOKEN_ALPHABET, for passwords and names in boss rooms.
 *
 * @param {() => number} random A function returning numbers in [0, 1).
 * @param {number} length How many characters.
 * @returns {string} The token.
 * @throws {Error} If length is not a positive integer.
 */
export function token(random, length) {
  if (!Number.isInteger(length) || length < 1) throw new Error(`token length must be a positive integer, got ${length}`);
  return Array.from({ length }, () => pick(random, [...TOKEN_ALPHABET])).join('');
}
