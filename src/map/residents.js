/**
 * Who lives behind a door: in /home, the door of a known person's home is
 * theirs while they still own it, and the map draws them standing beside it.
 */

import { PEOPLE } from './palette.js';
import { joinPath } from '../backend/tree.js';

export { PEOPLE };

/**
 * The person who stands at a door, if any.
 *
 * @param {{path: string, owner: string}} door The door, from readRoom.
 * @param {string} user The player's user name: nobody stands at their own door.
 * @returns {string|null} A key of PEOPLE, or null.
 */
export function residentOf({ path, owner }, user) {
  const known = Object.hasOwn(PEOPLE, owner) && owner !== user;
  return known && path === joinPath('/home', owner) ? owner : null;
}
