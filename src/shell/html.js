/**
 * Markup for coloured output. The classes (c-dir, c-exe, g-file, g-sep,
 * g-num, g-match) are styled by the page.
 */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/**
 * @param {string} text Plain text.
 * @returns {string} The text with &, <, > and " escaped.
 */
export const esc = text => String(text).replace(/[&<>"]/g, c => ENTITIES[c]);

/**
 * @param {string} cls A CSS class.
 * @param {string} text Plain text.
 * @returns {string} The escaped text wrapped in a span of that class.
 */
export const span = (cls, text) => `<span class="${cls}">${esc(text)}</span>`;
