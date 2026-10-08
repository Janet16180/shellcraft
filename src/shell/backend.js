/**
 * The simulated bash behind the backend port (src/backend/port.js).
 */

import { createSystem, resizeTerminal } from './system.js';
import { snapshot, lookup } from './fs.js';
import { executeLine } from './exec.js';
import { applyPatch } from './patch.js';
import { complete } from './complete.js';
import { varValue } from './vars.js';
import { groupNames, loginGids } from './accounts.js';
import { expandHistory } from './history.js';
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

function remembered(sys, line) {
  const control = varValue(sys, 'HISTCONTROL').split(':');
  const ignoreSpace = control.includes('ignorespace') || control.includes('ignoreboth');
  const ignoreDups = control.includes('ignoredups') || control.includes('ignoreboth');
  return !(ignoreSpace && /^\s/.test(line)) && !(ignoreDups && sys.history.at(-1) === line);
}

// History expansion comes first: a missing event stops the line before it
// is remembered or run, and $? stays as it was. An expanded line is echoed.
function runLine(sys, typedLine) {
  const run = collector();
  const history = expandHistory(typedLine, sys.history);
  if (history.error) {
    run.sink.write('err', `${history.error}\n`);
    return { output: run.chunks, status: sys.lastStatus, commands: [], blocked: [] };
  }
  const { line } = history;
  if (history.expanded) run.sink.write('err', `${line}\n`);
  const typed = line.trim() !== '';
  if (typed && remembered(sys, line)) sys.history.push(line);
  const status = typed ? executeLine({ sys, commands: COMMANDS, run }, line, run.sink) : sys.lastStatus;
  return { output: run.chunks, status, commands: run.records, blocked: run.blocked };
}

// What logging in does: take the groups /etc/group gives the user now, then
// what bash does when it starts: read ~/.bashrc, if there is one. Its output
// is dropped, as the game shows the terminal only after the shell is ready.
function startShell(sys) {
  const run = collector();
  sys.gids = loginGids(sys);
  if (lookup(sys.root, `${sys.home}/.bashrc`)) executeLine({ sys, commands: COMMANDS, run }, '. ~/.bashrc', run.sink);
}

function observe(sys) {
  const procs = sys.procs.map(p => {
    const rec = { pid: p.pid, ppid: p.ppid, user: p.user, tty: p.tty, stat: p.stat, cpu: p.cpu, mem: p.mem, cmd: p.cmd };
    if (p.key !== undefined) rec.key = p.key;
    return rec;
  });
  return { user: sys.user, groups: groupNames(sys), host: sys.host, home: sys.home, cwd: sys.cwd, tree: snapshot(sys.root), procs };
}

/**
 * Create a simulated bash. It starts with `/`, `/usr/bin` (one program per
 * simulated command), `/dev/null`, an empty home owned by the user, and the
 * system processes; the game adds its world with load().
 *
 * The first load() is when the player logs in and the shell starts: after
 * applying that patch, the shell takes the groups /etc/passwd and /etc/group
 * give the player, then reads `~/.bashrc` (if the patch made one) in the
 * current shell, as bash does, so its aliases and variables are the player's.
 * Its output is dropped and it is not recorded. Later loads change the files
 * and processes only; the shell keeps its groups (until a `login()`
 * operation), variables, aliases and history, and does not read `~/.bashrc` again.
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
  let started = false;
  const load = patch => {
    applyPatch(sys, patch);
    if (!started) startShell(sys);
    started = true;
  };
  return {
    load: async patch => load(patch),
    run: async line => runLine(sys, line),
    observe: async () => observe(sys),
    complete: async line => complete(sys, line, Object.keys(COMMANDS)),
    resize: async columns => resizeTerminal(sys, columns),
  };
}
