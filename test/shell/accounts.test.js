import test from 'node:test';
import assert from 'node:assert/strict';
import { createSystem } from '../../src/shell/system.js';
import { applyPatch } from '../../src/shell/patch.js';
import { put, dir, file } from '../../src/backend/spec.js';
import {
  findUser, findGroup, memberGroups, loginGids, groupNames, knownUsers, homeOf, ownerLabel, groupLabel,
} from '../../src/shell/accounts.js';

const PASSWD = `root:x:0:0:root:/root:/bin/bash
hero:x:1000:1000:Hero,,,:/home/hero:/bin/bash
mira:x:1001:1001::/home/mira:/bin/bash
broken line
oren:x:1002:1003::/home/oren:/bin/bash
`;
const GROUP = `root:x:0:
hero:x:1000:
smiths:x:1001:
scribes:x:1002:hero,mira
`;

function machine(etc = { passwd: file(PASSWD), group: file(GROUP) }) {
  const sys = createSystem({ user: 'hero', host: 'kernelia', home: '/home/hero', now: () => 0, random: () => 0.5, binaries: [] });
  applyPatch(sys, [put('/etc', dir(etc))]);
  return sys;
}

test('users and groups come from /etc/passwd and /etc/group, with their numbers', () => {
  const sys = machine();
  assert.deepEqual(findUser(sys, 'mira'), { name: 'mira', uid: 1001, gid: 1001, home: '/home/mira' });
  assert.equal(findGroup(sys, 'scribes').gid, 1002);
  assert.deepEqual(findGroup(sys, 'scribes').members, ['hero', 'mira']);
});

test('a number finds the account with that id, and an unknown name or number finds nothing', () => {
  const sys = machine();
  assert.equal(findUser(sys, '1002').name, 'oren');
  assert.equal(findGroup(sys, '1001').name, 'smiths');
  assert.equal(findUser(sys, 'nosuch'), null);
  assert.equal(findGroup(sys, '4321'), null);
});

test('malformed lines are skipped', () => {
  assert.equal(findUser(machine(), 'broken line'), null);
});

test('without the files the machine has root, the system accounts and the player as user 1000', () => {
  const sys = machine({});
  assert.equal(findUser(sys, 'root').uid, 0);
  assert.equal(findUser(sys, 'hero').uid, 1000);
  assert.equal(findGroup(sys, 'hero').gid, 1000);
  assert.equal(homeOf(sys, 'daemon'), '/usr/sbin');
});

test('a user belongs to the primary group of its passwd line and to the groups that list it, primary first', () => {
  const sys = machine();
  assert.deepEqual(memberGroups(sys, findUser(sys, 'hero')), [{ name: 'hero', gid: 1000 }, { name: 'scribes', gid: 1002 }]);
  assert.deepEqual(memberGroups(sys, findUser(sys, 'oren')), [{ name: null, gid: 1003 }]);
});

test('the shell keeps the groups of its login until the next login', () => {
  const sys = machine();
  assert.deepEqual(groupNames(sys), ['hero']);
  sys.gids = loginGids(sys);
  assert.deepEqual(groupNames(sys), ['hero', 'scribes']);
});

test('known users and homes follow /etc/passwd', () => {
  const sys = machine();
  assert.ok(knownUsers(sys).has('oren'));
  assert.equal(homeOf(sys, 'mira'), '/home/mira');
  assert.equal(homeOf(sys, 'nosuch'), null);
});

test('an owner shows by name, a number that names nobody shows as the number', () => {
  const sys = machine();
  assert.deepEqual(ownerLabel(sys, 'mira', false), { text: 'mira', numeric: false });
  assert.deepEqual(ownerLabel(sys, '1001', false), { text: 'mira', numeric: false });
  assert.deepEqual(ownerLabel(sys, '4321', false), { text: '4321', numeric: true });
  assert.deepEqual(ownerLabel(sys, 'mira', true), { text: '1001', numeric: true });
  assert.deepEqual(groupLabel(sys, 'scribes', true), { text: '1002', numeric: true });
  assert.deepEqual(groupLabel(sys, '1003', false), { text: '1003', numeric: true });
});
