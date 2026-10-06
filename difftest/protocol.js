/**
 * Driving one interactive bash through a list of lines and splitting its
 * output back into one stdout, stderr and status per line.
 *
 * Between the player's lines the input holds marker lines that start with a
 * space, so HISTCONTROL=ignorespace keeps them out of `history`. Each marker
 * line saves `$?`, prints it, prints the next begin marker on both streams,
 * and restores `$?` for the next line.
 */

const RS = '\u001e';
const quote = s => `'${String(s).replace(/'/g, "'\\''")}'`;
const begin = i => ` printf '${RS}B${i}${RS}'; printf '${RS}B${i}${RS}' >&2`;
const end = ` __st=$?; printf '${RS}E%d${RS}' "$__st"`;

/**
 * Build the input for bash.
 *
 * @param {string[]} lines The player's lines.
 * @param {{cds: string[], aliases: Record<string, string>}} setup Directories to cd into first and aliases to define.
 * @returns {string} The input text.
 */
export function inputScript(lines, { cds, aliases }) {
  const hidden = [
    ...Object.entries(aliases).map(([k, v]) => ` alias ${k}=${quote(v)}`),
    ...cds.map(p => ` cd ${quote(p)}`),
  ];
  const body = lines.flatMap((line, i) => [i === 0 ? begin(0) : `${end}; ${begin(i).trim()}; (exit "$__st")`, line]);
  return [...hidden, ...body, `${end}; printf '${RS}Z${RS}' >&2`, ''].join('\n');
}

/**
 * Split what bash wrote into one result per line.
 *
 * @param {string} stdout Everything on standard output.
 * @param {string} stderr Everything on standard error.
 * @param {number} count How many lines ran.
 * @returns {{out: string, err: string, status: number|null}[]} Per line; status null if its end marker is missing.
 */
export function splitOutput(stdout, stderr, count) {
  const results = Array.from({ length: count }, () => ({ out: '', err: '', status: null }));
  for (const m of stdout.matchAll(new RegExp(`${RS}B(\\d+)${RS}([\\s\\S]*?)${RS}E(\\d+)${RS}`, 'g'))) {
    Object.assign(results[Number(m[1])], { out: m[2], status: Number(m[3]) });
  }
  const parts = stderr.split(new RegExp(`${RS}(B\\d+|Z)${RS}`));
  for (let k = 1; k + 1 < parts.length; k += 2) {
    if (parts[k] !== 'Z') results[Number(parts[k].slice(1))].err = parts[k + 1];
  }
  return results;
}
