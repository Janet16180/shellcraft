/**
 * Shell variables. Each is `{value, exported}`; exported ones form the
 * environment that `env` prints and programs inherit.
 */

import { nameTable } from './table.js';

const PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

/**
 * The variables a login shell starts with on the reference system.
 *
 * @param {{user: string, home: string, host: string}} who The user, home and host name.
 * @returns {Record<string, {value: string, exported: boolean}>} The variables.
 */
export function initialVars({ user, home, host }) {
  const exported = { HOME: home, LANG: 'C.UTF-8', LOGNAME: user, PATH, PWD: home, SHELL: '/bin/bash', SHLVL: '1', TERM: 'xterm-256color', USER: user };
  const vars = nameTable();
  for (const [name, value] of Object.entries(exported)) vars[name] = { value, exported: true };
  vars.HOSTNAME = { value: host, exported: false };
  vars.HISTCONTROL = { value: 'ignoreboth', exported: false };
  vars.COLUMNS = { value: '80', exported: false };
  vars.LINES = { value: '24', exported: false };
  return vars;
}

/**
 * Look up a variable or special parameter as `$name` expands it.
 *
 * @param {object} sys The machine state.
 * @param {string} name A variable name, a digit, or one of `? $ # ! @ * -`.
 * @returns {string} Its value, or '' when unset.
 */
export function varValue(sys, name) {
  const special = nameTable({ '?': String(sys.lastStatus), $: String(sys.shellPid), '#': '0', 0: 'bash', '-': 'himBHs' });
  return special[name] ?? sys.vars[name]?.value ?? '';
}

/**
 * Set a variable, keeping it exported if it already was.
 *
 * @param {object} sys The machine state.
 * @param {string} name The name.
 * @param {string} value The value.
 * @param {boolean} [exported] Export it as well.
 * @returns {void}
 */
export function setVar(sys, name, value, exported = false) {
  sys.vars[name] = { value, exported: exported || Boolean(sys.vars[name]?.exported) };
}

/**
 * @param {object} sys The machine state.
 * @returns {Record<string, string>} The exported variables by name, in definition order.
 */
export function exportedVars(sys) {
  return Object.fromEntries(Object.entries(sys.vars).filter(([, v]) => v.exported).map(([k, v]) => [k, v.value]));
}
