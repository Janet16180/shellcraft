/**
 * Which simulated commands are bash builtins, which of those have no
 * program in /usr/bin (echo, pwd, kill, true and false have both), and the
 * help bash prints for them.
 */

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
