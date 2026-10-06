/**
 * Pure text helpers for the terminal: escaping, the prompt, and turning the
 * backend's output chunks into lines the page can append.
 */

import { isInside } from '../backend/tree.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape text for use inside HTML, attributes included.
 *
 * @param {string} text Any text.
 * @returns {string} The text with & < > " ' replaced by entities.
 */
export function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ENTITIES[c]);
}

/**
 * Escape authored text and set `backticked` parts as code, so names the player
 * might type show in the terminal face.
 *
 * @param {string} text Plain text, possibly with `code` spans.
 * @returns {string} HTML.
 */
export function inlineCode(text) {
  return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Show a path the way bash's \w does: the home directory and paths under it
 * start with a tilde.
 *
 * @param {string} path Absolute path.
 * @param {string} home Absolute path of the home directory.
 * @returns {string} The path to display.
 */
export function displayPath(path, home) {
  return isInside(path, home) ? `~${path.slice(home.length)}` : path;
}

/**
 * The prompt Ubuntu's default bash prints (user@host:dir$ ), as HTML.
 *
 * @param {{user: string, host: string, cwd: string, home: string}} prompt Who and where.
 * @returns {string} HTML ending with the sigil and a space.
 */
export function promptHTML({ user, host, cwd, home }) {
  const sigil = user === 'root' ? '#' : '$';
  return `<span class="pu">${esc(`${user}@${host}`)}</span>:<span class="pp">${esc(displayPath(cwd, home))}</span>${sigil} `;
}

/**
 * Whether a chunk is `clear` asking for an empty screen.
 *
 * @param {import('../backend/port.js').OutputChunk} chunk One piece of output.
 * @returns {boolean} True for the chunk the backend marks with the tone 'clear'.
 */
export function clears(chunk) {
  return chunk.tone === 'clear';
}

/**
 * Turn one output chunk into a terminal line. The final newline a program
 * writes is dropped because each line is its own block.
 *
 * @param {import('../backend/port.js').OutputChunk} chunk One piece of output.
 * @returns {{cls: string, html: string} | null} Classes and HTML for the line, or null when there is nothing to show.
 */
export function chunkLine(chunk) {
  const { stream, text, html, tone } = chunk;
  if ((text === '' && !html) || clears(chunk)) return null;
  const classes = ['ln'];
  if (stream !== 'out') classes.push(stream);
  if (tone) classes.push(`tone-${tone}`);
  let body = html ?? esc(text);
  body = body.endsWith('\n') ? body.slice(0, -1) : body;
  if (stream === 'note') body = `» ${body}`;
  return { cls: classes.join(' '), html: body };
}

const MIN_COLUMNS = 20;

/**
 * How many character columns a terminal pane shows, as a real terminal tells
 * the shell when it is resized.
 *
 * @param {number} paneWidth Width available for text, in CSS pixels.
 * @param {number} glyphWidth Width of one monospace character, in CSS pixels.
 * @returns {number} Whole columns, at least 20.
 * @throws {Error} If glyphWidth is not positive.
 */
export function columnsFor(paneWidth, glyphWidth) {
  if (!(glyphWidth > 0)) throw new Error(`glyph width must be positive, got ${glyphWidth}`);
  return Math.max(MIN_COLUMNS, Math.floor(paneWidth / glyphWidth));
}
