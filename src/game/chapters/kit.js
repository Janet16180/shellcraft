/**
 * Small helpers shared by chapter modules: random choices for boss rooms, and
 * reading an observed tree the way a player reads it with ls and cat.
 */

/**
 * The letters random tokens are made of: no glyphs a pixel font could
 * confuse (0/O, 1/l/I, 2/Z, 5/S, 8/B).
 */
export const TOKEN_ALPHABET = 'acdefhjkmnprtuvwxy34679';

/**
 * Pick one item of a list.
 *
 * @template T
 * @param {() => number} random Returns a number in [0, 1).
 * @param {T[]} items A non-empty list.
 * @returns {T} One of the items.
 * @throws {Error} If the list is empty.
 */
export function pick(random, items) {
  if (!items.length) throw new Error('pick: the list is empty');
  return items[Math.floor(random() * items.length)];
}

/**
 * A shuffled copy of a list (Fisher-Yates).
 *
 * @template T
 * @param {() => number} random Returns a number in [0, 1).
 * @param {T[]} items The list; it is not changed.
 * @returns {T[]} The same items in a random order.
 */
export function shuffle(random, items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A random token from TOKEN_ALPHABET, safe to show in any font.
 *
 * @param {() => number} random Returns a number in [0, 1).
 * @param {number} length How many characters.
 * @returns {string} The token.
 */
export function token(random, length) {
  return Array.from({ length }, () => pick(random, [...TOKEN_ALPHABET])).join('');
}

/**
 * Whether a path is a directory or anything below it.
 *
 * @param {string} path Absolute path to test.
 * @param {string} dirPath Absolute path of the directory.
 * @returns {boolean} True for dirPath itself and every path under it.
 */
export function isInside(path, dirPath) {
  return path === dirPath || path.startsWith(`${dirPath}/`);
}

/**
 * The node at an absolute path of an observed tree.
 *
 * @param {object} tree The observation's tree, rooted at '/'.
 * @param {string} path Absolute path.
 * @returns {object|undefined} The node, or undefined if nothing is there.
 */
export function nodeAt(tree, path) {
  return path.split('/').filter(Boolean).reduce((node, name) => node?.children?.[name], tree);
}

/**
 * Every directory at or below a path, as absolute paths, parents first.
 *
 * @param {object} tree The observation's tree.
 * @param {string} path Absolute path of a directory.
 * @returns {string[]} The directories, including path itself; empty if path is not a directory.
 */
export function directoriesUnder(tree, path) {
  const node = nodeAt(tree, path);
  if (node?.type !== 'dir') return [];
  const below = Object.keys(node.children).flatMap(name => directoriesUnder(tree, `${path}/${name}`));
  return [path, ...below];
}
