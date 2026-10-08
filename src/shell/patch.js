/**
 * Applying world patches (src/backend/spec.js) to the simulated machine.
 */

import { validatePatch } from '../backend/spec.js';
import { lookup, fromSpec, insert, detach, addChild, depthOf, heightOf, MAX_TREE_DEPTH } from './fs.js';
import { parentOf, baseName } from '../backend/tree.js';
import { allocPid, makeProc, TERMINAL } from './system.js';
import { parseSignal, signalName } from '../backend/signals.js';
import { loginGids } from './accounts.js';

const SYSTEM_PATHS = ['/usr/bin', '/dev/null'];

function touchesSystem(path) {
  return SYSTEM_PATHS.some(sp => path === '/' || sp === path || sp.startsWith(`${path}/`) || path.startsWith(`${sp}/`));
}

function signalNumbers(spec) {
  return (spec.ignores ?? []).map(name => {
    const sig = parseSignal(name);
    if (sig === null || signalName(sig) !== name) throw new Error(`proc ${spec.key}: unknown signal ${name}`);
    return sig;
  });
}

function pidFor(sys, spec) {
  if (spec.pid === undefined) return allocPid(sys, 400);
  if (sys.procs.some(p => p.pid === spec.pid)) throw new Error(`proc ${spec.key}: PID ${spec.pid} is in use`);
  sys.nextPid = Math.max(sys.nextPid, spec.pid);
  return spec.pid;
}

function startProc(sys, spec) {
  if (sys.procs.some(p => p.key === spec.key)) return;
  const tty = spec.tty ?? '?';
  sys.procs.push(makeProc({
    ...spec, tty, pid: pidFor(sys, spec), ppid: tty === TERMINAL ? sys.shellPid : 1, ignores: signalNumbers(spec),
  }));
}

// A hard link adds a name for an existing node; only the directory it lands in changes.
function putLink(sys, path, target) {
  const node = lookup(sys.root, target, { follow: false });
  const parent = lookup(sys.root, parentOf(path));
  if (!node) throw new Error(`put ${path}: no such file to link to: ${target}`);
  if (node.type === 'dir') throw new Error(`put ${path}: a hard link to a directory is not allowed: ${target}`);
  if (parent?.type !== 'dir') throw new Error(`cannot place ${path}: ${parentOf(path)} is not a directory`);
  addChild(parent, baseName(path), node, sys.now());
}

function putNode(sys, path, spec) {
  if (spec.type === 'link') return putLink(sys, path, spec.target);
  if (depthOf(path) + heightOf(spec) - 1 > MAX_TREE_DEPTH) throw new Error(`put ${path}: the tree would grow deeper than ${MAX_TREE_DEPTH} levels`);
  insert(sys.root, path, fromSpec(spec, sys.now()));
}

function applyOp(sys, op) {
  if ((op.op === 'put' || op.op === 'remove') && touchesSystem(op.path)) {
    throw new Error(`${op.op} ${op.path}: /usr/bin and /dev belong to the backend`);
  }
  const target = op.op === 'cd' ? lookup(sys.root, op.path) : null;
  if (op.op === 'cd' && (!target || target.type !== 'dir')) throw new Error(`cd ${op.path}: not a directory`);
  if (op.op === 'put') putNode(sys, op.path, op.node);
  if (op.op === 'remove') detach(sys.root, op.path, sys.now());
  if (op.op === 'proc') startProc(sys, op.proc);
  if (op.op === 'stop') sys.procs = sys.procs.filter(p => p.key !== op.key);
  if (op.op === 'login') sys.gids = loginGids(sys);
  if (op.op === 'cd' && op.path !== sys.cwd) {
    sys.oldpwd = sys.cwd;
    sys.cwd = op.path;
  }
}

/**
 * Apply a patch in order. Afterwards, if the working directory no longer
 * exists, the shell moves to its nearest existing ancestor.
 *
 * @param {object} sys The machine state.
 * @param {object[]} patch Operations built with src/backend/spec.js.
 * @returns {void}
 * @throws {Error} If the patch is malformed, a parent is missing, a cd target
 *   is not a directory, a hard link's target is missing or a directory, a signal name is unknown, an operation touches /usr/bin
 *   or /dev, or a put would make the tree deeper than MAX_TREE_DEPTH.
 */
export function applyPatch(sys, patch) {
  validatePatch(patch).forEach(op => applyOp(sys, op));
  while (!lookup(sys.root, sys.cwd)) sys.cwd = parentOf(sys.cwd);
}
