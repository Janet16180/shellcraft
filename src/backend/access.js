/**
 * The Linux permission check, shared by the simulator (which enforces it) and
 * the map (which draws padlocks where it would refuse).
 */

const BITS = { r: 4, w: 2, x: 1 };

/**
 * Decide whether a user may read, write or execute a node. Linux picks exactly
 * one class: the owner bits if the user owns it, else the group bits if the
 * user is in its group, else the other bits. root may read and write anything
 * and enter any directory, but may execute a file only if some execute bit is set.
 *
 * @param {{type: string, mode: number, owner: string, group: string}} node The file or directory.
 * @param {'r'|'w'|'x'} perm The permission asked for.
 * @param {{user: string, groups: string[]}} who The user and the groups they belong to.
 * @returns {boolean} Whether the permission is granted.
 * @throws {Error} If perm is not 'r', 'w' or 'x'.
 */
export function allows(node, perm, { user, groups }) {
  if (!(perm in BITS)) throw new Error(`unknown permission: ${perm}`);

  let granted;
  if (user === 'root') {
    granted = perm !== 'x' || node.type === 'dir' || (node.mode & 0o111) !== 0;
  } else {
    let shift = 0;
    if (node.owner === user) shift = 6;
    else if (groups.includes(node.group)) shift = 3;
    granted = (node.mode & (BITS[perm] << shift)) !== 0;
  }
  return granted;
}
