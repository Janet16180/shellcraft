/**
 * A path helper shared by chapter modules: what an observed tree holds, the
 * way a player finds out with ls.
 */
import { nodeAt } from '../../backend/tree.js';

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
