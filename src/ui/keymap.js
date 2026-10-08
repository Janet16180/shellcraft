/**
 * The keys the terminal answers, for the help under the map's "?" button.
 * They act as in bash on Ubuntu; terminal.js does what they say.
 */

import { esc } from './output.js';

/**
 * Each key and what it does, in the order a beginner needs them. Meanings
 * are trusted HTML: names the player types are in <code>.
 *
 * @type {ReadonlyArray<[string, string]>}
 */
export const TERMINAL_KEYS = Object.freeze([
  ['Enter', 'Runs the line.'],
  ['Tab', 'Completes a command or file name. When several names fit, it lists them.'],
  ['Up', 'Brings back the line you ran before; press again to go further back.'],
  ['Down', 'Goes forward again, back to the line you were typing.'],
  ['Ctrl+R', 'Searches the lines you ran: type part of one. Ctrl+R again finds an older one, Enter runs it.'],
  ['Esc', 'Ends a search and keeps the line found, to change it before you press Enter.'],
  ['Ctrl+G', 'Ends a search and gives back the line you were typing.'],
  ['Ctrl+C', 'Gives up the line, or the password a command asks for.'],
  ['Ctrl+A', 'Moves to the start of the line.'],
  ['Ctrl+E', 'Moves to the end of the line.'],
  ['Ctrl+L', 'Clears the screen. The line you are typing stays.'],
]);

/**
 * The key list as HTML.
 *
 * @returns {string} A <dl> with one <kbd> per key.
 */
export function keymapHTML() {
  const rows = TERMINAL_KEYS.map(([key, what]) => `<dt><kbd>${esc(key)}</kbd></dt><dd>${what}</dd>`);
  return `<dl class="keymap">${rows.join('')}</dl>`;
}
