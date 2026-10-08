/**
 * What the simulated machine owns before any world is loaded: the root of the
 * tree with /usr/bin and /dev/null, the user's home, the system processes,
 * the PID counter, and the shell's own variables.
 */

import { newDir, newFile, insert } from './fs.js';
import { nameTable } from './table.js';
import { compareNames } from '../backend/tree.js';
import { initialVars, setVar } from './vars.js';
import { loginGids } from './accounts.js';

const ROOT_META = { owner: 'root', group: 'root' };

/** The terminal the player's shell runs on. */
export const TERMINAL = 'pts/0';

const BINARY = '\u007fELF\u0002\u0001\u0001\u0000';

// ext4 gives the root directory inode 2. Other numbers start low enough for
// a beginner to compare them at a glance.
const ROOT_INODE = 2;
const FIRST_INODE = 1801;

/**
 * A node's inode number, giving it the next free one if it has none yet.
 *
 * @param {object} sys The machine state.
 * @param {object} node A filesystem node.
 * @returns {number} Its inode number, the same for every name it has.
 */
export function inodeOf(sys, node) {
  if (node.ino === undefined) node.ino = node === sys.root ? ROOT_INODE : sys.nextIno++;
  return node.ino;
}

/**
 * Give every node without an inode number one, walking the tree in name order.
 *
 * @param {object} sys The machine state.
 * @returns {void}
 */
export function numberInodes(sys) {
  const stack = [sys.root];
  while (stack.length) {
    const node = stack.pop();
    inodeOf(sys, node);
    if (node.type === 'dir') stack.push(...Object.keys(node.children).sort(compareNames).reverse().map(name => node.children[name]));
  }
}

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

// Programs that run with their owner's rights (the s in -rwsr-xr-x).
const SETUID = new Set(['sudo']);

function baseTree(home, user, binaries, mtime) {
  const meta = mode => ({ ...ROOT_META, mode, mtime });
  const bin = {};
  for (const name of binaries) bin[name] = { ...newFile(BINARY, meta(SETUID.has(name) ? 0o4755 : 0o755)), bin: name };
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
  const make = (pid, ppid, user, cmd, tty, stat, key) => makeProc({ pid, ppid, user, cmd, tty, stat, key });
  const cron = allocPid(sys, 300);
  const sshd = allocPid(sys, 60);
  sys.shellPid = allocPid(sys, 900);
  return [
    make(1, 0, 'root', '/sbin/init', '?', 'Ss'),
    make(2, 0, 'root', '[kthreadd]', '?', 'S'),
    make(cron, 1, 'root', '/usr/sbin/cron -f', '?', 'Ss'),
    make(sshd, 1, 'root', '/usr/sbin/sshd -D', '?', 'Ss'),
    make(sys.shellPid, 1, sys.user, '-bash', TERMINAL, 'Ss', 'shell'),
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
  const started = now();
  const sys = {
    user, host, home, now, random,
    gids: [],
    password: null, sudoStamp: null,
    root: baseTree(home, user, binaries, started), loginTime: started,
    cwd: home, oldpwd: null,
    vars: initialVars({ user, home, host }), aliases: nameTable(), expandAliases: true, history: [], hashed: new Map(),
    positional: { zero: 'bash', args: [] }, flags: 'himBHs', lastStatus: 0, umask: 0o022, procs: [], nextPid: 300, shellPid: 0, columns: 80, nextIno: FIRST_INODE,
    jobs: [], jobMarks: { current: null, previous: null }, exits: new Map(), lastBackground: null,
  };
  sys.gids = loginGids(sys);
  sys.procs = systemProcs(sys);
  return sys;
}

/**
 * Change the terminal width, as a window resize does: programs writing to the
 * terminal lay out for it, and bash updates COLUMNS.
 *
 * @param {object} sys The machine state.
 * @param {number} columns Character columns the terminal shows.
 * @returns {void}
 * @throws {Error} If columns is not a positive integer.
 */
export function resizeTerminal(sys, columns) {
  if (!Number.isInteger(columns) || columns <= 0) throw new Error(`resize needs a positive integer column count, got ${columns}`);
  sys.columns = columns;
  setVar(sys, 'COLUMNS', String(columns));
}
