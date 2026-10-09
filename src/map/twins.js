/**
 * The rune that marks hard links on the map: every name of one file (one
 * inode, `links` above 1) carries the same small rune, so the player sees
 * that they are the same data. The rune follows from the inode number alone.
 */

/** Rune colours, bright on the item sprites and readable on every floor. */
export const RUNE_COLOURS = Object.freeze(['#6fe0e8', '#ffd348', '#8fd14f', '#ff8fa3', '#c792ff', '#f08a2a']);

/** Rune shapes, 5 pixels wide and 5 tall: 1 is ink. */
export const RUNE_GLYPHS = Object.freeze([
  ['00100', '01110', '10101', '00100', '00100'],
  ['10001', '01010', '00100', '01010', '10001'],
  ['01110', '10001', '10101', '10001', '01110'],
  ['11111', '00100', '01110', '00100', '11111'],
].map(Object.freeze));

/**
 * The rune for an inode: names that share the inode share the rune.
 *
 * @param {number} ino The inode number, as `ls -i` shows it.
 * @returns {{colour: string, glyph: readonly string[]}} Its colour and shape.
 * @throws {Error} If ino is not a whole number at or above 0.
 */
export function twinRune(ino) {
  if (!Number.isInteger(ino) || ino < 0) throw new Error(`an inode number must be a whole number at or above 0, got ${ino}`);

  const colour = RUNE_COLOURS[ino % RUNE_COLOURS.length];
  const glyph = RUNE_GLYPHS[Math.floor(ino / RUNE_COLOURS.length) % RUNE_GLYPHS.length];
  return { colour, glyph };
}
