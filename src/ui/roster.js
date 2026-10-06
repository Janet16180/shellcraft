/**
 * The map key (each picture on the map and what it really is on a Linux
 * system) and the row of room picks that lets keyboard players do what a
 * click on the map does.
 */

import { esc } from './output.js';

/** The pictures the vertical slice shows, with the plain truth behind each one. */
export const ROSTER = [
  { kind: 'hero', name: 'You', what: 'Where you stand is your working directory, the path pwd prints.' },
  { kind: 'door', name: 'Door', what: 'A directory. cd NAME walks through it.' },
  { kind: 'item', name: 'Item', what: 'A file. cat NAME prints what is in it.' },
  { kind: 'exit', name: 'Way back', what: 'The parent directory, .. (cd .. goes up one level).' },
  { kind: 'stairs-down', name: 'Stairs down', what: 'The way back from your home: its parent, /home, is outside your home, so the stairs lead down into the dungeon.' },
  { kind: 'dungeon-door', name: 'Dungeon door', what: 'A directory outside your home. Most of them belong to root, the administrator.' },
  { kind: 'home-door', name: 'Door home', what: 'In /home, the door to your home directory, /home/hero.' },
  { kind: 'locked', name: 'Padlocked door', what: 'A directory you have no permission to enter.' },
  { kind: 'chained', name: 'Chained item', what: 'A file you have no permission to read.' },
];

/**
 * Fill the map key list with each picture and its explanation.
 *
 * @param {HTMLElement} list The <ul> to fill.
 * @param {(canvas: HTMLCanvasElement, kind: string) => void} drawKey The map's key painter.
 * @returns {void}
 */
export function renderRoster(list, drawKey) {
  list.innerHTML = ROSTER.map(({ kind, name, what }) =>
    `<li><canvas width="40" height="40" data-kind="${kind}" aria-hidden="true"></canvas><div><b>${esc(name)}</b><span>${esc(what)}</span></div></li>`).join('');
  for (const canvas of list.querySelectorAll('canvas')) drawKey(canvas, canvas.dataset.kind);
}

/**
 * Buttons for the doors, items and way back of the room on show, in the
 * map's order. Each carries its index in the picks list.
 *
 * @param {{kind: 'door'|'item'|'exit', name: string, locked: boolean}[]} picks From map.picks().
 * @returns {string} HTML.
 */
export function picksHTML(picks) {
  return picks.map(({ kind, name, locked }, i) => {
    const shown = kind === 'door' ? `${name}/` : name;
    const label = locked ? ` aria-label="${esc(shown)}, ${kind === 'door' ? 'padlocked' : 'chained'}"` : '';
    return `<button class="px-btn small ghost" type="button" data-pick="${i}"${label}>${esc(shown)}</button>`;
  }).join('');
}
