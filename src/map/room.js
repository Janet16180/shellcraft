/**
 * What the player can see in the working directory, read from an Observation:
 * its doors (subdirectories), items (files), the exit, and which of them the
 * permission rules close to the player.
 */

import { allows } from '../backend/access.js';
import { joinPath, parentOf } from './paths.js';

/**
 * @typedef {object} Entry
 * @property {string} name The real name, exactly as ls prints it.
 * @property {string} path Absolute path.
 * @property {boolean} hidden The name starts with a dot.
 * @property {boolean} locked A door the player may not enter, or an item they may not read.
 * @property {boolean} runnable An item the player may execute.
 */

/**
 * @typedef {object} Room
 * @property {string} path Absolute path of the working directory.
 * @property {'open'|'dark'|'gone'} status Dark: the player may enter but not
 *   list it. Gone: the directory no longer exists (it was removed around them).
 * @property {Entry[]} doors Subdirectories in ls order.
 * @property {Entry[]} items Files in ls order.
 * @property {string|null} exit Where `..` leads, or null at the root.
 */

/**
 * The node at an absolute path, or null when nothing is there.
 *
 * @param {object} tree The observed tree, rooted at '/'.
 * @param {string} path Absolute path.
 * @returns {object|null} The node.
 */
export function nodeAt(tree, path) {
  let node = tree;
  for (const name of path.split('/').filter(Boolean)) node = node?.children?.[name] ?? null;
  return node;
}

// C.UTF-8 sorts by byte value, which for these names is code unit order.
const byteOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function entry(dir, name, node, who) {
  const isDir = node.type === 'dir';
  return {
    name,
    path: joinPath(dir, name),
    hidden: name.startsWith('.'),
    locked: !allows(node, isDir ? 'x' : 'r', who),
    runnable: !isDir && allows(node, 'x', who),
  };
}

/**
 * Read the working directory of an observation as a room.
 *
 * @param {import('../backend/port.js').Observation & {groups: string[]}} obs The observation.
 * @param {Set<string>} revealed Directories whose hidden entries the player has seen (after `ls -a`).
 * @returns {Room} The room.
 * @throws {Error} If the observation does not list the player's groups.
 */
export function readRoom(obs, revealed) {
  if (!Array.isArray(obs.groups)) throw new Error("readRoom needs obs.groups, the player's groups");

  const node = nodeAt(obs.tree, obs.cwd);
  const who = { user: obs.user, groups: obs.groups };
  const exit = obs.cwd === '/' ? null : parentOf(obs.cwd);

  let status = 'open';
  if (node?.type !== 'dir') status = 'gone';
  else if (!allows(node, 'r', who)) status = 'dark';

  const children = status === 'open' ? node.children : {};
  const showHidden = revealed.has(obs.cwd);
  const entries = Object.keys(children)
    .filter(name => showHidden || !name.startsWith('.'))
    .sort(byteOrder)
    .map(name => [children[name], entry(obs.cwd, name, children[name], who)]);

  return {
    path: obs.cwd,
    status,
    doors: entries.filter(([child]) => child.type === 'dir').map(([, e]) => e),
    items: entries.filter(([child]) => child.type !== 'dir').map(([, e]) => e),
    exit,
  };
}

const KEY_WORD = /(^|[^a-z])key([^a-z]|$)/i;

/**
 * Which sprite an item is drawn as. The name and permissions decide first
 * (gems, keys, runnable potions), then the place (log books in /var/log).
 *
 * @param {Entry} item The item.
 * @param {string} biome Biome id of the room it lies in.
 * @returns {'gem'|'key'|'fire'|'potion'|'book'|'void'|'scroll'} The sprite kind.
 */
export function itemKind(item, biome) {
  const { name } = item;
  let kind = 'scroll';
  if (name.endsWith('.gem')) kind = 'gem';
  else if (KEY_WORD.test(name)) kind = 'key';
  else if (name.includes('campfire')) kind = 'fire';
  else if (item.runnable || name.endsWith('.sh')) kind = 'potion';
  else if (item.path === '/dev/null') kind = 'void';
  else if (biome === 'scriptorium') kind = 'book';
  return kind;
}
