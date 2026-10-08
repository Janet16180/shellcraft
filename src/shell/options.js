/**
 * Short-option parsing shared by the simulated commands.
 *
 * An option the real program accepts but the game does not simulate stops
 * the parse as `unsimulated`, so the command can say so instead of printing
 * GNU's "invalid option".
 */

import { result, withNote } from './result.js';
import { REAL_OPTIONS } from './real-options.js';

const usage = name => `Try '${name} --help' for more information.`;
const realShort = (name, letter) => Object.hasOwn(REAL_OPTIONS, name) && REAL_OPTIONS[name].short.includes(letter);
const realLong = (name, option) => Object.hasOwn(REAL_OPTIONS, name) && REAL_OPTIONS[name].long.includes(option);
const stopped = acc => acc.err !== null || acc.unsimulated !== null;

function parseCluster(name, args, i, known, withValue, acc) {
  const x = args[i];
  let next = i;
  for (let j = 1; j < x.length && !stopped(acc); j++) {
    const ch = x[j];
    if (withValue.includes(ch)) {
      const inline = x.slice(j + 1);
      const v = inline || args[++next];
      if (v === undefined) acc.err = `${name}: option requires an argument -- '${ch}'\n${usage(name)}`;
      else {
        acc.vals[ch] = v;
        acc.lists[ch] = [...(acc.lists[ch] ?? []), v];
      }
      break;
    }
    if (known.includes(ch)) acc.flags.add(ch);
    else if (realShort(name, ch)) acc.unsimulated = `-${ch}`;
    else acc.err = `${name}: invalid option -- '${ch}'\n${usage(name)}`;
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
 * @returns {{flags: Set<string>, vals: Record<string, string>, lists: Record<string, string[]>, rest: string[], err: string|null, unsimulated: string|null}}
 *   The parse: the last value of each option in vals, every value in lists; or
 *   err set to the message the real command prints for a bad option; or
 *   unsimulated set to a real option the game does not simulate, like '-R'.
 */
export function parseOptions(name, args, known, withValue = '') {
  const acc = { flags: new Set(), vals: {}, lists: {}, rest: [], err: null, unsimulated: null };
  let ended = false;
  for (let i = 0; i < args.length && !stopped(acc); i++) {
    const x = args[i];
    const longName = x.split('=')[0];
    if (ended || x === '-' || !x.startsWith('-')) acc.rest.push(x);
    else if (x === '--') ended = true;
    else if (x.startsWith('--') && realLong(name, longName)) acc.unsimulated = longName;
    else if (x.startsWith('--')) acc.err = `${name}: unrecognized option '${x}'\n${usage(name)}`;
    else i = parseCluster(name, args, i, known, withValue, acc);
  }
  return acc;
}

// One long option as short ones: `--lines=3` is `-n 3`; a flag takes no value.
function mapOne(name, arg, table, withValue) {
  const [long, ...value] = arg.split('=');
  const letter = table[long];
  let mapped = { args: [`-${letter}`], err: null };
  if (value.length && !withValue.includes(letter)) mapped = { args: [], err: `${name}: option '${long}' doesn't allow an argument\n${usage(name)}` };
  else if (value.length) mapped = { args: [`-${letter}`, value.join('=')], err: null };
  return mapped;
}

/**
 * Rewrite a command's long options into its short letters, before `--` only.
 *
 * @param {string} name The command, for the error message.
 * @param {string[]} args The arguments.
 * @param {Record<string, string>} table Long option to letter (`--all` to `a`).
 * @param {RegExp} [ignored] Long options the command accepts and ignores (like --color).
 * @param {string} [withValue] Letters whose option takes a value (`--lines=3` or `--lines 3`).
 * @returns {{args: string[], err: string|null, unsimulated: string|null}} The rewritten
 *   arguments; or the message for the first unrecognized or misused long option; or the
 *   first real long option the game does not simulate.
 */
export function mapLongOptions(name, args, table, ignored = /^--colou?r(=|$)/, withValue = '') {
  const end = args.includes('--') ? args.indexOf('--') : args.length;
  const options = args.slice(0, end).filter(a => !ignored.test(a));
  const mapped = [];
  let stop = null;
  options.forEach((a, i) => {
    const long = a.split('=')[0];
    let one = { args: [a], err: null };
    if (a.startsWith('--') && Object.hasOwn(table, long)) one = mapOne(name, a, table, withValue);
    else if (a.startsWith('--')) one.err = realLong(name, long) ? { unsimulated: long } : `${name}: unrecognized option '${a}'\n${usage(name)}`;
    if (a === long && withValue.includes(table[a]) && i === options.length - 1 && end === args.length) one.err = `${name}: option '${a}' requires an argument\n${usage(name)}`;
    stop ??= one.err;
    mapped.push(...one.args);
  });
  return { args: [...mapped, ...args.slice(end)], err: typeof stop === 'string' ? stop : null, unsimulated: stop?.unsimulated ?? null };
}

/**
 * The result a command returns when its options stopped the parse.
 *
 * @param {string} name The command.
 * @param {{err: string|null, unsimulated: string|null}} parsed What parseOptions or mapLongOptions returned.
 * @param {number} status The status the real command exits with for a bad option.
 * @returns {import('./result.js').Result|null} The error, a note naming the
 *   unsimulated option, or null when the options are fine.
 */
export function optionFailure(name, parsed, status) {
  let r = null;
  if (parsed.err) r = result('', parsed.err, status);
  else if (parsed.unsimulated) r = withNote(result('', '', status), `${name} ${parsed.unsimulated} is a real option, but this game does not simulate it.`);
  return r;
}
