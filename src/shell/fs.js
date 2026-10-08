/**
 * The simulated filesystem: an in-memory tree of directory, file and
 * symbolic link nodes.
 *
 * A node is `{type: 'dir'|'file'|'symlink', mode, owner, group, mtime}` plus
 * `children` (a directory), `content` (a file) or `target` (a link's text).
 * A node is an inode: a file may sit in several directories under several
 * names (hard links), and its `ino` number, given on first need (system.js),
 * stays with it. Paths are absolute strings; every function here works on a
 * root node and plain paths, never on shell state.
 *
 * Invariants: a directory's `children` object has no prototype, so any name
 * the player types, even `constructor` or `__proto__`, is an ordinary entry;
 * and no node lies more than MAX_TREE_DEPTH levels below the root, so every
 * walk over the tree, here and in the layers that read snapshots, stays
 * shallow. Linux itself has no such limit.
 */

import { nameTable } from './table.js';
import { parentOf, baseName, nodeAt } from '../backend/tree.js';
import { byteLength } from '../backend/bytes.js';

export { byteLength };

const DIR_SIZE = 4096;

/** How many levels below the root the simulated tree may grow. */
export const MAX_TREE_DEPTH = 256;

/**
 * @param {string} abs Absolute path.
 * @returns {number} How many levels below the root it is (0 for '/').
 */
export const depthOf = abs => abs.split('/').filter(Boolean).length;

/**
 * Count the levels of a subtree, the node itself included, without recursion.
 *
 * @param {{type: string, children?: Record<string, object>}} node A filesystem node or a spec node.
 * @returns {number} 1 for a file or an empty directory, more for a deeper tree.
 */
export function heightOf(node) {
  let height = 0;
  const stack = [[node, 1]];
  while (stack.length) {
    const [current, level] = stack.pop();
    height = Math.max(height, level);
    if (current.type === 'dir') for (const child of Object.values(current.children)) stack.push([child, level + 1]);
  }
  return height;
}

/**
 * Resolve a path against a working directory, removing `.`, `..` and repeated slashes.
 *
 * @param {string} path Absolute or relative path.
 * @param {string} cwd Absolute working directory.
 * @returns {string} The absolute path.
 */
export function normalize(path, cwd) {
  const parts = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return `/${out.join('/')}`;
}

/**
 * Find the node at an absolute path, following symbolic links (no permission checks).
 *
 * @param {object} root The root directory node.
 * @param {string} abs Absolute path.
 * @param {{follow?: boolean}} [opts] Follow a symbolic link in the last place (default true).
 * @returns {object|null} The node, or null if any component is missing or not a directory.
 */
export const lookup = (root, abs, opts) => nodeAt(root, abs, opts);

/**
 * Join a path as the user typed it with an entry name, for display.
 *
 * @param {string} shown The typed prefix ('' for the current directory).
 * @param {string} name Entry name.
 * @returns {string} The displayed path.
 */
export const joinDisp = (shown, name) => {
  if (shown === '') return name;
  return shown.endsWith('/') ? shown + name : `${shown}/${name}`;
};

/**
 * Split text into lines, ignoring the final newline.
 *
 * @param {string} text Any text.
 * @returns {string[]} The lines (none for empty text).
 */
export function splitLines(text) {
  if (!text) return [];
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
}

/**
 * @param {object} node A node.
 * @returns {number} Its size as ls reports it: bytes for a file, 4096 for a
 *   directory, the bytes of its target text for a symbolic link.
 */
export function sizeOf(node) {
  if (node.type === 'dir') return DIR_SIZE;
  return byteLength(node.type === 'symlink' ? node.target : node.content);
}

/**
 * Count the names every file and symbolic link has in the tree.
 *
 * @param {object} root The root directory node.
 * @returns {Map<object, number>} Names per non-directory node.
 */
export function linkCounts(root) {
  const counts = new Map();
  const stack = [root];
  while (stack.length) {
    for (const child of Object.values(stack.pop().children)) {
      if (child.type === 'dir') stack.push(child);
      else counts.set(child, (counts.get(child) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The link count `ls -l` shows: a file's number of names, or for a
 * directory 2 (its name and its `.`) plus one `..` per subdirectory.
 *
 * @param {object} node A node.
 * @param {Map<object, number>} counts From linkCounts().
 * @returns {number} The count.
 */
export function linksOf(node, counts) {
  if (node.type !== 'dir') return counts.get(node) ?? 1;
  return 2 + Object.values(node.children).filter(c => c.type === 'dir').length;
}

/**
 * Build a directory node. Its children are copied into a prototype-free table.
 *
 * @param {Record<string, object>} children Child nodes by name.
 * @param {{mode: number, owner: string, group: string, mtime: number}} meta Mode, ownership and time.
 * @returns {object} The node.
 */
export const newDir = (children, { mode, owner, group, mtime }) => ({ type: 'dir', mode, owner, group, mtime, children: nameTable(children) });

/**
 * Build a file node.
 *
 * @param {string} content The file's text.
 * @param {{mode: number, owner: string, group: string, mtime: number}} meta Mode, ownership and time.
 * @returns {object} The node.
 */
export const newFile = (content, { mode, owner, group, mtime }) => ({ type: 'file', mode, owner, group, mtime, content });

/**
 * Build a symbolic link node. Its target text is kept as given; its mode is
 * 777, as on Linux, where a link's own permissions are never checked.
 *
 * @param {string} target The path it points at.
 * @param {{owner: string, group: string, mtime: number}} meta Ownership and time.
 * @returns {object} The node.
 */
export const newSymlink = (target, { owner, group, mtime }) => ({ type: 'symlink', mode: 0o777, owner, group, mtime, target });

/**
 * Deep-copy a node, stamping every copy with a new time. The copies are new
 * inodes, so they carry no inode number yet.
 *
 * @param {object} node The node to copy.
 * @param {number} mtime The copies' modification time.
 * @returns {object} The copy.
 */
export function cloneNode(node, mtime) {
  const rest = { ...node };
  delete rest.ino;
  if (node.type !== 'dir') return { ...rest, mtime };
  const children = nameTable(Object.fromEntries(Object.entries(node.children).map(([name, child]) => [name, cloneNode(child, mtime)])));
  return { ...rest, children, mtime };
}

/**
 * Turn a node described with src/backend/spec.js into a filesystem node.
 *
 * @param {object} spec A dir(), file() or symlink() description.
 * @param {number} mtime Modification time for every node.
 * @returns {object} The node.
 */
export function fromSpec(spec, mtime) {
  const meta = { mode: spec.mode, owner: spec.owner, group: spec.group, mtime };
  if (spec.type === 'file') return newFile(spec.content, meta);
  if (spec.type === 'symlink') return newSymlink(spec.target, meta);
  return newDir(Object.fromEntries(Object.entries(spec.children).map(([name, child]) => [name, fromSpec(child, mtime)])), meta);
}

/**
 * Snapshot a node as the port's TreeNode, sharing nothing with the tree.
 * Children are plain objects whose names, `__proto__` included, are own
 * properties: read them with Object.hasOwn. A file with several names is
 * repeated under each, with the same inode number.
 *
 * @param {object} node A filesystem node; its inode numbers should be given first (system.js numberInodes).
 * @param {Map<object, number>} [counts] Names per file, from linkCounts() of the whole tree.
 * @returns {import('../backend/port.js').TreeNode} The snapshot.
 */
export function snapshot(node, counts = linkCounts(node)) {
  const base = {
    type: node.type, mode: node.mode, owner: node.owner, group: node.group, size: sizeOf(node), mtime: node.mtime, ino: node.ino, links: linksOf(node, counts),
  };
  if (node.type === 'file') return { ...base, content: node.content };
  if (node.type === 'symlink') return { ...base, target: node.target };
  return { ...base, children: Object.fromEntries(Object.entries(node.children).map(([name, child]) => [name, snapshot(child, counts)])) };
}

/**
 * Add or replace an entry in a directory, updating the directory's time as a
 * real filesystem does when its entries change.
 *
 * @param {object} dirNode The directory.
 * @param {string} name The entry name.
 * @param {object} node The entry.
 * @param {number} mtime The time of the change.
 * @returns {object} The entry.
 */
export function addChild(dirNode, name, node, mtime) {
  dirNode.children[name] = node;
  dirNode.mtime = mtime;
  return node;
}

/**
 * Remove an entry from a directory, updating the directory's time.
 *
 * @param {object} dirNode The directory.
 * @param {string} name The entry name.
 * @param {number} mtime The time of the change.
 * @returns {void}
 */
export function removeChild(dirNode, name, mtime) {
  delete dirNode.children[name];
  dirNode.mtime = mtime;
}

/**
 * Place a node at an absolute path, replacing what was there. The parent
 * directory takes the node's time.
 *
 * @param {object} root The root directory node.
 * @param {string} abs Absolute path other than '/'.
 * @param {object} node The node to place.
 * @returns {void}
 * @throws {Error} If the parent does not exist or is not a directory.
 */
export function insert(root, abs, node) {
  const parent = lookup(root, parentOf(abs));
  if (!parent || parent.type !== 'dir') throw new Error(`cannot place ${abs}: ${parentOf(abs)} is not a directory`);
  addChild(parent, baseName(abs), node, node.mtime);
}

/**
 * Remove the node at an absolute path, if there is one.
 *
 * @param {object} root The root directory node.
 * @param {string} abs Absolute path other than '/'.
 * @param {number} mtime The time of the change, for the parent directory.
 * @returns {void}
 */
export function detach(root, abs, mtime) {
  const parent = lookup(root, parentOf(abs));
  if (parent && parent.type === 'dir' && baseName(abs) in parent.children) removeChild(parent, baseName(abs), mtime);
}
