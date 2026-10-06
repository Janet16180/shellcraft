/**
 * The map in words, for screen readers: the same facts the picture shows.
 */

import { biomeFor } from './biomes.js';
import { readRoom } from './room.js';

const LISTED = 20;

function list(names) {
  const shown = names.slice(0, LISTED).join(', ');
  return names.length > LISTED ? `${shown}, and ${names.length - LISTED} more` : shown;
}

const doorName = door => `${door.name}/${door.locked ? ' (padlocked: you may not enter)' : ''}`;

function itemName(item) {
  let note = '';
  if (item.locked) note = ' (chained: you may not read it)';
  else if (item.runnable) note = ' (you may run it)';
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
 * Describe the room at the observation's working directory.
 *
 * @param {import('../backend/port.js').Observation & {groups: string[]}} obs The observation.
 * @param {{revealed?: Set<string>}} [opts] Directories whose hidden entries were revealed, as on the map.
 * @returns {string} A few short sentences.
 */
export function describeRoom(obs, { revealed = new Set() } = {}) {
  const room = readRoom(obs, revealed);
  const { realm, name } = biomeFor(obs.cwd, obs.home);
  const where = realm === 'overworld' ? 'inside your home' : 'in the dungeon, outside your home';
  const exit = room.exit ? `The exit .. leads to ${room.exit}.` : 'This is the root of everything: its .. leads back to / itself.';
  return `You are at ${obs.cwd}, ${name}, ${where}. ${contents(room)} ${exit}`;
}
