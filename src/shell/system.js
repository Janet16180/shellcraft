/**
 * What the simulated machine owns before any world is loaded: the root of the
 * tree with /usr/bin and /dev/null, the user's home, the system processes,
 * the PID counter, and the shell's own variables.
 */

import { newDir, newFile, insert } from './fs.js';
import { initialVars } from './vars.js';

const ROOT_META = { owner: 'root', group: 'root' };
const BINARY = '\u007fELF\u0002\u0001\u0001\u0000';

/**
 * Pick the next PID. Real kernels hand them out in increasing order with gaps
 * left by short-lived processes, so each call skips a random amount.
 *
 * @param {object} sys The machine state.
 * @param {number} maxGap Largest number of PIDs to skip.
 * @returns {number} The new PID.
 */
export function allocPid(sys, maxGap = 3) {
  sys.nextPid += 1 + Math.floor(sys.random() * maxGap);
  return sys.nextPid;
}

function baseTree(home, user, binaries, mtime) {
  const meta = mode => ({ ...ROOT_META, mode, mtime });
  const bin = {};
  for (const name of binaries) bin[name] = { ...newFile(BINARY, meta(0o755)), bin: name };
  const root = newDir({
    usr: newDir({ bin: newDir(bin, meta(0o755)) }, meta(0o755)),
    dev: newDir({ null: { ...newFile('', meta(0o666)), dev: 'null' } }, meta(0o755)),
  }, meta(0o755));
  let path = '';
  for (const part of home.split('/').filter(Boolean).slice(0, -1)) {
    path += `/${part}`;
    insert(root, path, newDir({}, meta(0o755)));
  }
  insert(root, home, newDir({}, { mode: 0o750, owner: user, group: user, mtime }));
  return root;
}

/**
 * Build a process entry.
 *
 * @param {{pid: number, ppid: number, user: string, cmd: string, tty?: string, stat?: string, cpu?: number, mem?: number, time?: string, key?: string, ignores?: number[]}} spec
 *   The process; `ignores` lists the signal numbers it survives.
 * @returns {object} The process as the simulator keeps it.
 */
export function makeProc({ pid, ppid, user, cmd, tty = '?', stat = 'S', cpu = 0, mem = 0, time = '0:00', key, ignores = [] }) {
  const proc = { pid, ppid, user, cmd, tty, stat, cpu, mem, time, runStat: stat[0], ignores: new Set(ignores) };
  if (key !== undefined) proc.key = key;
  return proc;
}

function systemProcs(sys) {
  const make = (pid, ppid, user, cmd, tty, stat) => makeProc({ pid, ppid, user, cmd, tty, stat });
  const cron = allocPid(sys, 300);
  const sshd = allocPid(sys, 60);
  sys.shellPid = allocPid(sys, 900);
  return [
    make(1, 0, 'root', '/sbin/init', '?', 'Ss'),
    make(2, 0, 'root', '[kthreadd]', '?', 'S'),
    make(cron, 1, 'root', '/usr/sbin/cron -f', '?', 'Ss'),
    make(sshd, 1, 'root', '/usr/sbin/sshd -D', '?', 'Ss'),
    make(sys.shellPid, 1, sys.user, '-bash', 'pts/0', 'Ss'),
  ];
}

/**
 * Create the machine state.
 *
 * @param {{user: string, host: string, home: string, now: () => number, random: () => number, binaries: string[]}} opts
 *   The user, host name, home directory, clock, random source, and the command names that get a file in /usr/bin.
 * @returns {object} The machine state every shell module works on.
 * @throws {Error} If home is not an absolute path below '/'.
 */
export function createSystem({ user, host, home, now, random, binaries }) {
  if (!home.startsWith('/') || home === '/') throw new Error(`home must be an absolute path below /, got ${home}`);
  const sys = {
    user, host, home, now, random,
    groups: [user],
    root: baseTree(home, user, binaries, now()),
    cwd: home, oldpwd: null,
    vars: initialVars({ user, home, host }), aliases: { ll: 'ls -alF', la: 'ls -A' }, history: [], hashed: new Set(),
    lastStatus: 0, umask: 0o022, procs: [], nextPid: 300, shellPid: 0,
  };
  sys.procs = systemProcs(sys);
  return sys;
}
