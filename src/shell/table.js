/**
 * Tables keyed by names the player types: files, variables, aliases, commands.
 *
 * A plain object inherits members like `constructor` and `toString`, and
 * assigning `__proto__` replaces its prototype instead of adding a key. A
 * table without a prototype has neither problem, so every name is ordinary.
 */

/**
 * Make a table without a prototype.
 *
 * @param {Record<string, *>} [entries] An object whose own entries to copy, `__proto__` included.
 * @returns {Record<string, *>} The table.
 */
export const nameTable = (entries = {}) => Object.assign(Object.create(null), entries);
