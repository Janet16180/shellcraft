/**
 * Pure pieces of an intro frame: which lines to replay and the HTML for the
 * prompt anatomy, a split command line and the key list.
 */

import { esc } from '../ui/output.js';

const KEYBOARD_KEYS = new Set(['Enter', 'Tab', 'Up', 'Down', 'Esc']);

/**
 * The lines typed by the steps before `index`, replayed to rebuild the world
 * the step starts from.
 *
 * @param {{type?: string}[]} steps The storyboard.
 * @param {number} index The step about to show.
 * @returns {string[]} Lines in order.
 */
export function linesBefore(steps, index) {
  return steps.slice(0, index).filter(step => step.type).map(step => step.type);
}

/**
 * The prompt drawn piece by piece: the piece in focus is lit, and the pieces
 * up to it carry their labels.
 *
 * @param {{text: string, role: string|null, label: string}[]} pieces The prompt's pieces.
 * @param {string} focus The role being explained.
 * @returns {string} HTML.
 */
export function anatomyHTML(pieces, focus) {
  const reached = pieces.findIndex(p => p.role === focus);
  return pieces.map((piece, i) => {
    if (!piece.role) return `<span class="sep">${esc(piece.text)}</span>`;
    const on = piece.role === focus ? ' on' : '';
    const label = i <= reached ? esc(piece.label) : '';
    return `<span class="piece${on} role-${piece.role}"><span class="txt">${esc(piece.text)}</span><span class="lbl">${label}</span></span>`;
  }).join('');
}

/**
 * A command line split into its words, each over its role.
 *
 * @param {string[][]} parts [word, role] pairs.
 * @returns {string} HTML.
 */
export function partsHTML(parts) {
  return parts.map(([word, role]) =>
    `<span class="part role-${role}"><code>${esc(word)}</code><span class="lbl">${esc(role)}</span></span>`).join('');
}

/**
 * The keys and helper commands, with what each does.
 *
 * @param {string[][]} keys [key or command, trusted HTML meaning] pairs.
 * @returns {string} HTML.
 */
export function keysHTML(keys) {
  const rows = keys.map(([key, what]) => {
    const name = KEYBOARD_KEYS.has(key) ? `<kbd>${esc(key)}</kbd>` : `<code>${esc(key)}</code>`;
    return `<dt>${name}</dt><dd>${what}</dd>`;
  });
  return `<dl class="keys-list">${rows.join('')}</dl>`;
}

/**
 * The label of the forward button.
 *
 * @param {object[]} steps The storyboard.
 * @param {number} index The step shown.
 * @returns {string} "Next", or "Start playing" on the last step.
 */
export function nextLabel(steps, index) {
  return index === steps.length - 1 ? 'Start playing' : 'Next';
}
