/**
 * Applying world patches (src/backend/spec.js) to the simulated machine.
 */

import { validatePatch } from '../backend/spec.js';
import { lookup, fromSpec, insert, detach, parentOf } from './fs.js';
import { allocPid, makeProc, TERMINAL } from './system.js';
import { SIGNALS } from './commands/procs.js';

const SYSTEM_PATHS = ['/usr/bin', '/dev/null'];

function touchesSystem(path) {
  return SYSTEM_PATHS.some(sp => path === '/' || sp === path || sp.startsWith(`${path}/`) || path.startsWith(`${sp}/`));
}

function signalNumbers(spec) {
  return (spec.ignores ?? []).map(name => {
    if (!(name in SIGNALS)) throw new Error(`proc ${spec.key}: unknown signal ${name}`);
    return SIGNALS[name];
  });
}

function startProc(sys, spec) {
  if (sys.procs.some(p => p.key === spec.key)) return;
  const tty = spec.tty ?? '?';
  sys.procs.push(makeProc({
    ...spec, tty, pid: allocPid(sys, 400), ppid: tty === TERMINAL ? sys.shellPid : 1, ignores: signalNumbers(spec),
  }));
}

function applyOp(sys, op) {
  if ((op.op === 'put' || op.op === 'remove') && touchesSystem(op.path)) {
    throw new Error(`${op.op} ${op.path}: /usr/bin and /dev belong to the backend`);
  }
  const target = op.op === 'cd' ? lookup(sys.root, op.path) : null;
  if (op.op === 'cd' && (!target || target.type !== 'dir')) throw new Error(`cd ${op.path}: not a directory`);
  if (op.op === 'put') insert(sys.root, op.path, fromSpec(op.node, sys.now()));
  if (op.op === 'remove') detach(sys.root, op.path, sys.now());
  if (op.op === 'proc') startProc(sys, op.proc);
  if (op.op === 'stop') sys.procs = sys.procs.filter(p => p.key !== op.key);
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
 *   is not a directory, a signal name is unknown, or an operation touches /usr/bin or /dev.
 */
export function applyPatch(sys, patch) {
  validatePatch(patch).forEach(op => applyOp(sys, op));
  while (!lookup(sys.root, sys.cwd)) sys.cwd = parentOf(sys.cwd);
}
