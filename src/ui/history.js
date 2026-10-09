/**
 * Command history for the Up and Down keys, kept like Ubuntu's default bash
 * (HISTCONTROL=ignoreboth: no repeats, nothing typed with a leading space).
 */

const LIMIT = 500;

/**
 * Create an empty history.
 *
 * @returns {{push: (line: string) => void, up: (current: string) => string, down: () => string,
 *   entries: () => string[], seek: (index: number, draft: string) => void}}
 *   `push` records a submitted line; `up` and `down` return the line to show; `entries` lists the
 *   lines, oldest first; `seek` stands on entry `index` (the length for the line being typed, kept as
 *   `draft`), as after a reverse search, and raises on an index outside the history.
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

  function seek(at, typed) {
    if (!Number.isInteger(at) || at < 0 || at > lines.length) throw new Error(`history index must be 0 to ${lines.length}, got ${at}`);
    index = at;
    draft = typed;
  }

  return { push, up, down, entries: () => [...lines], seek };
}
