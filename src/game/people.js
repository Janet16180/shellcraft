/**
 * The people of the realm from act III on: three users, each with a group of
 * their own as on Ubuntu, and two factions. Chapters call realm() so they all
 * describe the same machine; the player joins factions as the story goes on.
 */
import { put, dir, login } from '../backend/spec.js';
import { accounts } from './world.js';

const USERS = [
  { name: 'mira', uid: 1001, group: 'mira' },
  { name: 'oren', uid: 1002, group: 'oren' },
  { name: 'tamsin', uid: 1003, group: 'tamsin' },
];

/**
 * The accounts, a fresh login and each person's home (mode 750).
 *
 * @param {{home: string, user: string}} player The player.
 * @param {{factions?: string[]}} [opts] The factions the player belongs to: 'smiths', 'scribes'.
 * @returns {object[]} The patch.
 */
export function realm(player, { factions = [] } = {}) {
  const members = (faction, others) => [...others, ...(factions.includes(faction) ? [player.user] : [])];
  return [
    ...accounts(player, {
      users: USERS,
      groups: [
        ...USERS.map(({ name, uid }) => ({ name, gid: uid })),
        { name: 'smiths', gid: 1100, members: members('smiths', ['mira', 'oren']) },
        { name: 'scribes', gid: 1101, members: members('scribes', ['tamsin']) },
      ],
    }),
    login(),
    ...USERS.map(({ name }) => put(`/home/${name}`, dir({}, { owner: name, group: name, mode: 0o750 }))),
  ];
}
