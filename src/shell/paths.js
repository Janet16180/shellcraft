/**
 * Resolving a path the way the kernel does: one component at a time, each
 * directory on the way searchable by the user. `..` needs the directory
 * before it to exist, unlike a purely textual cleanup.
 */

import { can } from './perms.js';

const MESSAGES = { ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory', EACCES: 'Permission denied' };

/**
 * @param {'ENOENT'|'ENOTDIR'|'EACCES'} code An error code from resolve().
 * @returns {string} The C library message for it.
 */
export const errorText = code => MESSAGES[code];

function walk(sys, parts, startStack) {
  const stack = [...startStack];
  let error = null;
  let parent = null;
  parts.forEach((part, i) => {
    const dir = stack.at(-1).node;
    const last = i === parts.length - 1;
    if (error) return;
    if (dir.type !== 'dir') error = 'ENOTDIR';
    else if (!can(sys, dir, 'x')) error = 'EACCES';
    else if (part === '..') { if (stack.length > 1) stack.pop(); }
    else if (part === '.') return;
    else if (dir.children[part]) stack.push({ name: part, node: dir.children[part] });
    else {
      error = 'ENOENT';
      if (last) { parent = dir; stack.push({ name: part, node: null }); }
    }
  });
  return { stack, error, parent };
}

function startStack(sys, path) {
  const stack = [{ name: '', node: sys.root }];
  if (path.startsWith('/')) return stack;
  for (const part of sys.cwd.split('/').filter(Boolean)) stack.push({ name: part, node: stack.at(-1).node?.children?.[part] ?? null });
  return stack.some(s => !s.node) ? null : stack;
}

/**
 * Resolve a path for the shell's user.
 *
 * @param {{root: object, cwd: string, user: string, groups: string[]}} sys The machine state.
 * @param {string} path Absolute or relative path, as typed.
 * @returns {{abs: string, node: object|null, parent: object|null, error: 'ENOENT'|'ENOTDIR'|'EACCES'|null}}
 *   The absolute path; the node (null on error); the directory that holds or
 *   would hold the last component (null when the path does not get that far).
 */
export function resolve(sys, path) {
  const start = startStack(sys, path);
  const parts = path.split('/').filter(Boolean);
  const trailingSlash = path.length > 1 && path.endsWith('/');
  const walked = start ? walk(sys, parts, start) : { stack: [{ name: '', node: null }], error: 'ENOENT', parent: null };
  const { stack } = walked;
  let { error, parent } = walked;
  const node = error ? null : stack.at(-1).node;
  if (!error && trailingSlash && node.type !== 'dir') error = 'ENOTDIR';
  if (!error) parent = stack.length > 1 ? stack.at(-2).node : sys.root;
  const abs = `/${stack.slice(1).map(s => s.name).join('/')}`;
  return { abs, node: error ? null : node, parent, error };
}
