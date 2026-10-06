/**
 * What goes in the terminal input when the player clicks something on the map
 * or in the breadcrumbs. The page inserts these lines; it never runs them.
 */

/**
 * Quote a word for bash so it reaches the command as one argument.
 *
 * @param {string} word A file name or path.
 * @returns {string} The word, quoted only when it needs to be.
 */
export function quoteWord(word) {
  let quoted = word;
  if (!/^[\w./+-]+$/.test(word)) quoted = `'${word.replaceAll("'", "'\\''")}'`;
  if (word.startsWith('-')) quoted = `./${quoted}`;
  return quoted;
}

/**
 * The command a map pick stands for: a door is a directory to enter, the exit
 * is the parent, an item is a file to read.
 *
 * @param {{kind: 'door'|'item'|'exit', name: string, path: string}} pick What was clicked.
 * @returns {string} The line to put in the input.
 * @throws {Error} On an unknown kind.
 */
export function commandForPick({ kind, name }) {
  const commands = { door: `cd ${quoteWord(name)}`, exit: 'cd ..', item: `cat ${quoteWord(name)}` };
  if (!(kind in commands)) throw new Error(`unknown pick kind: ${kind}`);
  return commands[kind];
}

/**
 * The command for a breadcrumb: cd with its absolute path.
 *
 * @param {string} path Absolute path.
 * @returns {string} The line to put in the input.
 */
export function commandForPath(path) {
  return `cd ${quoteWord(path)}`;
}
