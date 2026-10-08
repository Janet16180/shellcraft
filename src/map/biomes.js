/**
 * Which kind of place a directory is. The player's home and everything below
 * it is the bright overworld; the rest of the system is the dungeon, with a
 * few rooms that say what their directory really holds.
 */

import { isInside, joinPath } from '../backend/tree.js';

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
  mirrors: { realm: 'overworld', name: 'Hall of Mirrors', wall: ['#26304a', '#34436a'], floor: '#4d5a78', door: '#161c30', trim: '#cfe6ff' },
  well: { realm: 'overworld', name: 'Wishing Well', wall: ['#1f3a2c', '#2a4a38'], floor: '#5d7f48', door: '#1c2a1e', trim: '#8fd0e0' },
  den: { realm: 'overworld', name: 'Imp Den', wall: ['#2a1410', '#3a1c16'], floor: '#4a2a1e', door: '#120806', trim: '#ff7a3d' },
  forge: { realm: 'overworld', name: 'The Forge', wall: ['#2b2220', '#3b2d28'], floor: '#4e413a', door: '#1a1210', trim: '#ffa040' },
  ore: { realm: 'overworld', name: 'Ore Pile', wall: ['#2a2622', '#3a332c'], floor: '#5a4e44', door: '#18140f', trim: '#e0b060' },
  outpost: { realm: 'overworld', name: 'Guild Outpost', wall: ['#173a24', '#224d31'], floor: '#5f8a42', door: '#2b1d12', trim: '#d8b45a' },
  commons: { realm: 'overworld', name: 'Common Hall', wall: ['#4a2a22', '#5c362b'], floor: '#9a6c44', door: '#2a160e', trim: '#e8c070' },
  strongroom: { realm: 'overworld', name: 'Strongroom', wall: ['#2c3038', '#3a3f49'], floor: '#555a64', door: '#16181d', trim: '#e0b84a' },
  records: { realm: 'overworld', name: 'Records Room', wall: ['#2f2238', '#3d2c48'], floor: '#6e5444', door: '#1a1020', trim: '#d9c8a0' },
  shared: { realm: 'overworld', name: 'Shared Room', wall: ['#3a2a1a', '#4b3722'], floor: '#8a7048', door: '#22160c', trim: '#c792ff' },
  hall: { realm: 'dungeon', name: 'Entrance Hall', accent: 'p' },
  archive: { realm: 'dungeon', name: 'Hall of Scrolls', accent: 'u' },
  scriptorium: { realm: 'dungeon', name: 'Scriptorium', accent: 'r' },
  cellar: { realm: 'dungeon', name: 'Cellar', accent: 'r' },
  scrap: { realm: 'dungeon', name: 'Scrap Room', accent: 'g' },
  gatehouse: { realm: 'dungeon', name: 'Gatehouse', accent: 'b' },
  quarters: { realm: 'dungeon', name: "Someone Else's Quarters", accent: 'u' },
  vault: { realm: 'dungeon', name: 'Sealed Vault', accent: 'e' },
  armory: { realm: 'dungeon', name: 'Armory of Commands', accent: 'e' },
  guild: { realm: 'dungeon', name: 'Guild of New Commands', accent: 'G' },
  services: { realm: 'dungeon', name: 'Service Wing', accent: 'y' },
  guildhall: { realm: 'dungeon', name: 'Guild Hall', accent: 'e' },
  guildarchive: { realm: 'dungeon', name: 'Guild Archive', accent: 'v' },
  workshop: { realm: 'dungeon', name: 'Workshop', accent: 'b' },
  pit: { realm: 'dungeon', name: 'Hall of Devices', accent: 'p' },
  corridor: { realm: 'dungeon', name: 'Dungeon Corridor', accent: 'd' },
};

const OVERWORLD_AREAS = [
  ['forest/cave', 'cave'], ['forest/river', 'river'], ['forest', 'forest'], ['camp', 'camp'], ['junk', 'junk'],
  ['library', 'library'], ['tower', 'tower'], ['market', 'market'], ['gate', 'gate'], ['mirrors', 'mirrors'],
  ['well', 'well'], ['den', 'den'], ['forge/ore', 'ore'], ['forge', 'forge'],
  ['guild', 'outpost'], ['hall/vault', 'strongroom'], ['hall/archive', 'records'], ['hall/shared', 'shared'], ['hall', 'commons'],
];

const DUNGEON_ROOMS = [['/', 'hall'], ['/home', 'gatehouse']];

const DUNGEON_WINGS = [
  ['/home', 'quarters'], ['/var/log', 'scriptorium'], ['/var', 'cellar'], ['/etc', 'archive'], ['/tmp', 'scrap'],
  ['/root', 'vault'], ['/usr/bin', 'armory'], ['/usr/sbin', 'armory'], ['/usr/local', 'guild'], ['/bin', 'armory'], ['/sbin', 'armory'],
  ['/usr', 'workshop'], ['/dev', 'pit'],
  ['/srv/guild/archive', 'guildarchive'], ['/srv/guild', 'guildhall'], ['/srv', 'services'],
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
