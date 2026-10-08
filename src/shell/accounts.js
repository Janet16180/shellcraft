/**
 * The user and group database, read from the tree's /etc/passwd and
 * /etc/group as the C library does. Without those files the machine knows
 * root, a few system accounts and the player (user and group 1000).
 *
 * The shell's own groups are fixed when it logs in (`sys.gids`, primary
 * first); editing /etc/group changes them only at the next login.
 */

import { lookup } from './fs.js';

const PLAYER_ID = 1000;
const SYSTEM_PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
`;
const SYSTEM_GROUP = 'root:x:0:\ndaemon:x:1:\nbin:x:2:\nsys:x:3:\nnogroup:x:65534:\n';
const NUMBER = /^\d+$/;

function parseUsers(text) {
  const users = [];
  for (const line of text.split('\n')) {
    const f = line.split(':');
    if (f.length >= 7 && f[0] && NUMBER.test(f[2]) && NUMBER.test(f[3])) users.push({ name: f[0], uid: Number(f[2]), gid: Number(f[3]), home: f[5] });
  }
  return users;
}

function parseGroups(text) {
  const groups = [];
  for (const line of text.split('\n')) {
    const f = line.split(':');
    if (f.length === 4 && f[0] && NUMBER.test(f[2])) groups.push({ name: f[0], gid: Number(f[2]), members: f[3].split(',').filter(Boolean) });
  }
  return groups;
}

function fileText(sys, path) {
  const node = lookup(sys.root, path);
  return node?.type === 'file' ? node.content : null;
}

// The player always has an account, so a world that forgets it still logs in.
function database(sys, passwd, group) {
  const users = parseUsers(passwd ?? `${SYSTEM_PASSWD}${sys.user}:x:${PLAYER_ID}:${PLAYER_ID}::${sys.home}:/bin/bash\n`);
  const groups = parseGroups(group ?? `${SYSTEM_GROUP}${sys.user}:x:${PLAYER_ID}:\n`);
  if (!users.some(u => u.name === sys.user)) users.push({ name: sys.user, uid: PLAYER_ID, gid: PLAYER_ID, home: sys.home });
  return { users, groups };
}

function accounts(sys) {
  const passwd = fileText(sys, '/etc/passwd');
  const group = fileText(sys, '/etc/group');
  const cache = sys.accountCache;
  if (cache?.passwd !== passwd || cache?.group !== group) sys.accountCache = { passwd, group, db: database(sys, passwd, group) };
  return sys.accountCache.db;
}

// Like getpwnam, then getpwuid for a number: the first matching line wins.
function find(list, spec, idKey) {
  return list.find(a => a.name === spec) ?? (NUMBER.test(spec) ? list.find(a => a[idKey] === Number(spec)) : undefined) ?? null;
}

/**
 * @param {object} sys The machine state.
 * @param {string} spec A user name, or a uid as digits.
 * @returns {{name: string, uid: number, gid: number, home: string}|null} The account, or null if there is none.
 */
export function findUser(sys, spec) {
  const user = find(accounts(sys).users, spec, 'uid');
  return user && { name: user.name, uid: user.uid, gid: user.gid, home: user.home };
}

/**
 * @param {object} sys The machine state.
 * @param {string} spec A group name, or a gid as digits.
 * @returns {{name: string, gid: number, members: string[]}|null} The group, or null if there is none.
 */
export function findGroup(sys, spec) {
  const group = find(accounts(sys).groups, spec, 'gid');
  return group && { name: group.name, gid: group.gid, members: [...group.members] };
}

const groupById = (sys, gid) => accounts(sys).groups.find(g => g.gid === gid) ?? null;

/**
 * The groups a user belongs to, as a new login gets them (initgroups): the
 * primary group of the passwd line first, then every group that lists the
 * user, in file order.
 *
 * @param {object} sys The machine state.
 * @param {{name: string, gid: number}} user An account from findUser.
 * @returns {{name: string|null, gid: number}[]} The groups; name is null for a gid no group line names.
 */
export function memberGroups(sys, user) {
  const gids = [user.gid];
  for (const g of accounts(sys).groups) if (g.members.includes(user.name) && !gids.includes(g.gid)) gids.push(g.gid);
  return gids.map(gid => ({ name: groupById(sys, gid)?.name ?? null, gid }));
}

/**
 * The group ids the shell's user gets at a new login.
 *
 * @param {object} sys The machine state.
 * @returns {number[]} The gids, primary first.
 */
export const loginGids = sys => memberGroups(sys, findUser(sys, sys.user)).map(g => g.gid);

/**
 * The shell's groups (those of its login) by name, primary first; a gid with no name is its number.
 *
 * @param {object} sys The machine state.
 * @returns {string[]} The names.
 */
export const groupNames = sys => sys.gids.map(gid => groupById(sys, gid)?.name ?? String(gid));

/**
 * @param {object} sys The machine state.
 * @returns {Set<string>} Every user name in /etc/passwd.
 */
export const knownUsers = sys => new Set(accounts(sys).users.map(u => u.name));

/**
 * @param {object} sys The machine state.
 * @param {string} name A user name.
 * @returns {string|null} The home directory of its passwd line, or null for an unknown user.
 */
export const homeOf = (sys, name) => accounts(sys).users.find(u => u.name === name)?.home ?? null;

function label(account, stored, numeric, idKey) {
  let text = stored;
  if (account && numeric) text = String(account[idKey]);
  else if (account) text = account.name;
  return { text, numeric: NUMBER.test(text) };
}

/**
 * How ls shows a node's owner: the name, or the uid with -n. A number that
 * names nobody shows as the number (ls right-aligns numbers).
 *
 * @param {object} sys The machine state.
 * @param {string} owner The node's owner: a name, or a uid as digits.
 * @param {boolean} numeric Show the uid (ls -n).
 * @returns {{text: string, numeric: boolean}} The text, and whether it is a number.
 */
export const ownerLabel = (sys, owner, numeric) => label(find(accounts(sys).users, owner, 'uid'), owner, numeric, 'uid');

/**
 * Like ownerLabel, for the node's group.
 *
 * @param {object} sys The machine state.
 * @param {string} group The node's group: a name, or a gid as digits.
 * @param {boolean} numeric Show the gid (ls -n).
 * @returns {{text: string, numeric: boolean}} The text, and whether it is a number.
 */
export const groupLabel = (sys, group, numeric) => label(find(accounts(sys).groups, group, 'gid'), group, numeric, 'gid');
