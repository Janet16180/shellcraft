import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biomeFor, placeOf, BIOMES } from '../../src/map/biomes.js';
import { symlink } from '../../src/backend/spec.js';
import { sampleTree, observe } from './fixtures.js';

const HOME = '/home/hero';
const at = path => biomeFor(path, HOME).biome;

test('home and everything below it is the overworld', () => {
  for (const path of [HOME, `${HOME}/forest`, `${HOME}/anything/new`]) {
    assert.equal(biomeFor(path, HOME).realm, 'overworld', path);
  }
});

test('everything outside home is the dungeon', () => {
  for (const path of ['/', '/home', '/etc', '/home/alice', '/home/hero2', '/usr/bin']) {
    assert.equal(biomeFor(path, HOME).realm, 'dungeon', path);
  }
});

test('home itself is the cottage and the original areas keep their biomes', () => {
  assert.equal(at(HOME), 'cottage');
  assert.equal(at(`${HOME}/forest`), 'forest');
  assert.equal(at(`${HOME}/forest/clearing`), 'forest');
  assert.equal(at(`${HOME}/forest/river`), 'river');
  assert.equal(at(`${HOME}/forest/cave/deep`), 'cave');
  assert.equal(at(`${HOME}/junk/cobwebs`), 'junk');
  for (const area of ['camp', 'library', 'tower', 'market', 'gate']) assert.equal(at(`${HOME}/${area}`), area);
});

test('the act II areas have biomes of their own', () => {
  assert.equal(at(`${HOME}/mirrors`), 'mirrors');
  assert.equal(at(`${HOME}/mirrors/inner`), 'mirrors');
  assert.equal(at(`${HOME}/well`), 'well');
  assert.equal(at(`${HOME}/well/stones`), 'well');
  assert.equal(at(`${HOME}/den`), 'den');
  assert.equal(at(`${HOME}/forge`), 'forge');
  assert.equal(at(`${HOME}/forge/ore`), 'ore');
  assert.equal(biomeFor(`${HOME}/well`, HOME).name, 'Wishing Well');
  assert.equal(biomeFor(`${HOME}/den`, HOME).name, 'Imp Den');
  assert.equal(biomeFor(`${HOME}/forge`, HOME).name, 'The Forge');
  assert.equal(biomeFor(`${HOME}/mirrors`, HOME).name, 'Hall of Mirrors');
});

test('every overworld biome has its colours', () => {
  for (const [id, biome] of Object.entries(BIOMES).filter(([, b]) => b.realm === 'overworld')) {
    assert.equal(biome.wall.length, 2, id);
    for (const colour of [...biome.wall, biome.floor, biome.door, biome.trim]) assert.match(colour, /^#[0-9a-f]{6}$/, id);
  }
});

test('a directory the player makes at home looks like part of the cottage', () => {
  assert.equal(at(`${HOME}/notes`), 'cottage');
});

test('system directories get rooms that say what they hold', () => {
  assert.equal(at('/'), 'hall');
  assert.equal(at('/etc'), 'archive');
  assert.equal(at('/etc/apt'), 'archive');
  assert.equal(at('/var/log'), 'scriptorium');
  assert.equal(at('/var'), 'cellar');
  assert.equal(at('/tmp'), 'scrap');
  assert.equal(at('/home'), 'gatehouse');
  assert.equal(at('/home/alice'), 'quarters');
  assert.equal(at('/root'), 'vault');
  assert.equal(at('/usr/bin'), 'armory');
  assert.equal(at('/usr/local/bin'), 'guild');
  assert.equal(at('/usr/local'), 'guild');
  assert.equal(biomeFor('/usr/local/bin', HOME).name, 'Guild of New Commands');
  assert.equal(at('/usr'), 'workshop');
  assert.equal(at('/dev'), 'pit');
  assert.equal(at('/opt/unknown'), 'corridor');
});

test('for root, /root is home and so it is the overworld', () => {
  assert.deepEqual(biomeFor('/root', '/root'), { realm: 'overworld', biome: 'cottage', name: BIOMES.cottage.name });
  assert.equal(biomeFor('/home/hero', '/root').realm, 'dungeon');
});

test('every biome has a realm and a name', () => {
  for (const [id, biome] of Object.entries(BIOMES)) {
    assert.ok(['overworld', 'dungeon'].includes(biome.realm), id);
    assert.ok(biome.name.length > 0, id);
  }
});

test('a relative path is a bug and raises', () => {
  assert.throws(() => biomeFor('forest', HOME), /absolute/);
  assert.throws(() => biomeFor('/etc', '~'), /absolute/);
});

test('the guild wing under /srv has a hall, and an archive room of its own', () => {
  assert.equal(at('/srv'), 'services');
  assert.equal(at('/srv/guild'), 'guildhall');
  assert.equal(at('/srv/guild/archive'), 'guildarchive');
  assert.equal(at('/srv/guild/archive/old'), 'guildarchive');
  assert.equal(biomeFor('/srv/guild', HOME).name, 'Guild Hall');
  assert.equal(biomeFor('/srv/guild', HOME).realm, 'dungeon');
});

test('the homes of the other people are their quarters', () => {
  for (const name of ['mira', 'oren', 'tamsin']) assert.equal(at(`/home/${name}`), 'quarters');
});

test('the act III areas at home: the guild outpost, and the common hall with its rooms', () => {
  assert.equal(at(`${HOME}/guild`), 'outpost');
  assert.equal(at(`${HOME}/hall`), 'commons');
  assert.equal(at(`${HOME}/hall/room_k4m`), 'commons');
  assert.equal(at(`${HOME}/hall/vault`), 'strongroom');
  assert.equal(at(`${HOME}/hall/archive`), 'records');
  assert.equal(at(`${HOME}/hall/shared`), 'shared');
  for (const area of ['guild', 'hall', 'hall/vault', 'hall/archive', 'hall/shared']) {
    assert.equal(biomeFor(`${HOME}/${area}`, HOME).realm, 'overworld', area);
  }
  assert.equal(biomeFor(`${HOME}/hall`, HOME).name, 'Common Hall');
});

test('a place reached through a link is named for where it really is', () => {
  const tree = sampleTree();
  tree.children.home.children.hero.children.portal = symlink('/home/hero/forest/cave/deep', { owner: 'hero' });
  tree.children.home.children.hero.children.down = symlink('/etc', { owner: 'hero' });
  assert.deepEqual(placeOf(observe('/home/hero/portal', { tree })), { realm: 'overworld', biome: 'cave', name: 'Dark Cave' });
  assert.equal(placeOf(observe('/home/hero/down', { tree })).realm, 'dungeon');
  assert.equal(placeOf(observe('/home/hero', { tree })).biome, 'cottage');
});

test('chapter 18\'s crown room at home is the steward\'s throne room', () => {
  assert.equal(at(`${HOME}/crown`), 'throne');
  assert.deepEqual(biomeFor(`${HOME}/crown`, HOME), { realm: 'overworld', biome: 'throne', name: 'Throne Room' });
});

test('each guild service under /srv has a room of its own, and an unknown one is the service wing', () => {
  const rooms = { mill: 'The Mill', bakery: 'The Bakery', stables: 'The Stables', lighthouse: 'The Lighthouse', granary: 'The Granary' };
  for (const [service, name] of Object.entries(rooms)) {
    assert.deepEqual(biomeFor(`/srv/${service}`, HOME), { realm: 'dungeon', biome: service, name }, service);
    assert.equal(at(`/srv/${service}/old`), service);
  }
  assert.equal(at('/srv/forge'), 'services');
  assert.equal(at('/srv'), 'services');
});
