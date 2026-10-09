/**
 * How the player moves between two rooms: where they walk before leaving,
 * how the picture changes, and where they appear in the new room.
 */

import { biomeFor } from './biomes.js';
import { parentOf } from '../backend/tree.js';

const REALM_CHANGE = { 'overworld>dungeon': 'descend', 'dungeon>overworld': 'climb' };

/**
 * Plan a move from one directory to another.
 *
 * @param {string} from Absolute path left.
 * @param {string} to Absolute path entered.
 * @param {string} home Absolute path of the player's home.
 * @param {{realFrom?: string, realTo?: string, portal?: boolean}} [through] Where the two paths really lead (links
 *   followed), which decides the realms; portal: `to` is a link standing in the room left.
 * @returns {{approach: 'door'|'exit'|'portal'|'none', transition: 'fade'|'warp'|'portal'|'descend'|'climb',
 *   arrive: 'door'|'exit'|'center'}}
 *   approach: walk to the child's door, to the exit, into the portal, or nowhere (a jump).
 *   transition: a fade between neighbours, a warp for a jump, a swirl through a portal, a stairway when
 *   leaving or re-entering home.
 *   arrive: at the door of the room just left (going up), at the exit (going down), or in the centre.
 * @throws {Error} If from and to are the same directory.
 */
export function planTravel(from, to, home, { realFrom = from, realTo = to, portal = false } = {}) {
  if (from === to) throw new Error(`planTravel: from and to are the same directory (${from})`);

  const down = parentOf(to) === from;
  const up = parentOf(from) === to;
  const realms = `${biomeFor(realFrom, home).realm}>${biomeFor(realTo, home).realm}`;

  let approach = 'none';
  let arrive = 'center';
  if (portal) approach = 'portal';
  else if (down) [approach, arrive] = ['door', 'exit'];
  else if (up) [approach, arrive] = ['exit', 'door'];

  const still = { none: 'warp', portal: 'portal' }[approach] ?? 'fade';
  const transition = REALM_CHANGE[realms] ?? still;
  return { approach, transition, arrive };
}
