/**
 * Which simulated commands are bash builtins, which of those have no
 * program in /usr/bin (echo, pwd, kill, true and false have both), and the
 * help bash prints for them.
 */

/** Every builtin of bash 5.2 (`compgen -b`), simulated or not. */
export const BASH_BUILTINS = new Set(['.', ':', '[', 'alias', 'bg', 'bind', 'break', 'builtin', 'caller', 'cd', 'command', 'compgen', 'complete',
  'compopt', 'continue', 'declare', 'dirs', 'disown', 'echo', 'enable', 'eval', 'exec', 'exit', 'export', 'false', 'fc', 'fg', 'getopts', 'hash',
  'help', 'history', 'jobs', 'kill', 'let', 'local', 'logout', 'mapfile', 'popd', 'printf', 'pushd', 'pwd', 'read', 'readarray', 'readonly',
  'return', 'set', 'shift', 'shopt', 'source', 'suspend', 'test', 'times', 'trap', 'true', 'type', 'typeset', 'ulimit', 'umask', 'unalias',
  'unset', 'wait']);
export const BUILTINS = new Set(['cd', 'history', 'alias', 'export', 'exit', 'logout', 'type', 'echo', 'pwd', 'kill', 'true', 'false', 'help', 'unalias', 'unset']);
export const NO_BINARY = new Set(['cd', 'history', 'alias', 'export', 'exit', 'logout', 'type', 'help', 'unalias', 'unset']);

/**
 * The usage line and one-line summary bash prints for `NAME --help` and `help NAME`.
 */
export const BUILTIN_HELP = {
  alias: ['alias [-p] [name[=value] ... ]', 'Define or display aliases.'],
  cd: ['cd [-L|[-P [-e]] [-@]] [dir]', 'Change the shell working directory.'],
  exit: ['exit [n]', 'Exit the shell.'],
  export: ['export [-fn] [name[=value] ...] or export -p', 'Set export attribute for shell variables.'],
  help: ['help [-dms] [pattern ...]', 'Display information about builtin commands.'],
  history: ['history [-c] [-d offset] [n] or history -anrw [filename] or history -ps arg [arg...]', 'Display or manipulate the history list.'],
  kill: ['kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]', 'Send a signal to a job.'],
  logout: ['logout [n]', 'Exit a login shell.'],
  pwd: ['pwd [-LP]', 'Print the name of the current working directory.'],
  type: ['type [-afptP] name [name ...]', 'Display information about command type.'],
  unalias: ['unalias [-a] name [name ...]', 'Remove each NAME from the list of defined aliases.'],
  unset: ['unset [-f] [-v] [-n] [name ...]', 'Unset values and attributes of shell variables and functions.'],
};

/**
 * @param {string} name A builtin with an entry in BUILTIN_HELP.
 * @returns {string} Its usage and summary as bash prints them.
 */
export const builtinHelp = name => `${name}: ${BUILTIN_HELP[name][0]}\n    ${BUILTIN_HELP[name][1]}\n`;

/**
 * Parse a builtin's options the way bash does: letters from `known` may be
 * bundled, `--` ends the options, and a lone `-` is an operand.
 *
 * @param {string} name A builtin with an entry in BUILTIN_HELP.
 * @param {string[]} args Its arguments.
 * @param {string} known The option letters it accepts.
 * @returns {{flags: Set<string>, rest: string[], error: string|null}} The options and
 *   operands, or bash's invalid-option message with the usage line.
 */
export function builtinOptions(name, args, known) {
  const flags = new Set();
  let i = 0;
  let error = null;
  for (; i < args.length && !error && /^-./.test(args[i]) && args[i] !== '--'; i++) {
    const bad = [...args[i].slice(1)].find(ch => !known.includes(ch));
    if (bad) error = `bash: ${name}: -${bad}: invalid option\n${name}: usage: ${BUILTIN_HELP[name][0]}`;
    for (const ch of args[i].slice(1)) flags.add(ch);
  }
  if (args[i] === '--') i++;
  return { flags, rest: args.slice(i), error };
}
