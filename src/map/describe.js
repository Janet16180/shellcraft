/**
 * The map in words, for screen readers: the same facts the picture shows.
 */

import { placeOf } from './biomes.js';
import { readRoom } from './room.js';
import { placeCreatures } from './creatures.js';
import { jobsSentence } from './jobs.js';

const LISTED = 20;

function list(names) {
  const shown = names.slice(0, LISTED).join(', ');
  return names.length > LISTED ? `${shown}, and ${names.length - LISTED} more` : shown;
}

function doorName(door) {
  let note = '';
  if (door.locked) note = ' (padlocked: you may not enter)';
  else if (door.dark) note = ' (dark: you may enter but not list it)';
  return `${door.name}/${note}`;
}

const PACKS = {
  tar: 'a tar archive, drawn as a chest',
  tgz: 'a compressed tar archive, drawn as a strapped chest',
  gzip: 'gzip data, drawn as a tied bundle',
};

function itemName(item) {
  let note = '';
  if (item.dangling) note = ` -> ${item.link} (a broken link: it leads nowhere)`;
  else if (item.link) note = ` -> ${item.link} (a link)`;
  else if (item.locked) note = ' (chained: you may not read it)';
  else if (item.runnable) note = ' (you may run it)';
  else if (item.pack) note = ` (${PACKS[item.pack]})`;
  return item.name + note;
}

function contents(room) {
  let text = '';
  if (room.status === 'gone') text = 'This directory no longer exists.';
  else if (room.status === 'dark') text = 'It is too dark to see: you have no read permission here.';
  else {
    const doors = room.doors.length ? `Doors: ${list(room.doors.map(doorName))}.` : 'No doors.';
    const items = room.items.length ? `Items: ${list(room.items.map(itemName))}.` : 'No items.';
    text = `${doors} ${items}`;
  }
  return text;
}

/**
 * Describe the room at the observation's working directory, and the player's
 * jobs, which the map shows in every room.
 *
 * @param {import('../backend/port.js').Observation & {groups: string[]}} obs The observation.
 * @param {{revealed?: Set<string>}} [opts] Directories whose hidden entries were revealed, as on the map.
 * @returns {string} A few short sentences.
 */
export function describeRoom(obs, { revealed = new Set() } = {}) {
  const room = readRoom(obs, revealed);
  const { realm, name } = placeOf(obs);
  const where = realm === 'overworld' ? 'inside your home' : 'in the dungeon, outside your home';
  const exit = room.exit ? `The exit .. leads to ${room.exit}.` : 'This is the root of everything: its .. leads back to / itself.';
  const creatures = placeCreatures(obs.procs).map(c => c.label);
  const here = creatures.length ? ` Creatures here: ${creatures.join(', ')}.` : '';
  const jobs = jobsSentence(obs.jobs);
  return `You are at ${obs.cwd}, ${name}, ${where}. ${contents(room)} ${exit}${here}${jobs ? ` ${jobs}` : ''}`;
}
