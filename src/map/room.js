/**
 * What the player can see in the working directory, read from an Observation:
 * its doors (subdirectories), items (files), the exit, and which of them the
 * permission rules close to the player.
 */

import { allows } from '../backend/access.js';
import { nodeAt, compareNames, joinPath, parentOf } from '../backend/tree.js';

/**
 * @typedef {object} Entry
 * @property {string} name The real name, exactly as ls prints it.
 * @property {string} path Absolute path.
 * @property {boolean} hidden The name starts with a dot.
 * @property {boolean} locked A door the player may not enter (no x), or an item they may not read.
 * @property {boolean} dark A door the player may enter but not list (x without r).
 * @property {string} owner The owner's name, as ls -l prints it.
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

function entry(dir, name, node, who) {
  const isDir = node.type === 'dir';
  const locked = !allows(node, isDir ? 'x' : 'r', who);
  return {
    name,
    path: joinPath(dir, name),
    hidden: name.startsWith('.'),
    locked,
    dark: isDir && !locked && !allows(node, 'r', who),
    owner: node.owner,
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
    .sort(compareNames)
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

/**
 * Everything the player could pick in a room, for keyboard play and screen
 * readers: every door and item (including those the picture folds into "+N")
 * and the exit.
 *
 * @param {Room} room The room, from readRoom.
 * @returns {{kind: 'door'|'item'|'exit', name: string, path: string, locked: boolean}[]} Doors, then items, then the exit.
 */
export function picksOf(room) {
  const pick = kind => ({ name, path, locked }) => ({ kind, name, path, locked });
  const exit = room.exit === null ? [] : [{ kind: 'exit', name: '..', path: room.exit, locked: false }];
  return [...room.doors.map(pick('door')), ...room.items.map(pick('item')), ...exit];
}
