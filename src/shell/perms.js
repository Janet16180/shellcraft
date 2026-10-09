/**
 * Permission questions the simulated commands ask, answered by the shared
 * rule in src/backend/access.js for the shell's user.
 */

import { allows } from '../backend/access.js';
import { groupNames } from './accounts.js';

const STICKY = 0o1000;
const SETGID = 0o2000;

/**
 * @param {object} sys The machine state.
 * @param {object} node A file or directory node.
 * @param {'r'|'w'|'x'} perm The permission.
 * @returns {boolean} Whether the shell's user has it.
 */
export const can = (sys, node, perm) => allows(node, perm, { user: sys.user, groups: groupNames(sys) });

/**
 * Creating, renaming or removing entries needs write and search permission on the directory.
 *
 * @param {object} sys The machine state.
 * @param {object} dirNode The directory.
 * @returns {boolean} Whether the shell's user may change its entries.
 */
export const canChangeEntries = (sys, dirNode) => can(sys, dirNode, 'w') && can(sys, dirNode, 'x');

/**
 * Removing or renaming one entry: in a sticky directory (like /tmp) only the
 * entry's owner, the directory's owner or root may do it.
 *
 * @param {object} sys The machine state.
 * @param {object} dirNode The directory holding the entry.
 * @param {object} entry The entry.
 * @returns {boolean} Whether the shell's user may unlink it.
 */
export function canUnlink(sys, dirNode, entry) {
  const sticky = (dirNode.mode & STICKY) !== 0;
  const owns = sys.user === 'root' || entry.owner === sys.user || dirNode.owner === sys.user;
  return canChangeEntries(sys, dirNode) && (!sticky || owns);
}

/**
 * Changing a node's mode needs ownership (or root).
 *
 * @param {object} sys The machine state.
 * @param {object} node The node.
 * @returns {boolean} Whether the shell's user may chmod it.
 */
export const canChmod = (sys, node) => sys.user === 'root' || node.owner === sys.user;

/**
 * Mode, owner, group and time for a node the shell's user creates. The group
 * is the user's primary group, or the directory's own group when the
 * directory is setgid; a new directory in a setgid directory is setgid too.
 *
 * @param {object} sys The machine state.
 * @param {object} parent The directory the node goes into.
 * @param {number} mode The mode asked for, before the umask.
 * @param {boolean} isDir Whether the new node is a directory.
 * @returns {{mode: number, owner: string, group: string, mtime: number}} The metadata.
 */
export function newMeta(sys, parent, mode, isDir) {
  const setgid = (parent.mode & SETGID) !== 0;
  return {
    mode: (mode & ~sys.umask) | (setgid && isDir ? SETGID : 0),
    owner: sys.user,
    group: setgid ? parent.group : groupNames(sys)[0],
    mtime: sys.now(),
  };
}
