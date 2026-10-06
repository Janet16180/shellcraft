/**
 * Which kind of place a directory is. The player's home and everything below
 * it is the bright overworld; the rest of the system is the dungeon, with a
 * few rooms that say what their directory really holds.
 */

import { isInside } from '../backend/tree.js';
import { joinPath } from './paths.js';

/**
 * Every biome: its realm, the name shown to the player, and its colours. The
 * overworld keeps the original game's palette (wall bricks, floor, door, trim); the
 * dungeon draws from Ring Zero's 16 colours (palette.js) and only names an
 * accent letter for banners and rugs.
 */
export const BIOMES = {
  cottage: { realm: 'overworld', name: 'Your Cottage', wall: ['#4a2f25', '#5e3d30'], floor: '#8a6446', door: '#2e1a10', trim: '#c9a26b' },
  forest: { realm: 'overworld', name: 'Whispering Forest', wall: ['#173a24', '#224d31'], floor: '#4f8a3c', door: '#2b1d12', trim: '#9bd36a' },
  river: { realm: 'overworld', name: 'The River', wall: ['#173a24', '#224d31'], floor: '#4f8a3c', door: '#2b1d12', trim: '#7fd0e8' },
  cave: { realm: 'overworld', name: 'Dark Cave', wall: ['#22232f', '#2d2f3f'], floor: '#474a5d', door: '#0c0c14', trim: '#8a8fb5' },
  camp: { realm: 'overworld', name: 'Your Camp', wall: ['#173a24', '#224d31'], floor: '#6b8a3c', door: '#2b1d12', trim: '#ffb347' },
  junk: { realm: 'overworld', name: 'Cursed Junkyard', wall: ['#3e2a20', '#50372a'], floor: '#7a5a3a', door: '#22150e', trim: '#d08a4a' },
  library: { realm: 'overworld', name: 'Great Library', wall: ['#2f1c35', '#3d2545'], floor: '#6b4a3a', door: '#1c0e22', trim: '#e0b85a' },
  tower: { realm: 'overworld', name: 'Tower of Echoes', wall: ['#221a42', '#2e2356'], floor: '#4b3f7a', door: '#120c26', trim: '#b59cff' },
  market: { realm: 'overworld', name: 'Market of Pipes', wall: ['#5a3019', '#6c3b20'], floor: '#b08850', door: '#331b0d', trim: '#ffd36b' },
  gate: { realm: 'overworld', name: 'Sealed Gate', wall: ['#33373e', '#40454d'], floor: '#62676f', door: '#1a1c21', trim: '#c7ccd6' },
  hall: { realm: 'dungeon', name: 'Entrance Hall', accent: 'p' },
  archive: { realm: 'dungeon', name: 'Hall of Scrolls', accent: 'u' },
  scriptorium: { realm: 'dungeon', name: 'Scriptorium', accent: 'r' },
  cellar: { realm: 'dungeon', name: 'Cellar', accent: 'r' },
  scrap: { realm: 'dungeon', name: 'Scrap Room', accent: 'g' },
  gatehouse: { realm: 'dungeon', name: 'Gatehouse', accent: 'b' },
  quarters: { realm: 'dungeon', name: "Someone Else's Quarters", accent: 'u' },
  vault: { realm: 'dungeon', name: 'Sealed Vault', accent: 'e' },
  armory: { realm: 'dungeon', name: 'Armory of Commands', accent: 'e' },
  workshop: { realm: 'dungeon', name: 'Workshop', accent: 'b' },
  pit: { realm: 'dungeon', name: 'Hall of Devices', accent: 'p' },
  corridor: { realm: 'dungeon', name: 'Dungeon Corridor', accent: 'd' },
};

const OVERWORLD_AREAS = [
  ['forest/cave', 'cave'], ['forest/river', 'river'], ['forest', 'forest'], ['camp', 'camp'], ['junk', 'junk'],
  ['library', 'library'], ['tower', 'tower'], ['market', 'market'], ['gate', 'gate'],
];

const DUNGEON_ROOMS = [['/', 'hall'], ['/home', 'gatehouse']];

const DUNGEON_WINGS = [
  ['/home', 'quarters'], ['/var/log', 'scriptorium'], ['/var', 'cellar'], ['/etc', 'archive'], ['/tmp', 'scrap'],
  ['/root', 'vault'], ['/usr/bin', 'armory'], ['/usr/sbin', 'armory'], ['/bin', 'armory'], ['/sbin', 'armory'],
  ['/usr', 'workshop'], ['/dev', 'pit'],
];

const firstMatch = (rules, path, place = at => at) => rules.find(([at]) => isInside(path, place(at)));

function overworldBiome(path, home) {
  return firstMatch(OVERWORLD_AREAS, path, area => joinPath(home, area))?.[1] ?? 'cottage';
}

function dungeonBiome(path) {
  const room = DUNGEON_ROOMS.find(([at]) => at === path) ?? firstMatch(DUNGEON_WINGS, path);
  return room?.[1] ?? 'corridor';
}

/**
 * The biome of a directory.
 *
 * @param {string} path Absolute path of the directory.
 * @param {string} home Absolute path of the player's home.
 * @returns {{realm: 'overworld'|'dungeon', biome: string, name: string}} Its realm, biome id (a key of BIOMES) and name.
 * @throws {Error} If either path is not absolute.
 */
export function biomeFor(path, home) {
  if (!path.startsWith('/') || !home.startsWith('/')) throw new Error(`biomeFor needs absolute paths, got ${path} and ${home}`);

  const biome = isInside(path, home) ? overworldBiome(path, home) : dungeonBiome(path);
  return { realm: BIOMES[biome].realm, biome, name: BIOMES[biome].name };
}
