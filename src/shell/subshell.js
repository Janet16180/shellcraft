/**
 * The state of a child bash. A script runs in a child shell: it starts with
 * the parent's exported variables and working directory, and nothing it
 * changes (variables, aliases, cd, umask) reaches the parent. The file system
 * and the processes are the machine's, shared by both.
 */

import { exportedVars, setVar, varValue } from './vars.js';
import { nameTable } from './table.js';

const SHELL_STATE = ['vars', 'aliases', 'cwd', 'oldpwd', 'lastStatus', 'umask', 'positional', 'flags', 'hashed', 'history'];
const NON_INTERACTIVE = 'hB';

/**
 * Switch the machine to a fresh child shell of the current one.
 *
 * @param {object} sys The machine state.
 * @param {{zero: string, args: string[], env: Record<string, string>}} child Its $0, its
 *   arguments, and the assignments typed before the command, which it gets exported.
 * @returns {object} The parent's shell state, for leaveChild().
 */
export function enterChild(sys, { zero, args, env }) {
  const saved = Object.fromEntries(SHELL_STATE.map(key => [key, sys[key]]));
  const level = Number.parseInt(varValue(sys, 'SHLVL'), 10) || 0;
  const inherited = { ...exportedVars(sys), ...env };
  sys.vars = nameTable();
  for (const [name, value] of Object.entries(inherited)) setVar(sys, name, value, true);
  setVar(sys, 'SHLVL', String(level + 1), true);
  setVar(sys, 'HOSTNAME', sys.host);
  Object.assign(sys, { aliases: nameTable(), lastStatus: 0, positional: { zero, args }, flags: NON_INTERACTIVE, hashed: new Map(), history: [] });
  return saved;
}

/**
 * Return to the parent shell.
 *
 * @param {object} sys The machine state.
 * @param {object} saved What enterChild() returned.
 * @returns {void}
 */
export function leaveChild(sys, saved) {
  Object.assign(sys, saved);
}
