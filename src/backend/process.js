/**
 * Which processes a kill, pkill, pgrep or killall line selects, read the way
 * the real tools read it. The simulator signals what this selects, and the
 * game rules ask the same question about the player's shell, so both agree.
 *
 * kill selects by PID and process group (kill(2)); pkill and pgrep (procps)
 * by an extended regular expression on the process name, a user and a
 * terminal; killall (psmisc) by whole names or a user. Each process here is
 * its own process group, as interactive bash makes every job.
 */

import { compilePosix } from './regex.js';
import { requestedSignal, parseSignal, pkillPrescan } from './signals.js';
import { VALUE_OPTIONS, scanOptions, splitOption } from './procargs.js';

const COMM_LENGTH = 15;
const PROCPS = new Map([
  ['-u', 'users'], ['--euid', 'users'], ['-U', 'users'], ['--uid', 'users'], ['-t', 'ttys'], ['--terminal', 'ttys'],
  ['-x', 'exact'], ['--exact', 'exact'], ['-i', 'ignoreCase'], ['--ignore-case', 'ignoreCase'], ['-f', 'full'], ['--full', 'full'],
]);
const KILLALL = new Map([
  ['-u', 'users'], ['--user', 'users'], ['-I', 'ignoreCase'], ['--ignore-case', 'ignoreCase'], ['-r', 'regex'], ['--regexp', 'regex'],
  ['-e', 'exact'], ['--exact', 'exact'],
]);
const SIGNAL_OPTIONS = { pkill: ['--signal'], pgrep: [], killall: ['-s', '--signal', '-l', '--list'] };

/**
 * The name pgrep, pkill and killall match: the first word of the command
 * line, without a login shell's dash, a directory or a kernel thread's
 * brackets, cut to the 15 characters Linux keeps (comm).
 *
 * @param {string} cmd A ProcRecord's cmd, like '-bash', '/usr/sbin/cron -f' or '[kthreadd]'.
 * @returns {string} The name, like 'bash', 'cron' or 'kthreadd'.
 */
export function processName(cmd) {
  const first = cmd.split(' ')[0].replace(/^-/, '');
  const name = /^\[.*\]$/.test(first) ? first.slice(1, -1) : first.slice(first.lastIndexOf('/') + 1);
  return name.slice(0, COMM_LENGTH);
}

function compilePattern(pattern, { exact = false, ignoreCase = false } = {}) {
  const compiled = compilePosix([pattern], { extended: true, ignoreCase, line: exact });
  let error = compiled.error;
  // POSIX regcomp, which procps uses, rejects what GNU grep only warns about.
  if (!error && compiled.warning) error = 'Invalid preceding regular expression';
  return { regex: error ? null : compiled.regex, error };
}

/**
 * The message pkill and pgrep give for a pattern they cannot compile.
 *
 * @param {string} pattern The pattern as typed.
 * @returns {string|null} The regex error, like 'Unmatched ( or \\(', or null for a valid pattern.
 */
export const patternError = pattern => compilePattern(pattern).error;

/**
 * Whether a process name matches a pattern as pkill and pgrep read it.
 *
 * @param {string} pattern An extended regular expression.
 * @param {string} name A process name, or a whole command line for -f.
 * @param {{exact?: boolean, ignoreCase?: boolean}} [opts] Match the whole name (-x), or regardless of case (-i).
 * @returns {boolean} True on a match; false also when the pattern is invalid.
 */
export function matchesProcess(pattern, name, opts = {}) {
  const { regex } = compilePattern(pattern, opts);
  return regex !== null && regex.test(name);
}

function isKillallSignalWord(word) {
  return /^-[A-Z0-9]/.test(word) && parseSignal(word.slice(1)) !== null;
}

function record(sel, known, signalOptions, [name, value]) {
  const field = known.get(name);
  if (signalOptions.includes(name)) return;
  if (field === 'users' || field === 'ttys') sel[field].push(...value.split(',').map(v => v.replace(/^\/dev\//, '')));
  else if (field) sel[field] = true;
  else sel.unknown ??= name;
}

function selectionError(command, sel) {
  const criteria = sel.patterns.length || sel.users.length || sel.ttys.length;
  let error = null;
  if (command === 'killall' && !sel.patterns.length && !sel.users.length) error = 'usage';
  else if (command === 'killall') error = null;
  else if (sel.patterns.length > 1) error = 'only one pattern can be provided';
  else if (!criteria) error = 'no matching criteria specified';
  else if (sel.patterns.length && patternError(sel.patterns[0])) error = `regex error: ${patternError(sel.patterns[0])}`;
  return error;
}

/**
 * Read what a pkill, pgrep or killall line selects.
 *
 * @param {'pkill'|'pgrep'|'killall'} command The command.
 * @param {string[]} args Its arguments.
 * @returns {{patterns: string[], users: string[], ttys: string[], exact: boolean, ignoreCase: boolean, full: boolean,
 *   regex: boolean, missing: string|null, unknown: string|null, error: string|null}}
 *   The criteria; missing names an option without its value; unknown, the first option
 *   the game does not read; error, the tool's own complaint ('usage' for killall's usage text).
 * @throws {Error} If command is not pkill, pgrep or killall.
 */
export function readSelection(command, args) {
  if (!Object.hasOwn(VALUE_OPTIONS, command)) throw new Error(`${command} does not select processes by name`);
  const grammar = VALUE_OPTIONS[command];
  const known = command === 'killall' ? KILLALL : PROCPS;
  const sel = { patterns: [], users: [], ttys: [], exact: false, ignoreCase: false, full: false, regex: command !== 'killall', missing: null, unknown: null, error: null };
  const scan = scanOptions(command === 'pkill' ? pkillPrescan(args).rest : args, grammar, (word, value) => {
    if (command === 'killall' && isKillallSignalWord(word)) return;
    for (const option of splitOption(word, value, grammar)) record(sel, known, SIGNAL_OPTIONS[command], option);
  });
  sel.patterns = scan.operands;
  sel.missing = scan.missing;
  if (command === 'killall') sel.exact = !sel.regex;
  if (!sel.missing && !sel.unknown) sel.error = selectionError(command, sel);
  return sel;
}

function nameMatches(sel, pattern, proc) {
  const name = processName(proc.cmd);
  let matched;
  if (sel.regex) matched = matchesProcess(pattern, sel.full ? proc.cmd : name, { exact: sel.exact, ignoreCase: sel.ignoreCase });
  else matched = sel.ignoreCase ? pattern.toLowerCase() === name.toLowerCase() : pattern === name;
  return matched;
}

/**
 * Whether a selection read by readSelection takes a process.
 *
 * @param {ReturnType<typeof readSelection>} sel The selection.
 * @param {{user: string, tty: string, cmd: string}} proc A process.
 * @returns {boolean} False for a selection with a missing value, an unknown option or an error.
 */
export function selectedBy(sel, proc) {
  const usable = sel.missing === null && sel.unknown === null && sel.error === null;
  const byName = !sel.patterns.length || sel.patterns.some(pattern => nameMatches(sel, pattern, proc));
  const byUser = !sel.users.length || sel.users.includes(proc.user);
  const byTty = !sel.ttys.length || sel.ttys.includes(proc.tty);
  return usable && byName && byUser && byTty;
}

/**
 * Whether a kill operand selects a process, as kill(2) reads it: a PID; 0,
 * the process group of the caller (the shell, since kill is a builtin); -1,
 * every process except the caller and init; or -N, the group led by N.
 *
 * @param {string} operand A kill operand, like '1234', '0', '-1' or '-1234'.
 * @param {{pid: number}} proc A process.
 * @param {{shellPid: number}} who The PID of the shell that runs kill.
 * @returns {boolean} True when the signal would reach proc.
 */
export function killSelects(operand, proc, { shellPid }) {
  const pid = /^-?\d+$/.test(operand) ? Number(operand) : null;
  let selected = false;
  if (pid === 0) selected = proc.pid === shellPid;
  else if (pid === -1) selected = proc.pid !== shellPid && proc.pid !== 1;
  else if (pid !== null) selected = proc.pid === Math.abs(pid);
  return selected;
}

/**
 * Whether a kill, pkill, pgrep or killall line selects a process.
 *
 * @param {'kill'|'pkill'|'pgrep'|'killall'} command The command, as in a CommandRecord's name.
 * @param {string[]} args Its arguments.
 * @param {{pid: number, user: string, tty: string, cmd: string}} proc A process, like the one with key 'shell'.
 * @param {{shellPid: number}} who The PID of the player's shell, whose group `kill 0` means.
 * @returns {boolean} True when the line, run as typed, would signal or list proc.
 * @throws {Error} If command is none of the four.
 */
export function selectsProcess(command, args, proc, { shellPid }) {
  if (!['kill', 'pkill', 'pgrep', 'killall'].includes(command)) throw new Error(`${command} does not select processes`);
  const sends = command === 'pgrep' || requestedSignal(command, args).status === 'send';
  let selected;
  if (command === 'kill') selected = requestedSignal('kill', args).operands.some(operand => killSelects(operand, proc, { shellPid }));
  else selected = selectedBy(readSelection(command, args), proc);
  return sends && selected;
}
