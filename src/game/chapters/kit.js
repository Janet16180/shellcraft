/**
 * Small path helpers shared by chapter modules: where a path sits relative to
 * a directory, and what an observed tree holds, the way a player finds out
 * with ls.
 */
import { nodeAt } from '../checks.js';

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
 * Every directory at or below a path, as absolute paths, parents first.
 *
 * @param {object} tree The observation's tree, rooted at '/'.
 * @param {string} path Absolute path of a directory.
 * @returns {string[]} The directories, including path itself; empty if path is not a directory.
 * @throws {Error} If path is not absolute.
 */
export function directoriesUnder(tree, path) {
  const node = nodeAt(tree, path);
  if (node?.type !== 'dir') return [];
  const below = Object.keys(node.children).flatMap(name => directoriesUnder(tree, `${path}/${name}`));
  return [path, ...below];
}
