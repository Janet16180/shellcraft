/**
 * The map key: each picture on the map and what it really is on a Linux system.
 */

import { esc } from './output.js';

/** Sprite kinds with the plain truth behind each one. */
export const ROSTER = [
  { kind: 'hero', name: 'You', what: 'Where you stand is your working directory: what pwd prints.' },
  { kind: 'door', name: 'Door', what: 'A directory. cd NAME walks through it.' },
  { kind: 'exit', name: 'Way back', what: 'The parent directory, .. (cd .. goes up).' },
  { kind: 'item', name: 'Item', what: 'A file. cat NAME prints what is in it.' },
  { kind: 'locked', name: 'Padlocked door', what: 'A directory you have no permission to enter.' },
  { kind: 'chained', name: 'Chained item', what: 'A file you have no permission to read.' },
];

/**
 * Fill the map key list.
 *
 * @param {HTMLElement} list The <ul> to fill.
 * @param {(canvas: HTMLCanvasElement, kind: string) => void} [drawSprite] Draws one sprite; without it a plain marker stands in.
 * @returns {void}
 */
export function renderRoster(list, drawSprite) {
  list.innerHTML = ROSTER.map(({ kind, name, what }) =>
    `<li><canvas width="40" height="40" data-kind="${kind}" aria-hidden="true"></canvas><div><b>${esc(name)}</b><span>${esc(what)}</span></div></li>`).join('');
  if (!drawSprite) return;
  for (const canvas of list.querySelectorAll('canvas')) drawSprite(canvas, canvas.dataset.kind);
}
