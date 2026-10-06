/**
 * Processes and signals: ps, kill, pkill, killall, pgrep, top, htop.
 */

import { allocPid } from '../system.js';
import { result, withNote } from '../result.js';

export const SIGNALS = { HUP: 1, INT: 2, QUIT: 3, ABRT: 6, KILL: 9, USR1: 10, USR2: 12, PIPE: 13, ALRM: 14, TERM: 15, CHLD: 17, CONT: 18, STOP: 19, TSTP: 20 };
const NAME_OF = Object.fromEntries(Object.entries(SIGNALS).map(([k, v]) => [v, k]));
const TERMINATING = new Set([1, 2, 3, 6, 9, 10, 12, 13, 14, 15]);
const STOPPING = new Set([19, 20]);
const UNCATCHABLE = new Set([9, 19]);
const SHELL_IGNORES = new Set([2, 3, 15, 20]);
const KILL_USAGE = 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]';
const SIGNAL_TABLE = ' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP\n 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1\n11) SIGSEGV\t12) SIGUSR2\t13) SIGPIPE\t14) SIGALRM\t15) SIGTERM\n16) SIGSTKFLT\t17) SIGCHLD\t18) SIGCONT\t19) SIGSTOP\t20) SIGTSTP\n';

/**
 * Parse a signal given as a number (`9`) or a name with or without SIG (`KILL`, `sigterm`).
 *
 * @param {string|undefined} spec The signal as typed.
 * @returns {number|null} Its number, or null if it is not a signal.
 */
export function parseSignal(spec) {
  let sig = null;
  if (spec !== undefined && /^\d+$/.test(spec)) {
    const n = parseInt(spec, 10);
    sig = n >= 0 && n <= 64 ? n : null;
  } else if (spec !== undefined) {
    sig = SIGNALS[spec.toUpperCase().replace(/^SIG/, '')] ?? null;
  }
  return sig;
}

const signalName = sig => NAME_OF[sig] ?? String(sig);

function clockTime(t) {
  const [m, s] = t.split(':').map(Number);
  return [Math.floor(m / 60), m % 60, s].map(x => String(x).padStart(2, '0')).join(':');
}

function shortCmd(cmd) {
  const first = cmd.split(' ')[0].replace(/^-/, '');
  return first.startsWith('[') ? cmd : first.slice(first.lastIndexOf('/') + 1);
}

function signalShell(sys, sig, block) {
  let note = null;
  if (SHELL_IGNORES.has(sig)) note = `Interactive bash ignores SIG${signalName(sig)}, so your shell keeps running.`;
  else if (TERMINATING.has(sig) || sig === 19) block(`SIG${signalName(sig)} would stop the player's own shell (PID ${sys.shellPid})`);
  return note;
}

/**
 * Deliver a signal to one process as the kernel would for the shell's user.
 *
 * @param {object} sys The machine state.
 * @param {object} proc The target process.
 * @param {number} sig The signal number.
 * @param {(reason: string) => void} block Reports a refusal to protect the player's shell.
 * @returns {{denied: boolean, note: string|null}} Whether permission was denied, and an explanation to show.
 */
export function deliver(sys, proc, sig, block) {
  const denied = sys.user !== 'root' && proc.user !== sys.user;
  const ignored = proc.ignores.has(sig) && !UNCATCHABLE.has(sig);
  let note = null;
  if (denied || sig === 0) note = null;
  else if (proc.pid === sys.shellPid) note = signalShell(sys, sig, block);
  else if (ignored) note = null;
  else if (TERMINATING.has(sig)) sys.procs = sys.procs.filter(p => p !== proc);
  else if (STOPPING.has(sig)) proc.stat = `T${proc.stat.slice(1)}`;
  else if (sig === SIGNALS.CONT && proc.stat.startsWith('T')) proc.stat = `${proc.runStat}${proc.stat.slice(1)}`;
  return { denied, note };
}

function psRows(list, { user, full }) {
  let rows;
  if (user) {
    rows = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND'];
    for (const p of list) {
      const vsz = Math.round(8000 + p.mem * 160000);
      const rss = Math.round(1200 + p.mem * 40000);
      rows.push(`${p.user.padEnd(8)} ${String(p.pid).padStart(7)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(vsz).padStart(6)} ${String(rss).padStart(5)} ${p.tty.padEnd(8)} ${p.stat.padEnd(4)} 09:00 ${p.time.padStart(6)} ${p.cmd}`);
    }
  } else if (full) {
    rows = ['UID          PID    PPID  C STIME TTY          TIME CMD'];
    for (const p of list) {
      rows.push(`${p.user.padEnd(8)} ${String(p.pid).padStart(7)} ${String(p.ppid).padStart(7)} ${p.cpu > 50 ? '99' : ' 0'} 09:00 ${p.tty.padEnd(8)} ${clockTime(p.time)} ${p.cmd}`);
    }
  } else {
    rows = ['    PID TTY          TIME CMD', ...list.map(p => `${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} ${clockTime(p.time)} ${shortCmd(p.cmd)}`)];
  }
  return rows;
}

function ps(args, { sys }) {
  let all = false;
  let full = false;
  let user = false;
  for (const x of args) {
    const dashed = x.startsWith('-');
    if (dashed && /[eA]/.test(x)) all = true;
    if (dashed && x.includes('f')) full = true;
    if (!dashed && x.includes('x')) all = true;
    if (!dashed && x.includes('u')) user = true;
  }
  const self = { pid: allocPid(sys), ppid: sys.shellPid, user: sys.user, cmd: ['ps', ...args].join(' '), tty: 'pts/0', cpu: 0, mem: 0, stat: 'R+', time: '0:00' };
  const list = [...sys.procs.filter(p => all || p.tty === 'pts/0'), self].sort((x, y) => x.pid - y.pid);
  return result(`${psRows(list, { user, full }).join('\n')}\n`);
}

function killArgs(args) {
  let sig = SIGNALS.TERM;
  let start = 0;
  let error = null;
  if (args[0] === '-s' || args[0] === '-n') {
    sig = parseSignal(args[1]);
    start = 2;
    if (sig === null) error = `bash: kill: ${args[1]}: invalid signal specification`;
  } else if (args[0].startsWith('-')) {
    sig = parseSignal(args[0].slice(1));
    start = 1;
    if (sig === null) error = `bash: kill: ${args[0].slice(1)}: invalid signal specification`;
  }
  return { sig, pids: args.slice(start), error };
}

function kill(args, { sys, block }) {
  if (!args.length) return result('', KILL_USAGE, 2);
  if (args[0] === '-l' || args[0] === '-L') return result(SIGNAL_TABLE);
  const { sig, pids, error } = killArgs(args);
  if (error) return result('', error, 1);
  if (!pids.length) return result('', KILL_USAGE, 2);
  const errs = [];
  const notes = [];
  for (const x of pids) {
    const proc = /^\d+$/.test(x) ? sys.procs.find(p => p.pid === parseInt(x, 10)) : null;
    const sent = proc ? deliver(sys, proc, sig, block) : null;
    if (!/^\d+$/.test(x)) errs.push(`bash: kill: ${x}: arguments must be process or job IDs`);
    else if (!proc) errs.push(`bash: kill: (${x}) - No such process`);
    else if (sent.denied) errs.push(`bash: kill: (${x}) - Operation not permitted`);
    if (sent?.note) notes.push(sent.note);
  }
  return withNote(result('', errs.join('\n'), errs.length ? 1 : 0), notes[0] ?? null);
}

function killByName(name, args, { sys, block }, exact) {
  let sig = SIGNALS.TERM;
  const patterns = [];
  for (const x of args) {
    if (x.startsWith('-')) sig = parseSignal(x.slice(1).replace(/^-?signal=?/, '')) ?? sig;
    else patterns.push(x);
  }
  if (!patterns.length) {
    return exact ? result('', 'Usage: killall [OPTION]... [--] NAME...', 1)
      : result('', "pkill: no matching criteria specified\nTry `pkill --help' for more information.", 2);
  }
  const errs = [];
  const notes = [];
  let matched = 0;
  for (const pat of patterns) {
    const hits = sys.procs.filter(p => (exact ? shortCmd(p.cmd) === pat : shortCmd(p.cmd).includes(pat)));
    matched += hits.length;
    if (!hits.length && exact) errs.push(`${pat}: no process found`);
    for (const p of hits) {
      const sent = deliver(sys, p, sig, block);
      if (sent.denied) errs.push(exact ? `${name}: ${shortCmd(p.cmd)}(${p.pid}): Operation not permitted` : `${name}: killing pid ${p.pid} failed: Operation not permitted`);
      if (sent.note) notes.push(sent.note);
    }
  }
  return withNote(result('', errs.join('\n'), matched ? 0 : 1), notes[0] ?? null);
}

function pgrep(args, { sys }) {
  const pat = args.filter(x => !x.startsWith('-'))[0];
  if (!pat) return result('', 'pgrep: no matching criteria specified', 2);
  const hits = sys.procs.filter(p => shortCmd(p.cmd).includes(pat));
  return result(hits.map(p => `${p.pid}\n`).join(''), '', hits.length ? 0 : 1);
}

function top(_args, { sys }) {
  const d = new Date(sys.now());
  const two = x => String(x).padStart(2, '0');
  const list = [...sys.procs].sort((x, y) => y.cpu - x.cpu);
  const cpu = Math.min(99.9, list.reduce((t, p) => t + p.cpu, 0));
  const running = list.filter(p => p.stat.startsWith('R')).length;
  const stopped = list.filter(p => p.stat.startsWith('T')).length;
  const busy = cpu > 50;
  const rows = [
    `top - ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} up 3 days,  2:14,  1 user,  load average: ${busy ? '1.02, 0.98, 0.91' : '0.02, 0.10, 0.31'}`,
    `Tasks: ${String(list.length).padStart(3)} total, ${String(running).padStart(3)} running, ${String(list.length - running - stopped).padStart(3)} sleeping, ${String(stopped).padStart(3)} stopped,   0 zombie`,
    `%Cpu(s): ${cpu.toFixed(1).padStart(4)} us,  0.2 sy,  0.0 ni, ${(99.8 - cpu).toFixed(1).padStart(4)} id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st`,
    '',
    '    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND',
    ...list.map(x => `${String(x.pid).padStart(7)} ${x.user.padEnd(8)}  20   0 ${String(Math.round(8000 + x.mem * 160000)).padStart(7)} ${String(Math.round(1200 + x.mem * 40000)).padStart(6)}   2048 ${x.stat[0]} ${x.cpu.toFixed(1).padStart(5)} ${x.mem.toFixed(1).padStart(5)} ${x.time.padStart(9)} ${shortCmd(x.cmd)}`),
  ];
  return withNote(result(`${rows.join('\n')}\n`), 'Real top refreshes every few seconds until you press q. The game shows one snapshot.');
}

export default {
  ps,
  kill,
  pkill: (args, ctx) => killByName('pkill', args, ctx, false),
  killall: (args, ctx) => killByName('killall', args, ctx, true),
  pgrep,
  top,
  htop: (args, ctx) => withNote(top(args, ctx), 'htop is a friendlier top, often installed separately (sudo apt install htop). Here is a top snapshot instead.'),
};
