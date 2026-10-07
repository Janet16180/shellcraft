/**
 * Driving one interactive bash through a list of lines and splitting its
 * output back into one stdout, stderr and status per line.
 *
 * Between the player's lines the input holds marker lines that start with a
 * space, so HISTCONTROL=ignorespace keeps them out of `history`. Each marker
 * line saves `$?`, prints it, prints the next begin marker on both streams,
 * and restores `$?` for the next line. The stdout markers also carry the
 * container clock in seconds, taken with the printf builtin so no process
 * starts between the lines.
 */

const RS = '\u001e';
const quote = s => `'${String(s).replace(/'/g, "'\\''")}'`;
const begin = i => ` printf '${RS}B${i} %(%s)T${RS}' -1; printf '${RS}B${i}${RS}' >&2`;
const end = ` __st=$?; printf '${RS}E%d %(%s)T${RS}' "$__st" -1`;

/**
 * Build the input for bash. bash runs with --norc so the world's ~/.bashrc, not the image's, is read
 * first, as the simulator reads it when the shell starts.
 *
 * @param {string[]} lines The player's lines.
 * @param {{cds: string[]}} setup Directories to cd into first.
 * @returns {string} The input text.
 */
export function inputScript(lines, { cds }) {
  const hidden = [' if [ -r ~/.bashrc ]; then . ~/.bashrc; fi', ...cds.map(p => ` cd ${quote(p)}`)];
  const body = lines.flatMap((line, i) => [i === 0 ? begin(0) : `${end}; ${begin(i).trim()}; (exit "$__st")`, line]);
  return [...hidden, ...body, `${end}; printf '${RS}Z${RS}' >&2`, ''].join('\n');
}

/**
 * Split what bash wrote into one result per line.
 *
 * @param {string} stdout Everything on standard output.
 * @param {string} stderr Everything on standard error.
 * @param {number} count How many lines ran.
 * @returns {{out: string, err: string, status: number|null, started: number|null, ended: number|null}[]}
 *   Per line, with the container clock in seconds when it started and ended;
 *   status and both clocks are null if its end marker is missing.
 */
export function splitOutput(stdout, stderr, count) {
  const results = Array.from({ length: count }, () => ({ out: '', err: '', status: null, started: null, ended: null }));
  for (const m of stdout.matchAll(new RegExp(`${RS}B(\\d+) (\\d+)${RS}([\\s\\S]*?)${RS}E(\\d+) (\\d+)${RS}`, 'g'))) {
    Object.assign(results[Number(m[1])], { out: m[3], status: Number(m[4]), started: Number(m[2]), ended: Number(m[5]) });
  }
  const parts = stderr.split(new RegExp(`${RS}(B\\d+|Z)${RS}`));
  for (let k = 1; k + 1 < parts.length; k += 2) {
    if (parts[k] !== 'Z') results[Number(parts[k].slice(1))].err = parts[k + 1];
  }
  return results;
}
