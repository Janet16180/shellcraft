/**
 * The simulated bash behind the backend port (src/backend/port.js).
 */

import { createSystem } from './system.js';
import { snapshot } from './fs.js';
import { executeLine } from './exec.js';
import { applyPatch } from './patch.js';
import { complete } from './complete.js';
import { COMMANDS, BINARIES } from './commands/index.js';

const CLEAR_MARK = '\u001b[2J';

function collector() {
  const run = { chunks: [], records: [], blocked: [], depth: 0, pipelines: 0 };
  run.sink = {
    write: (stream, text, html) => {
      const chunk = { stream, text };
      if (html) chunk.html = html;
      if (stream === 'out' && text.includes(CLEAR_MARK)) chunk.tone = 'clear';
      run.chunks.push(chunk);
    },
    note: text => run.chunks.push({ stream: 'note', text }),
  };
  return run;
}

function runLine(sys, line) {
  const run = collector();
  const typed = line.trim() !== '';
  if (typed) sys.history.push(line);
  const status = typed ? executeLine({ sys, commands: COMMANDS, run }, line, run.sink) : sys.lastStatus;
  return { output: run.chunks, status, commands: run.records, blocked: run.blocked };
}

function observe(sys) {
  const procs = sys.procs.map(p => {
    const rec = { pid: p.pid, ppid: p.ppid, user: p.user, tty: p.tty, stat: p.stat, cpu: p.cpu, mem: p.mem, cmd: p.cmd };
    if (p.key !== undefined) rec.key = p.key;
    return rec;
  });
  return { user: sys.user, host: sys.host, home: sys.home, cwd: sys.cwd, tree: snapshot(sys.root), procs };
}

/**
 * Create a simulated bash. It starts with `/`, `/usr/bin` (one program per
 * simulated command), `/dev/null`, an empty home owned by the user, and the
 * system processes; the game adds its world with load().
 *
 * Output chunks: 'out' and 'err' text ends in a newline like a real stream;
 * `html` (when present) is the same text coloured with the classes c-dir,
 * c-exe, g-file, g-sep, g-num and g-match. `clear` writes the real escape
 * sequence and its chunk carries `tone: 'clear'`. 'note' chunks explain where
 * the simulation differs from a real terminal.
 *
 * @param {{user?: string, host?: string, home?: string, now?: () => number, random?: () => number}} [opts]
 *   The user, host name, home directory, clock (ms since the epoch) and random source (for PIDs).
 * @returns {import('../backend/port.js').Backend} The backend.
 * @throws {Error} If home is not an absolute path below '/'.
 */
export function createSimBackend({ user = 'hero', host = 'kernelia', home = '/home/hero', now = () => Date.now(), random = Math.random } = {}) {
  const sys = createSystem({ user, host, home, now, random, binaries: BINARIES });
  return {
    load: async patch => applyPatch(sys, patch),
    run: async line => runLine(sys, line),
    observe: async () => observe(sys),
    complete: async line => complete(sys, line, Object.keys(COMMANDS)),
  };
}
