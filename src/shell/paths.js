/**
 * Resolving a path the way the kernel does: one component at a time, each
 * directory on the way searchable by the user. `..` needs the directory
 * before it to exist, unlike a purely textual cleanup.
 */

import { can } from './perms.js';
import { byteLength, lookup, MAX_TREE_DEPTH } from './fs.js';
import { varValue } from './vars.js';
import { joinPath, walkPath } from '../backend/tree.js';

const MESSAGES = {
  ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory', EACCES: 'Permission denied', ENAMETOOLONG: 'File name too long',
  ELOOP: 'Too many levels of symbolic links',
};
// Linux PATH_MAX counts the final NUL byte; NAME_MAX limits one component.
const PATH_MAX = 4096;
const NAME_MAX = 255;

/**
 * @param {'ENOENT'|'ENOTDIR'|'EACCES'|'ENAMETOOLONG'|'ELOOP'} code An error code from resolve().
 * @returns {string} The C library message for it.
 */
export const errorText = code => MESSAGES[code];

const searchable = sys => (dir, name, stack) => {
  let error = null;
  if (byteLength(name) > NAME_MAX) error = 'ENAMETOOLONG';
  else if (!can(sys, dir, 'x')) error = 'EACCES';
  else if (name !== '.' && name !== '..' && stack.length > MAX_TREE_DEPTH) error = 'ENAMETOOLONG';
  return error;
};

// The working directory as the kernel holds it: where its path leads, links followed.
function startStack(sys, path) {
  const root = [{ name: '', node: sys.root }];
  const cwd = path.startsWith('/') ? null : walkPath(root, sys.cwd);
  if (!cwd) return root;
  return cwd.error || cwd.stack.at(-1).node.type !== 'dir' ? null : cwd.stack;
}

/**
 * Resolve a path for the shell's user. Symbolic links are followed on the
 * way, and in the last place too unless `follow` is false (what lstat does,
 * for commands that act on a link itself: rm, mv, ls -l, ln).
 *
 * @param {{root: object, cwd: string, user: string, gids: number[]}} sys The machine state.
 * @param {string} path Absolute or relative path, as typed.
 * @param {{follow?: boolean}} [opts] Follow a symbolic link in the last place (default true).
 * @returns {{abs: string, node: object|null, parent: object|null, error: 'ENOENT'|'ENOTDIR'|'EACCES'|'ENAMETOOLONG'|'ELOOP'|null}}
 *   The absolute path where the walk ended, links resolved (a dangling link
 *   gives the path it points at); the node (null on error); the directory
 *   that holds or would hold the last component (null when the path does not
 *   get that far).
 */
export function resolve(sys, path, { follow = true } = {}) {
  const start = startStack(sys, path);
  const trailingSlash = path.length > 1 && path.endsWith('/');
  let walked = start ? walkPath(start, path, { follow, check: searchable(sys) }) : { stack: [{ name: '', node: null }], error: 'ENOENT', parent: null };
  if (byteLength(path) >= PATH_MAX) walked = { stack: [{ name: '', node: null }], error: 'ENAMETOOLONG', parent: null };
  const { stack } = walked;
  let { error, parent } = walked;
  const node = error ? null : stack.at(-1).node;
  if (!error && trailingSlash && node.type !== 'dir') error = 'ENOTDIR';
  if (!error) parent = stack.length > 1 ? stack.at(-2).node : sys.root;
  const abs = `/${stack.slice(1).map(s => s.name).join('/')}`;
  return { abs, node: error ? null : node, parent, error };
}

/**
 * The regular files named `name` in the directories of PATH, in PATH order.
 *
 * @param {object} sys The machine state.
 * @param {string} name A command name without a slash.
 * @returns {{path: string, node: object}[]} The files found, executable or not.
 */
export function pathFiles(sys, name) {
  return varValue(sys, 'PATH').split(':').filter(Boolean).map(d => joinPath(d, name))
    .map(path => ({ path, node: lookup(sys.root, path) }))
    .filter(f => f.node?.type === 'file');
}
