/**
 * The SHELLCRAFT logo drawn as a pixel grid. Pixelify Sans draws its C so
 * closed that the word read "SHELLORAFT", so the logo has its own 5 x 7 letters.
 */

/** The letters the logo uses, as rows of '#' (ink) and '.' (empty). */
export const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};

const ADVANCE = 6;
const HEIGHT = 7;
const SHADE_FROM = 4;

function pixels(text) {
  return [...text].flatMap((letter, i) => {
    if (!(letter in GLYPHS)) throw new Error(`no logo glyph for ${letter}`);
    return GLYPHS[letter].flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '#' ? [[i * ADVANCE + x, y]] : [])));
  });
}

const path = (cells, dx, dy) => cells.map(([x, y]) => `M${x + dx} ${y + dy}h1v1h-1z`).join('');

/**
 * The logo as inline SVG: gold letters with an ember lower half, a rust
 * shadow one pixel down and right, and an ink shadow under that. The paths'
 * classes take their colours from the page's tokens (game.css).
 *
 * @param {string} text Upper-case letters that have glyphs.
 * @returns {string} SVG markup, scaled by CSS.
 * @throws {Error} If a letter has no glyph.
 */
export function logoSVG(text) {
  const cells = pixels(text);
  const width = text.length * ADVANCE - 1 + 2;
  const label = text[0] + text.slice(1).toLowerCase();
  return `<svg class="logo" viewBox="0 0 ${width} ${HEIGHT + 2}" shape-rendering="crispEdges" role="img" aria-label="${label}">`
    + `<path class="ink" d="${path(cells, 2, 2)}"/>`
    + `<path class="rust" d="${path(cells, 1, 1)}"/>`
    + `<path class="gold" d="${path(cells, 0, 0)}"/>`
    + `<path class="ember" d="${path(cells.filter(([, y]) => y >= SHADE_FROM), 0, 0)}"/>`
    + '</svg>';
}
