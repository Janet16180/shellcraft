/**
 * Shell variables: the environment every login starts with, plus the ones the user sets.
 */

const PATH = '/usr/local/bin:/usr/bin:/bin';

/**
 * The exported variables a login shell starts with.
 *
 * @param {object} sys The machine state.
 * @returns {Record<string, string>} Name to value, in the order env prints them.
 */
export const baseEnvironment = sys => ({
  HOME: sys.home, USER: sys.user, SHELL: '/bin/bash', PWD: sys.cwd, PATH, LANG: 'C.UTF-8',
});

/**
 * Look up a variable as `$name` expands it.
 *
 * @param {object} sys The machine state.
 * @param {string} raw The name, possibly in braces (`{HOME}`), or `$` or `?`.
 * @returns {string} Its value, or '' when unset.
 */
export function varValue(sys, raw) {
  const name = raw.replace(/^\{|\}$/g, '');
  const shellOnly = { OLDPWD: sys.oldpwd ?? '', HOSTNAME: sys.host, $: String(sys.shellPid), '?': String(sys.lastStatus) };
  return sys.vars[name] ?? shellOnly[name] ?? baseEnvironment(sys)[name] ?? '';
}
