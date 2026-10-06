/**
 * Short-option parsing shared by the simulated commands.
 */

const usage = name => `Try '${name} --help' for more information.`;

function parseCluster(name, args, i, known, withValue, acc) {
  const x = args[i];
  let next = i;
  for (let j = 1; j < x.length && !acc.err; j++) {
    const ch = x[j];
    if (withValue.includes(ch)) {
      const inline = x.slice(j + 1);
      const v = inline || args[++next];
      if (v === undefined) acc.err = `${name}: option requires an argument -- '${ch}'\n${usage(name)}`;
      acc.vals[ch] = v;
      acc.lists[ch] = [...(acc.lists[ch] ?? []), v];
      break;
    }
    if (!known.includes(ch)) acc.err = `${name}: invalid option -- '${ch}'\n${usage(name)}`;
    acc.flags.add(ch);
  }
  return next;
}

/**
 * Parse arguments into short flags, option values and operands. Bundled
 * flags (`-la`) are split; `--` ends options; `-` alone is an operand.
 * Long options (`--x`) are unrecognized; commands that take some map them
 * to letters first.
 *
 * @param {string} name The command, for error messages.
 * @param {string[]} args The arguments.
 * @param {string} known Letters accepted as flags.
 * @param {string} [withValue] Letters that take a value (`-n 5` or `-n5`).
 * @returns {{flags: Set<string>, vals: Record<string, string>, lists: Record<string, string[]>, rest: string[], err: string|null}}
 *   The parse: the last value of each option in vals, every value in lists; or
 *   err set to the message the real command prints for a bad option.
 */
export function parseOptions(name, args, known, withValue = '') {
  const acc = { flags: new Set(), vals: {}, lists: {}, rest: [], err: null };
  let ended = false;
  for (let i = 0; i < args.length && !acc.err; i++) {
    const x = args[i];
    if (ended || x === '-' || !x.startsWith('-')) acc.rest.push(x);
    else if (x === '--') ended = true;
    else if (x.startsWith('--')) acc.err = `${name}: unrecognized option '${x}'\n${usage(name)}`;
    else i = parseCluster(name, args, i, known, withValue, acc);
  }
  return acc;
}

/**
 * Rewrite a command's long options into its short letters, before `--` only.
 *
 * @param {string} name The command, for the error message.
 * @param {string[]} args The arguments.
 * @param {Record<string, string>} table Long option to letter (`--all` to `a`).
 * @param {RegExp} [ignored] Long options the command accepts and ignores (like --color).
 * @returns {{args: string[], err: string|null}} The rewritten arguments, or the
 *   message for the first unrecognized long option.
 */
export function mapLongOptions(name, args, table, ignored = /^--colou?r(=|$)/) {
  const end = args.includes('--') ? args.indexOf('--') : args.length;
  const options = args.slice(0, end).filter(a => !ignored.test(a));
  const unknown = options.find(a => a.startsWith('--') && !Object.hasOwn(table, a));
  const mapped = [...options.map(a => (Object.hasOwn(table, a) ? `-${table[a]}` : a)), ...args.slice(end)];
  return { args: mapped, err: unknown ? `${name}: unrecognized option '${unknown}'\n${usage(name)}` : null };
}
