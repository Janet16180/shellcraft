import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biomeFor, BIOMES } from '../../src/map/biomes.js';

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
