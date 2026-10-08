/**
 * The map key (each picture on the map and what it really is on a Linux
 * system) and the row of room picks that lets keyboard players do what a
 * click on the map does.
 */

import { esc } from './output.js';
import { parentOf } from '../backend/tree.js';

/**
 * The pictures the vertical slice shows, with the plain truth behind each one.
 * `what` is HTML: anything the player might type is in <code>, and the paths
 * come from the player's own home.
 *
 * @param {string} home The player's home directory, from the View or the observation.
 * @returns {{kind: string, name: string, what: string}[]} The map key entries, in order.
 */
export function roster(home) {
  const homeCode = `<code>${esc(home)}</code>`;
  const parentCode = `<code>${esc(parentOf(home))}</code>`;
  return [
    { kind: 'hero', name: 'You', what: 'Where you stand is your working directory, the path <code>pwd</code> prints.' },
    { kind: 'door', name: 'Door', what: 'A directory. <code>cd NAME</code> walks through it.' },
    { kind: 'item', name: 'Item', what: 'A file. <code>cat NAME</code> prints what is in it.' },
    { kind: 'exit', name: 'Way out', what: 'The parent directory, <code>..</code>: the room this one sits in. <code>cd ..</code> takes you there.' },
    { kind: 'stairs-down', name: 'Stairs down', what: `The way back from your home: its parent, ${parentCode}, is outside your home, so the stairs lead down into the dungeon.` },
    { kind: 'dungeon-door', name: 'Dungeon door', what: 'A directory outside your home. Most of them belong to root, the administrator.' },
    { kind: 'home-door', name: 'Door home', what: `In ${parentCode}, the door to your home directory, ${homeCode}.` },
    { kind: 'locked', name: 'Padlocked door', what: 'A directory you have no permission to enter.' },
    { kind: 'dark-door', name: 'Dark door', what: 'A directory you may enter but not list: it has x but no r for you.' },
    { kind: 'chained', name: 'Chained item', what: 'A file you have no permission to read.' },
    { kind: 'job', name: 'Job', what: 'A command you started with <code>&amp;</code> at the end, or paused with Ctrl+Z, in the corner of every room. <code>%1</code> is its number for <code>fg</code>, <code>bg</code> and <code>kill %1</code>. It hammers while it runs and sleeps while it is stopped.' },
    { kind: 'archive', name: 'Chest', what: 'An archive: many files packed into one with <code>tar</code>. Strapped with rope when it is also compressed (<code>.tar.gz</code>).' },
    { kind: 'bundle', name: 'Tied bundle', what: 'One file compressed with <code>gzip</code>. <code>zcat NAME</code> prints the text inside.' },
    { kind: 'twins', name: 'Matching runes', what: 'Two names of one file (hard links, made with <code>ln</code>): <code>ls -i</code> shows the same inode number.' },
  ];
}

const KEY_PX = 40;

/**
 * Fill the map key list with each picture and its explanation.
 *
 * @param {HTMLElement} list The <ul> to fill.
 * @param {(canvas: HTMLCanvasElement, kind: string) => void} drawKey The map's key painter.
 * @param {number} pixelRatio The device pixel ratio, so the pictures stay crisp.
 * @param {string} home The player's home directory.
 * @returns {void}
 */
export function renderRoster(list, drawKey, pixelRatio, home) {
  const size = Math.round(KEY_PX * pixelRatio);
  list.innerHTML = roster(home).map(({ kind, name, what }) =>
    `<li><canvas width="${size}" height="${size}" data-kind="${kind}" aria-hidden="true"></canvas><div><b>${esc(name)}</b><span>${what}</span></div></li>`).join('');
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
