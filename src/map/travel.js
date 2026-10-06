/**
 * How the player moves between two rooms: where they walk before leaving,
 * how the picture changes, and where they appear in the new room.
 */

import { biomeFor } from './biomes.js';
import { parentOf } from './paths.js';

const REALM_CHANGE = { 'overworld>dungeon': 'descend', 'dungeon>overworld': 'climb' };

/**
 * Plan a move from one directory to another.
 *
 * @param {string} from Absolute path left.
 * @param {string} to Absolute path entered.
 * @param {string} home Absolute path of the player's home.
 * @returns {{approach: 'door'|'exit'|'none', transition: 'fade'|'warp'|'descend'|'climb', arrive: 'door'|'exit'|'center'}}
 *   approach: walk to the child's door, to the exit, or nowhere (a jump).
 *   transition: a fade between neighbours, a warp for a jump, a stairway when leaving or re-entering home.
 *   arrive: at the door of the room just left (going up), at the exit (going down), or in the centre.
 * @throws {Error} If from and to are the same directory.
 */
export function planTravel(from, to, home) {
  if (from === to) throw new Error(`planTravel: from and to are the same directory (${from})`);

  const down = parentOf(to) === from;
  const up = parentOf(from) === to;
  const realms = `${biomeFor(from, home).realm}>${biomeFor(to, home).realm}`;

  let approach = 'none';
  let arrive = 'center';
  if (down) [approach, arrive] = ['door', 'exit'];
  else if (up) [approach, arrive] = ['exit', 'door'];

  const transition = REALM_CHANGE[realms] ?? (approach === 'none' ? 'warp' : 'fade');
  return { approach, transition, arrive };
}
