/**
 * Questions about the observed tree that every layer asks: what is at a path,
 * whether a path lies inside a directory, and the order names sort in. One
 * home for them, so the shell, the rules, the map and the page agree.
 */

/**
 * Find the node at an absolute path in an observed tree.
 *
 * @param {object} tree The TreeNode rooted at '/'.
 * @param {string} path Absolute path.
 * @returns {object|null} The node, or null if nothing is there.
 * @throws {Error} If path is not absolute.
 */
export function nodeAt(tree, path) {
  if (!path.startsWith('/')) throw new Error(`path must be absolute, got ${path}`);

  let node = tree;
  for (const name of path.split('/').filter(Boolean)) node = node?.children?.[name] ?? null;
  return node;
}

/**
 * Whether a path is a directory itself or lies below it. Both are absolute.
 *
 * @param {string} path The path to test.
 * @param {string} dir The directory.
 * @returns {boolean} True for dir itself and everything under it.
 */
export function isInside(path, dir) {
  const prefix = dir.endsWith('/') ? dir : `${dir}/`;
  return path === dir || path.startsWith(prefix);
}

/**
 * Compare two names the way LC_ALL=C.UTF-8 sorts them: by code point, which
 * is the order of their UTF-8 bytes. Capitals sort before lowercase, and a
 * leading dot is an ordinary character.
 *
 * @param {string} x A name.
 * @param {string} y Another name.
 * @returns {number} Negative, zero or positive, for Array.prototype.sort.
 */
export function compareNames(x, y) {
  const a = [...x];
  const b = [...y];
  const n = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < n && diff === 0; i++) diff = a[i].codePointAt(0) - b[i].codePointAt(0);
  return diff || a.length - b.length;
}
