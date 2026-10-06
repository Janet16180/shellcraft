/**
 * Command history for the Up and Down keys, kept like Ubuntu's default bash
 * (HISTCONTROL=ignoreboth: no repeats, nothing typed with a leading space).
 */

const LIMIT = 500;

/**
 * Create an empty history.
 *
 * @returns {{push: (line: string) => void, up: (current: string) => string, down: () => string}}
 *   `push` records a submitted line; `up` and `down` return the line to show.
 */
export function createHistory() {
  const lines = [];
  let index = 0;
  let draft = '';

  function push(line) {
    const ignored = !line.trim() || line.startsWith(' ') || line === lines.at(-1);
    if (!ignored) lines.push(line);
    if (lines.length > LIMIT) lines.shift();
    index = lines.length;
    draft = '';
  }

  function up(current) {
    if (index === lines.length) draft = current;
    if (index > 0) index -= 1;
    return lines[index] ?? current;
  }

  function down() {
    if (index < lines.length) index += 1;
    return index === lines.length ? draft : lines[index];
  }

  return { push, up, down };
}
