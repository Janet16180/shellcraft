/**
 * The order names and lines sort in.
 */

/**
 * Compare two names the way v1 listed them: ignoring a leading dot and case.
 *
 * @param {string} x A name.
 * @param {string} y Another name.
 * @returns {number} Negative, zero or positive, for Array.prototype.sort.
 */
export const compareNames = (x, y) =>
  x.replace(/^\./, '').toLowerCase().localeCompare(y.replace(/^\./, '').toLowerCase());
