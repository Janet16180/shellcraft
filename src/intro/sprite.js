/**
 * Pixel sprites from the map (src/map/sprites.js) as small inline SVGs, so the
 * explainers can move them with CSS and they stay sharp at any size.
 */

import { PALETTES } from '../map/palette.js';

function rowRects(row, y, colours) {
  const rects = [];
  let x = 0;
  while (x < row.length) {
    const letter = row[x];
    let end = x + 1;
    while (end < row.length && row[end] === letter) end += 1;
    if (letter !== '.') rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${colours[letter]}"/>`);
    x = end;
  }
  return rects.join('');
}

/**
 * Draw a sprite as an SVG, one unit per pixel.
 *
 * @param {{pal: 'ink'|'toon', rows: string[]}} sprite A sprite from SPRITES.
 * @param {object} [opts]
 * @param {number} [opts.scale] Screen pixels per sprite pixel (default 1).
 * @param {Object<string, string>} [opts.colours] Colours that replace palette letters.
 * @param {string[]} [opts.below] More rows drawn under the sprite, in the same palette.
 * @param {string} [opts.cls] Extra class names.
 * @returns {string} SVG markup, hidden from screen readers.
 * @throws {Error} If a letter has no colour in the palette.
 */
export function spriteSVG(sprite, { scale = 1, colours = {}, below = [], cls = '' } = {}) {
  const palette = { ...PALETTES[sprite.pal], ...colours };
  const rows = [...sprite.rows, ...below];
  const missing = [...new Set(rows.join(''))].filter(letter => letter !== '.' && !(letter in palette));
  if (missing.length) throw new Error(`no colour for sprite letters: ${missing.join('')}`);
  const width = Math.max(...rows.map(row => row.length));
  const body = rows.map((row, y) => rowRects(row, y, palette)).join('');
  const name = `sprite${cls ? ` ${cls}` : ''}`;
  return `<svg class="${name}" viewBox="0 0 ${width} ${rows.length}" width="${width * scale}" height="${rows.length * scale}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
}
