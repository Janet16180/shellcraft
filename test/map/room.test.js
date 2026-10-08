import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRoom, itemKind, picksOf, realPath } from '../../src/map/room.js';
import { file, dir, symlink } from '../../src/backend/spec.js';
import { observe, sampleTree } from './fixtures.js';
import { packTar, gzip } from '../../src/backend/archive.js';

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

test('names beyond the basic plane sort by code point, as ls does in C.UTF-8', () => {
  const tree = sampleTree();
  tree.children.tmp.children = { '\u{1F600}.txt': file(''), '\uFF5E.txt': file('') };
  assert.deepEqual(names(readRoom(observe('/tmp', { tree }), none).items), ['\uFF5E.txt', '\u{1F600}.txt']);
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

test('a door without x is locked; a door with x but without r is dark: you may enter but not see inside', () => {
  const tree = sampleTree();
  const mine = mode => dir({ 'key.txt': file('', { owner: 'hero' }) }, { owner: 'hero', mode });
  tree.children.home.children.hero.children.hall = dir({ shut: mine(0o600), blind: mine(0o300), open: mine(0o700), peek: mine(0o400) }, { owner: 'hero' });
  const doors = Object.fromEntries(readRoom(observe('/home/hero/hall', { tree }), none).doors.map(d => [d.name, d]));
  assert.deepEqual([doors.shut.locked, doors.shut.dark], [true, false]);
  assert.deepEqual([doors.peek.locked, doors.peek.dark], [true, false]);
  assert.deepEqual([doors.blind.locked, doors.blind.dark], [false, true]);
  assert.deepEqual([doors.open.locked, doors.open.dark], [false, false]);
});

test('every entry carries its owner, and items are never dark', () => {
  const room = readRoom(observe('/home'), none);
  assert.equal(room.doors.find(d => d.name === 'alice').owner, 'alice');
  assert.equal(readRoom(observe('/etc'), none).items.find(i => i.name === 'shadow').owner, 'root');
  assert.equal(readRoom(observe('/etc'), none).items.every(i => i.dark === false), true);
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

test('the picks of a room are its doors, then its items, then the exit, with their locks', () => {
  const picks = picksOf(readRoom(observe('/etc'), none));
  assert.deepEqual(picks.map(p => `${p.kind}:${p.name}`), ['door:apt', 'item:hostname', 'item:motd', 'item:passwd', 'item:shadow', 'exit:..']);
  assert.deepEqual(picks.at(-1), { kind: 'exit', name: '..', path: '/', locked: false });
  assert.equal(picks.find(p => p.name === 'shadow').locked, true);
  assert.equal(picks[0].path, '/etc/apt');
});

test('the root offers no exit pick and a revealed room offers its hidden files', () => {
  assert.equal(picksOf(readRoom(observe('/'), none)).some(p => p.kind === 'exit'), false);
  const home = picksOf(readRoom(observe('/home/hero'), new Set(['/home/hero'])));
  assert.ok(home.some(p => p.name === '.secret_map'));
});

const withPortals = () => {
  const tree = sampleTree();
  Object.assign(tree.children.home.children.hero.children, {
    portal: symlink('/home/hero/forest/cave/deep', { owner: 'hero' }),
    broken: symlink('nowhere', { owner: 'hero' }),
  });
  return tree;
};

test('a symbolic link is an item for now, even one to a directory or one that leads nowhere', () => {
  const room = readRoom(observe('/home/hero', { tree: withPortals() }), none);
  assert.deepEqual(names(room.items), ['broken', 'portal', 'readme.txt']);
  assert.equal(names(room.doors).includes('portal'), false);
  assert.equal(room.items[1].locked, false);
});

test('standing in a directory reached through a link shows where it leads, and .. goes back the way it came', () => {
  const room = readRoom(observe('/home/hero/portal', { tree: withPortals() }), none);
  assert.equal(room.status, 'open');
  assert.deepEqual(names(room.items), ['ancient_key.txt']);
  assert.equal(room.items[0].path, '/home/hero/portal/ancient_key.txt');
  assert.equal(room.exit, '/home/hero');
});

test('a link item knows its target and whether it leads anywhere, and is never runnable', () => {
  const room = readRoom(observe('/home/hero', { tree: withPortals() }), none);
  const [broken, portal, readme] = room.items;
  assert.deepEqual([portal.link, portal.dangling, portal.runnable], ['/home/hero/forest/cave/deep', false, false]);
  assert.deepEqual([broken.link, broken.dangling, broken.runnable], ['nowhere', true, false]);
  assert.deepEqual([readme.link, readme.dangling], [null, false]);
  assert.equal(itemKind(portal, 'cottage'), 'portal');
  assert.equal(itemKind(broken, 'cottage'), 'portal');
});

test('the real path of a directory reached through a link is where the link leads', () => {
  const tree = withPortals();
  assert.equal(realPath(tree, '/home/hero/portal'), '/home/hero/forest/cave/deep');
  assert.equal(realPath(tree, '/home/hero/forest'), '/home/hero/forest');
  assert.equal(realPath(tree, '/'), '/');
  assert.equal(realPath(tree, '/home/hero/broken'), '/home/hero/broken');
});

test('a file with more than one name carries its inode as its twin mark; a file with one name has none', () => {
  const tree = sampleTree();
  const hero = tree.children.home.children.hero.children;
  hero['scroll.txt'] = { ...file('A map.\n', { owner: 'hero' }), ino: 1847, links: 2 };
  hero['copy.txt'] = { ...file('A map.\n', { owner: 'hero' }), ino: 1847, links: 2 };
  hero['readme.txt'] = { ...hero['readme.txt'], ino: 12, links: 1 };
  hero.old_portal = { ...symlink('scroll.txt', { owner: 'hero' }), ino: 1900, links: 1 };
  const items = Object.fromEntries(readRoom(observe('/home/hero', { tree }), none).items.map(item => [item.name, item.twin]));
  assert.deepEqual(items, { 'copy.txt': 1847, old_portal: null, 'readme.txt': null, 'scroll.txt': 1847 });
});

test('a directory never gets a twin mark, whatever its link count', () => {
  const tree = sampleTree();
  tree.children.home.children.hero.children.forest.ino = 40;
  tree.children.home.children.hero.children.forest.links = 4;
  const forest = readRoom(observe('/home/hero', { tree }), none).doors.find(door => door.name === 'forest');
  assert.equal(forest.twin, null);
});

const packed = () => {
  const mine = { owner: 'hero' };
  const t = Date.UTC(2026, 9, 1, 12, 0);
  const tar = packTar([
    { path: 'library/', type: 'dir', mode: 0o755, owner: 'hero', group: 'hero', mtime: t },
    { path: 'library/scroll.txt', type: 'file', mode: 0o644, owner: 'hero', group: 'hero', mtime: t, content: 'Old words.\n' },
  ]);
  const tree = sampleTree();
  tree.children.home.children.hero.children.travel = dir({
    'library.tar': file(tar, mine),
    'library.tar.gz': file(gzip(tar), mine),
    'notes.txt.gz': file(gzip('Notes.\n', { name: 'notes.txt' }), mine),
    'disguised.dat': file(gzip(tar), mine),
    'empty.tar': file('', mine),
    'empty.tgz': file('', mine),
    'empty.gz': file('', mine),
    'plain.txt': file('Just text.\n', mine),
  }, mine);
  return readRoom(observe('/home/hero/travel', { tree }), none);
};

test('a tar archive is packed as tar, a compressed one as tgz, other gzip data as gzip, by what is inside', () => {
  const pack = Object.fromEntries(packed().items.map(item => [item.name, item.pack]));
  assert.equal(pack['library.tar'], 'tar');
  assert.equal(pack['library.tar.gz'], 'tgz');
  assert.equal(pack['notes.txt.gz'], 'gzip');
  assert.equal(pack['disguised.dat'], 'tgz');
  assert.equal(pack['plain.txt'], null);
});

test('a file that is no archive inside still looks packed when its name says so', () => {
  const pack = Object.fromEntries(packed().items.map(item => [item.name, item.pack]));
  assert.deepEqual([pack['empty.tar'], pack['empty.tgz'], pack['empty.gz']], ['tar', 'tgz', 'gzip']);
});

test('archives are chests, a compressed archive a strapped chest, and gzip data a tied bundle', () => {
  const kind = Object.fromEntries(packed().items.map(item => [item.name, itemKind(item, 'departure')]));
  assert.equal(kind['library.tar'], 'chest');
  assert.equal(kind['library.tar.gz'], 'strapped');
  assert.equal(kind['notes.txt.gz'], 'bundle');
  assert.equal(kind['plain.txt'], 'scroll');
});

test('directories and links are never packed', () => {
  const tree = withPortals();
  tree.children.home.children.hero.children['box.tar'] = dir({}, { owner: 'hero' });
  tree.children.home.children.hero.children['link.tar'] = symlink('readme.txt', { owner: 'hero' });
  const room = readRoom(observe('/home/hero', { tree }), none);
  assert.equal(room.doors.find(d => d.name === 'box.tar').pack, null);
  assert.equal(room.items.find(i => i.name === 'link.tar').pack, null);
  assert.equal(itemKind(room.items.find(i => i.name === 'link.tar'), 'cottage'), 'portal');
});
