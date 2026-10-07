/**
 * How pkill, pgrep and killall read their arguments: which options take a
 * value, and a getopt-style walk that hands each option its value. Shared by
 * the signal they send (signals.js) and the processes they select
 * (process.js).
 */

const PROCPS_LONG = ['--pgroup', '--group', '--parent', '--session', '--terminal', '--euid', '--uid', '--pidfile', '--runstates', '--older', '--ns', '--nslist', '--cgroup'];

/** For each command, the short letters and long names that take a value. */
export const VALUE_OPTIONS = Object.freeze({
  pkill: { short: 'gGPstuUFrqO', long: ['--signal', '--queue', ...PROCPS_LONG] },
  pgrep: { short: 'dgGPstuUFrO', long: ['--delimiter', ...PROCPS_LONG] },
  killall: { short: 'syounZ', long: ['--signal', '--younger-than', '--older-than', '--user', '--ns', '--context'] },
});

function takesNextValue(word, grammar) {
  const letters = word.slice(1);
  return word.startsWith('--') ? grammar.long.includes(word) : [...letters].findIndex(c => grammar.short.includes(c)) === letters.length - 1;
}

/**
 * Walk the arguments up to `--`, calling onOption with each option word and
 * the value it takes from the next argument, if any.
 *
 * @param {string[]} args The arguments.
 * @param {{short: string, long: string[]}} grammar The options that take a value.
 * @param {(word: string, value: string|null) => void} onOption Called for each option word.
 * @returns {{operands: string[], missing: string|null}} The operands, and the option whose value is missing, if any.
 */
export function scanOptions(args, grammar, onOption) {
  const end = args.includes('--') ? args.indexOf('--') : args.length;
  const operands = [];
  let missing = null;
  for (let i = 0; i < end && missing === null; i++) {
    const word = args[i];
    if (word.length < 2 || !word.startsWith('-')) operands.push(word);
    else if (!takesNextValue(word, grammar)) onOption(word, null);
    else if (i + 1 === end) missing = word;
    else onOption(word, args[++i]);
  }
  return { operands: [...operands, ...args.slice(end + 1)], missing };
}

/**
 * Split one option word into its options: `--name=value`, or a cluster like
 * `-xu hero` where the letter that takes a value gets the rest of the word or
 * the value scanOptions found for it.
 *
 * @param {string} word An option word.
 * @param {string|null} value The value scanOptions passed with it.
 * @param {{short: string, long: string[]}} grammar The options that take a value.
 * @returns {[string, string|null][]} Each option, like ['-u', 'hero'] or ['--exact', null].
 */
export function splitOption(word, value, grammar) {
  const letters = [...word.slice(1)];
  const valueAt = letters.findIndex(c => grammar.short.includes(c));
  const flags = valueAt < 0 ? letters : letters.slice(0, valueAt);
  const [long, inline] = word.split(/=(.*)/s);
  let options = flags.map(letter => [`-${letter}`, null]);
  if (word.startsWith('--')) options = [[long, inline ?? value]];
  else if (valueAt >= 0) options.push([`-${letters[valueAt]}`, letters.slice(valueAt + 1).join('') || value]);
  return options;
}
