/**
 * The simulated bash behind the backend port (src/backend/port.js).
 */

import { createSystem, resizeTerminal, numberInodes } from './system.js';
import { snapshot, lookup } from './fs.js';
import { executeLine } from './exec.js';
import { applyPatch } from './patch.js';
import { complete } from './complete.js';
import { varValue } from './vars.js';
import { groupNames, loginGids } from './accounts.js';
import { expandHistory } from './history.js';
import { COMMANDS, BINARIES } from './commands/index.js';
import { saveState, restoreState, createTape } from './snapshot.js';
import { expire, reap, notify, markOf } from './jobs.js';

const CLEAR_MARK = '\u001b[2J';

function collector(sys, events = []) {
  const run = { chunks: [], records: [], blocked: [], depth: 0, pipelines: 0, waiting: null, taken: 0, cancelled: false };
  const next = () => (run.taken < events.length ? events[run.taken++] : null);
  // A command that reads a line from the terminal gets the next answer, or
  // stops the line until the page sends one.
  run.ask = prompt => {
    const event = next();
    if (event) return { text: event.text };
    run.waiting = { prompt, at: run.chunks.length, status: sys.lastStatus };
    return { waiting: true };
  };
  // A foreground command that takes time gets what happened next (its end
  // came, or the player pressed a key), or stops the line until then.
  run.hold = (until, pid = null) => {
    const event = next();
    if (event) return event;
    run.waiting = { until, pid, at: run.chunks.length, status: sys.lastStatus };
    return { waiting: true };
  };
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
// Before the line the shell hears what its jobs did; before the next prompt
// it says what changed.
function runLine(sys, typedLine, events) {
  const run = collector(sys, events);
  expire(sys);
  reap(sys);
  const history = expandHistory(typedLine, sys.history);
  let status = sys.lastStatus;
  if (history.error) run.sink.write('err', `${history.error}\n`);
  else {
    const { line } = history;
    if (history.expanded) run.sink.write('err', `${line}\n`);
    const typed = line.trim() !== '';
    if (typed && remembered(sys, line)) sys.history.push(line);
    if (typed) status = executeLine({ sys, commands: COMMANDS, run }, line, run.sink);
  }
  const notices = run.waiting ? '' : notify(sys);
  if (notices) run.sink.write('err', notices);
  return { output: run.chunks, status, commands: run.records, blocked: run.blocked, waiting: run.waiting };
}

const SIGNALS = ['INT', 'TSTP'];
const secondsLeft = (sys, until) => (until === Infinity ? null : Math.max(0, (until - sys.now()) / 1000));

// One attempt at the pending line, from its start, with the events so far.
// Only output the page has not shown yet goes out; a line still waiting
// returns what came before it waits, and what it waits for.
function attempt(sys, pending) {
  if (pending.events.length) restoreState(sys, pending.saved);
  const r = pending.tape.play(() => runLine(sys, pending.line, pending.events));
  const shown = pending.shown;
  let reply;
  if (r.waiting) {
    pending.shown = r.waiting.at;
    pending.waiting = r.waiting;
    reply = { output: r.output.slice(shown, r.waiting.at), status: r.waiting.status, commands: [], blocked: [] };
    if (r.waiting.prompt === undefined) reply.running = { seconds: secondsLeft(sys, r.waiting.until) };
    else reply.input = { prompt: r.waiting.prompt, hidden: true };
  } else {
    reply = { output: r.output.slice(shown), status: r.status, commands: r.commands, blocked: r.blocked };
  }
  return { reply, done: !r.waiting };
}

// What logging in does: take the groups /etc/group gives the user now, then
// what bash does when it starts: read ~/.bashrc, if there is one. Its output
// is dropped, as the game shows the terminal only after the shell is ready.
function startShell(sys) {
  const run = collector(sys);
  sys.gids = loginGids(sys);
  if (lookup(sys.root, `${sys.home}/.bashrc`)) executeLine({ sys, commands: COMMANDS, run }, '. ~/.bashrc', run.sink);
}

function observe(sys) {
  expire(sys);
  const procs = sys.procs.map(p => {
    const rec = { pid: p.pid, ppid: p.ppid, user: p.user, tty: p.tty, stat: p.stat, cpu: p.cpu, mem: p.mem, cmd: p.cmd };
    if (p.key !== undefined) rec.key = p.key;
    return rec;
  });
  // A job's state is its process's: gone (done), stopped, or running, whatever bash has heard yet.
  const jobs = sys.jobs.map(job => {
    const proc = sys.procs.find(p => p.pid === job.pid);
    let state = 'done';
    if (proc) state = proc.stat.startsWith('T') ? 'stopped' : 'running';
    return { id: job.id, pid: job.pid, cmd: job.text, state, mark: markOf(sys, job) };
  });
  numberInodes(sys);
  return { user: sys.user, groups: groupNames(sys), host: sys.host, home: sys.home, cwd: sys.cwd, tree: snapshot(sys.root), procs, jobs };
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
 * A line that reads typed input (sudo's password) returns a result with
 * `input` and waits for answer(). A line whose foreground command takes time
 * (`sleep 5`, `fg`, `wait`) returns a result with `running` and goes on with
 * poll() once the clock has reached its end, or with signal() when the player
 * presses Ctrl+C or Ctrl+Z. The simulator cannot pause a command halfway, so
 * each answer, key or end runs the line again from the state saved before
 * it, with the events so far and the same clock readings and random
 * numbers, and sends only the output the page has not shown yet.
 *
 * Output chunks: 'out' and 'err' text ends in a newline like a real stream;
 * `html` (when present) is the same text coloured with the classes c-dir,
 * c-exe, c-link, c-orphan, g-file, g-sep, g-num and g-match. `clear` writes the real escape
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
  let pending = null;
  const running = () => pending !== null && pending.waiting.prompt === undefined;
  // A command still running in the foreground when its line is abandoned ends with it.
  const abandon = () => {
    if (running()) sys.procs = sys.procs.filter(p => p.pid !== pending.waiting.pid);
    pending = null;
  };
  const load = patch => {
    abandon();
    applyPatch(sys, patch);
    if (!started) startShell(sys);
    started = true;
  };
  const go = next => {
    const { reply, done } = attempt(sys, next);
    pending = done ? null : next;
    return reply;
  };
  const run = line => {
    if (pending) throw new Error(`a line is ${running() ? 'running' : 'waiting for input'}; finish it first`);
    return go({ line, events: [], shown: 0, saved: saveState(sys), tape: createTape(sys), waiting: null });
  };
  const answer = text => {
    if (!pending || running()) throw new Error('no line is waiting for input');
    pending.events.push({ text });
    return go(pending);
  };
  const signal = name => {
    if (!SIGNALS.includes(name)) throw new Error(`signal takes INT or TSTP, got ${name}`);
    if (!running()) throw new Error('no command is running in the foreground');
    pending.events.push({ key: name });
    return go(pending);
  };
  const poll = () => {
    if (!running()) throw new Error('no command is running in the foreground');
    const { until, status } = pending.waiting;
    if (sys.now() < until) return { output: [], status, commands: [], blocked: [], running: { seconds: secondsLeft(sys, until) } };
    pending.events.push({ done: true });
    return go(pending);
  };
  return {
    load: async patch => load(patch),
    run: async line => run(line),
    answer: async text => answer(text),
    signal: async name => signal(name),
    poll: async () => poll(),
    observe: async () => observe(sys),
    complete: async line => complete(sys, line, Object.keys(COMMANDS)),
    resize: async columns => resizeTerminal(sys, columns),
  };
}
