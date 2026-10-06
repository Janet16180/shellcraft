/**
 * The simulated filesystem: an in-memory tree of directory and file nodes.
 *
 * A node is `{type: 'dir'|'file', mode, owner, group, mtime}` plus `children`
 * (a directory) or `content` (a file). Paths are absolute strings; every
 * function here works on a root node and plain paths, never on shell state.
 *
 * Invariants: a directory's `children` object has no prototype, so any name
 * the player types, even `constructor` or `__proto__`, is an ordinary entry;
 * and no node lies more than MAX_TREE_DEPTH levels below the root, so every
 * walk over the tree, here and in the layers that read snapshots, stays
 * shallow. Linux itself has no such limit.
 */

import { nameTable } from './table.js';

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
 * Find the node at an absolute path.
 *
 * @param {object} root The root directory node.
 * @param {string} abs Absolute normalized path.
 * @returns {object|null} The node, or null if any component is missing or not a directory.
 */
export function lookup(root, abs) {
  let node = root;
  for (const part of abs.split('/').filter(Boolean)) {
    node = node && node.type === 'dir' ? node.children[part] ?? null : null;
  }
  return node;
}

/**
 * @param {string} abs Absolute path.
 * @returns {string} Its parent directory ('/' for top-level entries and for '/').
 */
export const parentOf = abs => {
  const i = abs.lastIndexOf('/');
  return i <= 0 ? '/' : abs.slice(0, i);
};

/**
 * @param {string} abs Absolute path.
 * @returns {string} The last component ('' for '/').
 */
export const baseName = abs => abs.slice(abs.lastIndexOf('/') + 1);

/**
 * @param {string} parent Absolute directory path.
 * @param {string} name Entry name.
 * @returns {string} The absolute path of the entry.
 */
export const joinPath = (parent, name) => (parent === '/' ? `/${name}` : `${parent}/${name}`);

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
 * @param {string} text Any text.
 * @returns {number} Its length in UTF-8 bytes.
 */
export function byteLength(text) {
  let bytes = text.length;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    // One UTF-16 unit takes 1 to 3 bytes; the two units of a surrogate pair take 2 each.
    if (unit >= 0x80) bytes++;
    if (unit >= 0x800 && (unit < 0xd800 || unit > 0xdfff)) bytes++;
  }
  return bytes;
}

/**
 * @param {object} node A file or directory node.
 * @returns {number} Its size as ls reports it: bytes for a file, 4096 for a directory.
 */
export const sizeOf = node => (node.type === 'dir' ? DIR_SIZE : byteLength(node.content));

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
 * Deep-copy a node, stamping every copy with a new time.
 *
 * @param {object} node The node to copy.
 * @param {number} mtime The copies' modification time.
 * @returns {object} The copy.
 */
export function cloneNode(node, mtime) {
  if (node.type === 'file') return { ...node, mtime };
  const children = nameTable(Object.fromEntries(Object.entries(node.children).map(([name, child]) => [name, cloneNode(child, mtime)])));
  return { ...node, children, mtime };
}

/**
 * Turn a node described with src/backend/spec.js into a filesystem node.
 *
 * @param {object} spec A dir() or file() description.
 * @param {number} mtime Modification time for every node.
 * @returns {object} The node.
 */
export function fromSpec(spec, mtime) {
  const meta = { mode: spec.mode, owner: spec.owner, group: spec.group, mtime };
  if (spec.type === 'file') return newFile(spec.content, meta);
  return newDir(Object.fromEntries(Object.entries(spec.children).map(([name, child]) => [name, fromSpec(child, mtime)])), meta);
}

/**
 * Snapshot a node as the port's TreeNode, sharing nothing with the tree.
 * Children are plain objects whose names, `__proto__` included, are own
 * properties: read them with Object.hasOwn.
 *
 * @param {object} node A filesystem node.
 * @returns {import('../backend/port.js').TreeNode} The snapshot.
 */
export function snapshot(node) {
  const base = { type: node.type, mode: node.mode, owner: node.owner, group: node.group, size: sizeOf(node), mtime: node.mtime };
  if (node.type === 'file') return { ...base, content: node.content };
  return { ...base, children: Object.fromEntries(Object.entries(node.children).map(([name, child]) => [name, snapshot(child)])) };
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
