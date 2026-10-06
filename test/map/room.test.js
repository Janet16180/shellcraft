import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRoom, itemKind } from '../../src/map/room.js';
import { file, dir } from '../../src/backend/spec.js';
import { observe, sampleTree } from './fixtures.js';

const names = list => list.map(entry => entry.name);
const none = new Set();

test('directories become doors and files become items, each with its absolute path', () => {
  const room = readRoom(observe('/home/hero/forest'), none);
  assert.deepEqual(names(room.doors), ['cave', 'clearing', 'river']);
  assert.equal(room.doors[0].path, '/home/hero/forest/cave');
  assert.deepEqual(names(readRoom(observe('/etc'), none).items), ['hostname', 'motd', 'passwd', 'shadow']);
});

test('entries sort in C.UTF-8 byte order, capitals before lowercase', () => {
  const tree = sampleTree();
  tree.children.tmp.children = { b: file(''), B: file(''), a: file(''), '_x': file(''), Z: file('') };
  assert.deepEqual(names(readRoom(observe('/tmp', { tree }), none).items), ['B', 'Z', '_x', 'a', 'b']);
});

test('hidden entries appear only in a directory that was revealed', () => {
  const obs = observe('/home/hero');
  assert.equal(names(readRoom(obs, none).items).includes('.secret_map'), false);
  const revealed = readRoom(obs, new Set(['/home/hero']));
  assert.deepEqual(names(revealed.items), ['.secret_map', 'readme.txt']);
  assert.equal(revealed.items[0].hidden, true);
  assert.equal(revealed.items[1].hidden, false);
});

test('a door the player may not enter is locked and an item they may not read is locked', () => {
  const root = readRoom(observe('/'), none);
  assert.equal(root.doors.find(d => d.name === 'root').locked, true);
  assert.equal(root.doors.find(d => d.name === 'etc').locked, false);
  const etc = readRoom(observe('/etc'), none);
  assert.equal(etc.items.find(i => i.name === 'shadow').locked, true);
  assert.equal(etc.items.find(i => i.name === 'passwd').locked, false);
  assert.equal(readRoom(observe('/home'), none).doors.find(d => d.name === 'alice').locked, true);
});

test('group membership decides access through the group bits', () => {
  const obs = observe('/var/log');
  assert.equal(readRoom(obs, none).items.find(i => i.name === 'auth.log').locked, true);
  obs.groups = ['hero', 'adm'];
  assert.equal(readRoom(obs, none).items.find(i => i.name === 'auth.log').locked, false);
});

test('an item is runnable only when the player may execute it', () => {
  const gate = readRoom(observe('/home/hero/gate'), none);
  assert.equal(gate.items.find(i => i.name === 'open_gate.sh').runnable, false);
  assert.equal(gate.items.find(i => i.name === 'spell.sh').runnable, true);
});

test('the exit leads to the parent, and / has no exit', () => {
  assert.equal(readRoom(observe('/home/hero'), none).exit, '/home');
  assert.equal(readRoom(observe('/etc'), none).exit, '/');
  assert.equal(readRoom(observe('/'), none).exit, null);
});

test('a directory the player may enter but not list is dark and shows nothing', () => {
  const tree = sampleTree();
  tree.children.tmp = dir({ hidden_loot: file('') }, { mode: 0o711 });
  const room = readRoom(observe('/tmp', { tree }), none);
  assert.equal(room.status, 'dark');
  assert.deepEqual(room.doors, []);
  assert.deepEqual(room.items, []);
  assert.equal(room.exit, '/');
});

test('a working directory that no longer exists is gone and empty', () => {
  const tree = sampleTree();
  delete tree.children.tmp;
  const room = readRoom(observe('/tmp', { tree }), none);
  assert.equal(room.status, 'gone');
  assert.deepEqual(room.items, []);
});

test('an ordinary room is open', () => {
  assert.equal(readRoom(observe('/etc'), none).status, 'open');
});

test('item kinds follow the name, the permissions and the place', () => {
  const item = (name, extra = {}) => ({ name, path: `/x/${name}`, hidden: false, locked: false, runnable: false, ...extra });
  assert.equal(itemKind(item('ruby.gem'), 'tower'), 'gem');
  assert.equal(itemKind(item('ancient_key.txt'), 'cave'), 'key');
  assert.equal(itemKind(item('monkey.txt'), 'forest'), 'scroll');
  assert.equal(itemKind(item('campfire.txt'), 'camp'), 'fire');
  assert.equal(itemKind(item('open_gate.sh'), 'gate'), 'potion');
  assert.equal(itemKind(item('ls', { runnable: true }), 'armory'), 'potion');
  assert.equal(itemKind(item('syslog'), 'scriptorium'), 'book');
  assert.equal(itemKind({ ...item('null'), path: '/dev/null' }, 'pit'), 'void');
  assert.equal(itemKind(item('readme.txt'), 'cottage'), 'scroll');
});
