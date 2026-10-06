/**
 * The order of names and lines under LC_ALL=C.UTF-8: by code point, which is
 * the same as comparing the UTF-8 bytes. Capitals sort before lowercase and
 * a leading dot is an ordinary character.
 */

/**
 * Compare two strings by code point.
 *
 * @param {string} x A string.
 * @param {string} y Another string.
 * @returns {number} Negative, zero or positive, for Array.prototype.sort.
 */
export function compareNames(x, y) {
  const a = [...x];
  const b = [...y];
  const n = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < n && diff === 0; i++) diff = a[i].codePointAt(0) - b[i].codePointAt(0);
  return diff || a.length - b.length;
}
