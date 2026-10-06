/**
 * Linux signals as Ubuntu on x86-64 numbers them, how kill, pkill and killall
 * read the signal to send from their arguments, and which signals end the
 * player's interactive bash. Any backend and the game rules share these
 * answers, so the simulator and the hearts always agree.
 */

const STANDARD = [
  'HUP', 'INT', 'QUIT', 'ILL', 'TRAP', 'ABRT', 'BUS', 'FPE', 'KILL', 'USR1', 'SEGV', 'USR2', 'PIPE', 'ALRM', 'TERM', 'STKFLT',
  'CHLD', 'CONT', 'STOP', 'TSTP', 'TTIN', 'TTOU', 'URG', 'XCPU', 'XFSZ', 'VTALRM', 'PROF', 'WINCH', 'IO', 'PWR', 'SYS',
];
const RTMIN = 34;
const RTMAX = 64;

function realtimeName(n) {
  let name = `RTMAX-${RTMAX - n}`;
  if (n === RTMIN) name = 'RTMIN';
  else if (n === RTMAX) name = 'RTMAX';
  else if (n - RTMIN <= 15) name = `RTMIN+${n - RTMIN}`;
  return name;
}

/** Every signal as `kill -l` lists it: [number, name], 1 to 31 and 34 to 64. */
export const SIGNAL_LIST = Object.freeze([
  ...STANDARD.map((name, i) => Object.freeze([i + 1, name])),
  ...Array.from({ length: RTMAX - RTMIN + 1 }, (_, i) => Object.freeze([RTMIN + i, realtimeName(RTMIN + i)])),
]);

const NUMBER_OF = new Map(SIGNAL_LIST.map(([n, name]) => [name, n]));
const NAME_OF = new Map(SIGNAL_LIST);
const NUMBER = /^\d+$/;

const SIG = Object.fromEntries(STANDARD.map((name, i) => [name, i + 1]));
const STOPS = new Set([SIG.STOP, SIG.TSTP, SIG.TTIN, SIG.TTOU]);
const IGNORED = new Set([SIG.CHLD, SIG.URG, SIG.WINCH]);
// bash(1), SIGNALS: an interactive bash ignores SIGTERM, catches SIGINT, always
// ignores SIGQUIT, and with job control ignores SIGTTIN, SIGTTOU and SIGTSTP.
const BASH_SURVIVES = new Set([SIG.TERM, SIG.INT, SIG.QUIT, SIG.TTIN, SIG.TTOU, SIG.TSTP]);

/**
 * @param {number} sig A signal number.
 * @returns {string|null} Its name without SIG, like 'KILL', or null if no signal has that number.
 */
export const signalName = sig => NAME_OF.get(sig) ?? null;

/**
 * Read a signal given as a number from 0 to 64 or as a name, in any case and
 * with or without SIG, as bash and procps accept it.
 *
 * @param {string} spec The signal as typed, like '9', 'KILL', 'sigkill' or 'RTMIN+2'.
 * @returns {number|null} Its number, or null if it names no signal.
 */
export function parseSignal(spec) {
  let sig = null;
  if (NUMBER.test(spec)) sig = Number(spec) <= RTMAX ? Number(spec) : null;
  else sig = NUMBER_OF.get(spec.toUpperCase().replace(/^SIG/, '')) ?? null;
  return sig;
}

function checkSignal(sig) {
  if (!Number.isInteger(sig) || sig < 0 || sig > RTMAX) throw new Error(`${sig} is not a signal number`);
}

/**
 * What the kernel does to a process that receives a signal it neither
 * catches nor ignores (signal(7)).
 *
 * @param {number} sig A signal number from 0 to 64.
 * @returns {'none'|'terminate'|'stop'|'continue'|'ignore'} The action; 'none' for 0, which only checks the process exists.
 * @throws {Error} If sig is not a signal number.
 */
export function defaultAction(sig) {
  checkSignal(sig);
  let action = 'terminate';
  if (sig === 0) action = 'none';
  else if (STOPS.has(sig)) action = 'stop';
  else if (sig === SIG.CONT) action = 'continue';
  else if (IGNORED.has(sig)) action = 'ignore';
  return action;
}

/**
 * Whether a signal sent to the player's interactive bash ends or stops it.
 *
 * @param {number} sig A signal number from 0 to 64.
 * @returns {boolean} True for HUP, KILL, STOP and the other signals whose default
 *   action ends or stops a process, except those bash ignores: TERM, INT, QUIT,
 *   TSTP, TTIN and TTOU.
 * @throws {Error} If sig is not a signal number.
 */
export function endsInteractiveShell(sig) {
  const action = defaultAction(sig);
  return (action === 'terminate' || action === 'stop') && !BASH_SURVIVES.has(sig);
}

const outcome = (status, signal, spec, operands) => ({ status, signal, spec, operands });

function decided(sig, spec, operands) {
  return sig === null ? outcome('invalid', null, spec, operands) : outcome('send', sig, spec, operands);
}

// The bash kill builtin: -l/-L list; -s SPEC, -n SPEC, -sNAME and -nNUM name
// the signal, and so does the first -SPEC; `--` or any other word ends the options.
function readKillWord(args, st) {
  const word = args[st.i++];
  if (word === '-l' || word === '-L') st.list = true;
  else if ((word === '-s' || word === '-n') && st.i === args.length) st.missing = word;
  else if (word === '-s' || word === '-n') st.spec = args[st.i++];
  else if (/^-(s[A-Za-z]|n\d)/.test(word)) st.spec = word.slice(2);
  else if (word.length > 1 && word.startsWith('-') && word !== '--' && st.spec === null) st.spec = word.slice(1);
  else {
    st.ended = true;
    if (word !== '--') st.i -= 1;
  }
}

function killSignal(args) {
  const st = { i: 0, spec: null, list: false, missing: null, ended: false };
  while (st.i < args.length && !st.ended && st.missing === null) readKillWord(args, st);
  let result = decided(st.spec === null ? 15 : parseSignal(st.spec), st.spec, args.slice(st.i));
  if (st.missing !== null) result = outcome('missing', null, st.missing, []);
  else if (st.list) result = outcome('list', null, null, args.slice(st.i));
  return result;
}

const PKILL_VALUES = 'gGPstuUFrqO';
const PKILL_LONG_VALUES = ['--signal', '--pgroup', '--group', '--parent', '--session', '--terminal', '--euid', '--uid', '--pidfile', '--runstates', '--queue', '--older', '--ns', '--nslist', '--cgroup'];
const KILLALL_VALUES = 'syounZ';
const KILLALL_LONG_VALUES = ['--signal', '--younger-than', '--older-than', '--user', '--ns', '--context'];

function takesNextValue(word, shortValues, longValues) {
  const letters = word.slice(1);
  return word.startsWith('--') ? longValues.includes(word) : [...letters].findIndex(c => shortValues.includes(c)) === letters.length - 1;
}

// Walk getopt-style arguments up to `--`, calling onOption with each option
// word and the value it takes from the next argument, if any.
function scanOptions(args, shortValues, longValues, onOption) {
  const end = args.includes('--') ? args.indexOf('--') : args.length;
  const operands = [];
  let missing = null;
  for (let i = 0; i < end && missing === null; i++) {
    const word = args[i];
    if (word.length < 2 || !word.startsWith('-')) operands.push(word);
    else if (!takesNextValue(word, shortValues, longValues)) onOption(word, null);
    else if (i + 1 === end) missing = word;
    else onOption(word, args[++i]);
  }
  return { operands: [...operands, ...args.slice(end + 1)], missing };
}

function pkillSignal(args) {
  const prescan = args.findIndex(word => word.length > 1 && word.startsWith('-') && !word.startsWith('--') && parseSignal(word.slice(1)) !== null);
  const rest = prescan < 0 ? args : args.filter((_, i) => i !== prescan);
  let spec = prescan < 0 ? null : args[prescan].slice(1);
  const scan = scanOptions(rest, PKILL_VALUES, PKILL_LONG_VALUES, (word, value) => {
    if (word === '--signal') spec = value;
    else if (word.startsWith('--signal=')) spec = word.slice('--signal='.length);
  });
  let result = decided(spec === null ? 15 : parseSignal(spec), spec, scan.operands);
  if (scan.missing !== null) result = outcome('missing', null, scan.missing, []);
  return result;
}

// psmisc killall: signal names are case-sensitive, have no realtime forms,
// and an unknown option that is not an uppercase name or a number is a usage error.
function killallNumber(spec) {
  let sig = null;
  if (NUMBER.test(spec)) sig = parseSignal(spec);
  else if (STANDARD.includes(spec.replace(/^SIG/, ''))) sig = NUMBER_OF.get(spec.replace(/^SIG/, ''));
  return sig;
}

function killallSignal(args) {
  let spec = null;
  let list = false;
  let usage = null;
  const scan = scanOptions(args, KILLALL_VALUES, KILLALL_LONG_VALUES, (word, value) => {
    if (word === '--signal' || word === '-s') spec = value;
    else if (word.startsWith('--signal=')) spec = word.slice('--signal='.length);
    else if (/^-s./.test(word)) spec = word.slice(2);
    else if (word === '-l' || word === '--list') list = true;
    else if (/^-[A-Z\d]/.test(word)) spec = word.slice(1);
    else if (!/^-[egiqrvwIV]+$|^--/.test(word)) usage = usage ?? word;
  });
  let result = decided(spec === null ? 15 : killallNumber(spec), spec, scan.operands);
  if (scan.missing !== null) result = outcome('missing', null, scan.missing, []);
  else if (list) result = outcome('list', null, null, scan.operands);
  else if (usage !== null) result = outcome('usage', null, usage, scan.operands);
  return result;
}

const READERS = { kill: killSignal, pkill: pkillSignal, killall: killallSignal };

/**
 * Read which signal a kill, pkill or killall command line asks for.
 *
 * @param {'kill'|'pkill'|'killall'} command The command name.
 * @param {string[]} args Its arguments, as in a CommandRecord.
 * @returns {{status: 'send'|'list'|'invalid'|'missing'|'usage', signal: number|null, spec: string|null, operands: string[]}}
 *   'send' with the signal number (TERM, 15, when none is named) and the operands
 *   (PIDs or names); 'list' for `kill -l` or `killall -l`; 'invalid' when spec
 *   names no signal; 'missing' when spec, an option, lacks its value; 'usage'
 *   when killall gets an option it does not know. Only 'send' has a signal.
 * @throws {Error} If command is not kill, pkill or killall.
 */
export function requestedSignal(command, args) {
  if (!Object.hasOwn(READERS, command)) throw new Error(`${command} does not send signals`);
  return READERS[command](args);
}
