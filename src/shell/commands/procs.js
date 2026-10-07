/**
 * Processes and signals: ps, kill, pkill, killall, pgrep, top, htop.
 */

import { allocPid, TERMINAL, knownUsers } from '../system.js';
import { result, withNote } from '../result.js';
import { SIGNAL_LIST, signalName, parseSignal, defaultAction, endsInteractiveShell, requestedSignal } from '../../backend/signals.js';
import { processName, readSelection, selectedBy, killSelects } from '../../backend/process.js';
import { REAL_OPTIONS } from '../real-options.js';
import { optionFailure } from '../options.js';

const KILL = parseSignal('KILL');
const STOP = parseSignal('STOP');
const UNCATCHABLE = new Set([KILL, STOP]);
const KILL_USAGE = 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]';
const SIGNAL_TABLE = SIGNAL_LIST.map(([n, name], i) => `${String(n).padStart(2)}) SIG${name}${(i + 1) % 5 === 0 ? '\n' : '\t'}`).join('') + '\n';
const PGREP_USAGE = `Usage:
 pgrep [options] <pattern>

Options:
 -d, --delimiter <string>  specify output delimiter
 -l, --list-name           list PID and process name
 -a, --list-full           list PID and full command line
 -v, --inverse             negates the matching
 -w, --lightweight         list all TID
 -c, --count               count of matching processes
 -f, --full                use full process name to match
 -g, --pgroup <PGID,...>   match listed process group IDs
 -G, --group <GID,...>     match real group IDs
 -i, --ignore-case         match case insensitively
 -n, --newest              select most recently started
 -o, --oldest              select least recently started
 -O, --older <seconds>     select where older than seconds
 -P, --parent <PPID,...>   match only child processes of the given parent
 -s, --session <SID,...>   match session IDs
     --signal <sig>        signal to send (either number or name)
 -t, --terminal <tty,...>  match by controlling terminal
 -u, --euid <ID,...>       match by effective IDs
 -U, --uid <ID,...>        match by real IDs
 -x, --exact               match exactly with the command name
 -F, --pidfile <file>      read PIDs from file
 -L, --logpidfile          fail if PID file is not locked
 -r, --runstates <state>   match runstates [D,S,Z,...]
 -A, --ignore-ancestors    exclude our ancestors from results
 --cgroup <grp,...>        match by cgroup v2 names
 --ns <PID>                match the processes that belong to the same
                           namespace as <pid>
 --nslist <ns,...>         list which namespaces will be considered for
                           the --ns option.
                           Available namespaces: ipc, mnt, net, pid, user, uts

 -h, --help     display this help and exit
 -V, --version  output version information and exit

For more details see pgrep(1).`;
const PKILL_USAGE = `Usage:
 pkill [options] <pattern>

Options:
 -<sig>                    signal to send (either number or name)
 -H, --require-handler     match only if signal handler is present
 -q, --queue <value>       integer value to be sent with the signal
 -e, --echo                display what is killed
 -c, --count               count of matching processes
 -f, --full                use full process name to match
 -g, --pgroup <PGID,...>   match listed process group IDs
 -G, --group <GID,...>     match real group IDs
 -i, --ignore-case         match case insensitively
 -n, --newest              select most recently started
 -o, --oldest              select least recently started
 -O, --older <seconds>     select where older than seconds
 -P, --parent <PPID,...>   match only child processes of the given parent
 -s, --session <SID,...>   match session IDs
     --signal <sig>        signal to send (either number or name)
 -t, --terminal <tty,...>  match by controlling terminal
 -u, --euid <ID,...>       match by effective IDs
 -U, --uid <ID,...>        match by real IDs
 -x, --exact               match exactly with the command name
 -F, --pidfile <file>      read PIDs from file
 -L, --logpidfile          fail if PID file is not locked
 -r, --runstates <state>   match runstates [D,S,Z,...]
 -A, --ignore-ancestors    exclude our ancestors from results
 --cgroup <grp,...>        match by cgroup v2 names
 --ns <PID>                match the processes that belong to the same
                           namespace as <pid>
 --nslist <ns,...>         list which namespaces will be considered for
                           the --ns option.
                           Available namespaces: ipc, mnt, net, pid, user, uts

 -h, --help     display this help and exit
 -V, --version  output version information and exit

For more details see pgrep(1).`;
const KILLALL_USAGE = `Usage: killall [OPTION]... [--] NAME...
       killall -l, --list
       killall -V, --version

  -e,--exact          require exact match for very long names
  -I,--ignore-case    case insensitive process name match
  -g,--process-group  kill process group instead of process
  -y,--younger-than   kill processes younger than TIME
  -o,--older-than     kill processes older than TIME
  -i,--interactive    ask for confirmation before killing
  -l,--list           list all known signal names
  -q,--quiet          don't print complaints
  -r,--regexp         interpret NAME as an extended regular expression
  -s,--signal SIGNAL  send this signal instead of SIGTERM
  -u,--user USER      kill only process(es) running as USER
  -v,--verbose        report if the signal was successfully sent
  -V,--version        display version information
  -w,--wait           wait for processes to die
  -n,--ns PID         match processes that belong to the same namespaces
                      as PID
  -Z,--context REGEXP kill only process(es) having context
                      (must precede other arguments)

`;
const KILLALL_LIST = `HUP INT QUIT ILL TRAP ABRT BUS FPE KILL USR1 SEGV USR2 PIPE ALRM TERM STKFLT
CHLD CONT STOP TSTP TTIN TTOU URG XCPU XFSZ VTALRM PROF WINCH POLL PWR SYS
`;

function clockTime(t) {
  const [m, s] = t.split(':').map(Number);
  return [Math.floor(m / 60), m % 60, s].map(x => String(x).padStart(2, '0')).join(':');
}

function signalShell(sys, sig, block) {
  const harmful = ['terminate', 'stop'].includes(defaultAction(sig));
  let note = null;
  if (endsInteractiveShell(sig)) block(`SIG${signalName(sig)} would stop the player's own shell (PID ${sys.shellPid})`);
  else if (harmful) note = `Interactive bash ignores SIG${signalName(sig)}, so your shell keeps running.`;
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
  else if (defaultAction(sig) === 'terminate') sys.procs = sys.procs.filter(p => p !== proc);
  else if (defaultAction(sig) === 'stop') proc.stat = `T${proc.stat.slice(1)}`;
  else if (defaultAction(sig) === 'continue' && proc.stat.startsWith('T')) proc.stat = `${proc.runStat}${proc.stat.slice(1)}`;
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
    rows = ['    PID TTY          TIME CMD', ...list.map(p => `${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} ${clockTime(p.time)} ${processName(p.cmd)}`)];
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
  const self = { pid: allocPid(sys), ppid: sys.shellPid, user: sys.user, cmd: ['ps', ...args].join(' '), tty: TERMINAL, cpu: 0, mem: 0, stat: 'R+', time: '0:00' };
  const list = [...sys.procs.filter(p => all || p.tty === TERMINAL), self].sort((x, y) => x.pid - y.pid);
  return result(`${psRows(list, { user, full }).join('\n')}\n`);
}

function listSignals(args) {
  const named = args.map(a => {
    const n = /^\d+$/.test(a) ? Number(a) : null;
    const name = n === null ? null : signalName(n > 128 ? n - 128 : n);
    const sig = n === null ? parseSignal(a) : null;
    if (n !== null) return name ? { out: `${name}\n` } : { err: `bash: kill: ${a}: invalid signal specification` };
    return sig ? { out: `${sig}\n` } : { err: `bash: kill: ${a}: invalid signal specification` };
  });
  const errs = named.filter(x => x.err).map(x => x.err);
  return args.length ? result(named.map(x => x.out ?? '').join(''), errs.join('\n'), errs.length ? 1 : 0) : result(SIGNAL_TABLE);
}

const KILL_ERRORS = {
  missing: spec => `bash: kill: ${spec}: option requires an argument`,
  invalid: spec => `bash: kill: ${spec}: invalid signal specification`,
};

// kill -1 reaches every process the user owns but the shell. kill(2) skips
// init and other users' processes without an error.
function killOne(sys, x, sig, block) {
  const pid = /^-?\d+$/.test(x) ? Number(x) : null;
  const reached = sys.procs.filter(p => killSelects(x, p, { shellPid: sys.shellPid }) && (pid !== -1 || p.user === sys.user));
  const sent = reached.map(p => deliver(sys, p, sig, block));
  let error = null;
  if (pid === null) error = `bash: kill: ${x}: arguments must be process or job IDs`;
  else if (!sent.length) error = `bash: kill: (${x}) - No such process`;
  else if (sent.every(r => r.denied)) error = `bash: kill: (${x}) - Operation not permitted`;
  return { error, note: sent.find(r => r.note)?.note ?? null };
}

function kill(args, { sys, block }) {
  if (!args.length) return result('', KILL_USAGE, 2);
  const asked = requestedSignal('kill', args);
  if (asked.status === 'list') return listSignals(asked.operands);
  if (asked.status !== 'send') return result('', KILL_ERRORS[asked.status](asked.spec), 1);
  if (!asked.operands.length) return result('', KILL_USAGE, 2);
  const sent = asked.operands.map(x => killOne(sys, x, asked.signal, block));
  const errs = sent.filter(r => r.error).map(r => r.error);
  return withNote(result('', errs.join('\n'), errs.length ? 1 : 0), sent.find(r => r.note)?.note ?? null);
}

const PROCPS_USAGE = { pkill: PKILL_USAGE, pgrep: PGREP_USAGE };
const PKILL_SIGNAL_ERRORS = {
  invalid: spec => `Unknown signal "${spec}".\n${PKILL_USAGE}`,
  missing: spec => `${getoptMessage('pkill', spec, true)}\n\n${PKILL_USAGE}`,
};
const isReal = (name, option) => Object.hasOwn(REAL_OPTIONS, name) && (option.startsWith('--') ? REAL_OPTIONS[name].long.includes(option) : REAL_OPTIONS[name].short.includes(option[1]));
const notSimulated = (name, option, status) => optionFailure(name, { err: null, unsimulated: option }, status);

function getoptMessage(name, option, missing) {
  let text = option.startsWith('--') ? `${name}: unrecognized option '${option}'` : `${name}: invalid option -- '${option[1]}'`;
  if (missing) text = option.startsWith('--') ? `${name}: option '${option}' requires an argument` : `${name}: option requires an argument -- '${option[1]}'`;
  return text;
}

// The complaints pkill and pgrep make before matching anything, in their order.
function procpsFailure(name, sel, sys) {
  const usage = PROCPS_USAGE[name];
  const unknownUser = sel.users.find(u => !knownUsers(sys).has(u));
  let r = null;
  if (sel.missing) r = result('', `${getoptMessage(name, sel.missing, true)}\n\n${usage}`, 2);
  else if (sel.unknown && isReal(name, sel.unknown)) r = notSimulated(name, sel.unknown, 2);
  else if (sel.unknown) r = result('', `${getoptMessage(name, sel.unknown, false)}\n\n${usage}`, 2);
  else if (sel.error?.startsWith('regex error')) r = result('', `${name}: ${sel.error}`, 2);
  else if (sel.error) r = result('', `${name}: ${sel.error}\nTry \`${name} --help' for more information.`, 2);
  else if (unknownUser) r = result('', `${name}: invalid user name: ${unknownUser}`, 2);
  return r;
}

function killallFailure(asked, sel, sys) {
  const unknownUser = sel.users.find(u => !knownUsers(sys).has(u));
  let r = null;
  if (asked.status === 'list') r = result(KILLALL_LIST);
  else if (asked.status === 'invalid') r = result('', `${asked.spec}: unknown signal; killall -l lists signals.`, 1);
  else if (sel.unknown && isReal('killall', sel.unknown)) r = notSimulated('killall', sel.unknown, 1);
  else if (asked.status !== 'send' || sel.missing || sel.unknown || sel.error) r = result('', KILLALL_USAGE, 1);
  else if (unknownUser) r = result('', `Cannot find user ${unknownUser}`, 1);
  return r;
}

function signalAll(sys, procs, sig, block, denied) {
  const errs = [];
  const notes = [];
  for (const p of procs) {
    const sent = deliver(sys, p, sig, block);
    if (sent.denied) errs.push(denied(p));
    if (sent.note) notes.push(sent.note);
  }
  return { errs, note: notes[0] ?? null };
}

function pkill(args, { sys, block }) {
  const asked = requestedSignal('pkill', args);
  const sel = readSelection('pkill', args);
  const failed = asked.status === 'send' ? procpsFailure('pkill', sel, sys) : result('', PKILL_SIGNAL_ERRORS[asked.status](asked.spec), 2);
  if (failed) return failed;
  const hits = sys.procs.filter(p => selectedBy(sel, p));
  const sent = signalAll(sys, hits, asked.signal, block, p => `pkill: killing pid ${p.pid} failed: Operation not permitted`);
  return withNote(result('', sent.errs.join('\n'), hits.length ? 0 : 1), sent.note);
}

function killall(args, { sys, block }) {
  const asked = requestedSignal('killall', args);
  const sel = readSelection('killall', args);
  const failed = killallFailure(asked, sel, sys);
  if (failed) return failed;
  const groups = sel.patterns.length ? sel.patterns.map(name => ({ name, sel: { ...sel, patterns: [name] } })) : [{ name: null, sel }];
  const errs = [];
  let note = null;
  let missed = false;
  for (const group of groups) {
    const hits = sys.procs.filter(p => selectedBy(group.sel, p));
    if (!hits.length && group.name) errs.push(`${group.name}: no process found`);
    missed ||= !hits.length;
    const sent = signalAll(sys, hits, asked.signal, block, p => `killall: ${processName(p.cmd)}(${p.pid}): Operation not permitted`);
    errs.push(...sent.errs);
    note ??= sent.note;
  }
  return withNote(result('', errs.join('\n'), missed ? 1 : 0), note);
}

function pgrep(args, { sys }) {
  const sel = readSelection('pgrep', args);
  const failed = procpsFailure('pgrep', sel, sys);
  if (failed) return failed;
  const hits = sys.procs.filter(p => selectedBy(sel, p)).sort((a, b) => a.pid - b.pid);
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
    ...list.map(x => `${String(x.pid).padStart(7)} ${x.user.padEnd(8)}  20   0 ${String(Math.round(8000 + x.mem * 160000)).padStart(7)} ${String(Math.round(1200 + x.mem * 40000)).padStart(6)}   2048 ${x.stat[0]} ${x.cpu.toFixed(1).padStart(5)} ${x.mem.toFixed(1).padStart(5)} ${x.time.padStart(9)} ${processName(x.cmd)}`),
  ];
  return withNote(result(`${rows.join('\n')}\n`), 'Real top refreshes every few seconds until you press q. The game shows one snapshot.');
}

export default {
  ps,
  kill,
  pkill,
  killall,
  pgrep,
  top,
  htop: (args, ctx) => withNote(top(args, ctx), 'htop is a friendlier top, often installed separately (sudo apt install htop). Here is a top snapshot instead.'),
};
