/**
 * The people of the realm from act III on: three users, each with a group of
 * their own as on Ubuntu, and two factions. Chapters call realm() so they all
 * describe the same machine; the player joins factions as the story goes on.
 */
import { put, dir, file, login } from '../backend/spec.js';
import { accounts } from './world.js';

const LEDGER_TEXT = `THE SCRIBES' LEDGER
New member: hero, apprentice scribe. Welcome!
Ink: 3 pots. Quills: 12. Candles: low.
`;
const PLANS_TEXT = 'Plans of the smiths: a new blade for the guild master.\n';
const RULES_TEXT = `RULES OF THE GUILD
1. Every scroll has an owner and a group.
2. Smiths read what is for smiths. Scribes read what is for scribes.
3. What is for everyone, anyone may read.
`;

const USERS = [
  { name: 'mira', uid: 1001, group: 'mira' },
  { name: 'oren', uid: 1002, group: 'oren' },
  { name: 'tamsin', uid: 1003, group: 'tamsin' },
];

/**
 * The accounts, a fresh login, each person's home (mode 750) and the guild
 * hall in /srv (it replaces /srv).
 *
 * @param {{home: string, user: string}} player The player.
 * @param {{factions?: string[], sudo?: boolean}} [opts] The factions the player belongs to: 'smiths', 'scribes';
 *   and whether the player is in the group sudo, an administrator (set a password with password() too).
 * @returns {object[]} The patch.
 */
export function realm(player, { factions = [], sudo = false } = {}) {
  const members = (faction, others) => [...others, ...(factions.includes(faction) ? [player.user] : [])];
  return [
    ...accounts(player, {
      users: USERS,
      groups: [
        ...USERS.map(({ name, uid }) => ({ name, gid: uid })),
        { name: 'smiths', gid: 1100, members: members('smiths', ['mira', 'oren']) },
        { name: 'scribes', gid: 1101, members: members('scribes', ['tamsin']) },
      ],
      sudo: sudo ? [player.user] : [],
    }),
    login(),
    ...USERS.map(({ name }) => put(`/home/${name}`, dir({}, { owner: name, group: name, mode: 0o750 }))),
    put('/srv', dir({
      guild: dir({
        'ledger.txt': file(LEDGER_TEXT, { owner: 'tamsin', group: 'scribes', mode: 0o640 }),
        'plans.txt': file(PLANS_TEXT, { owner: 'mira', group: 'smiths', mode: 0o640 }),
        'rules.txt': file(RULES_TEXT),
      }),
    })),
  ];
}
