/**
 * Job control as interactive bash 5.2 keeps it (jobs.c): the job table, the
 * current job (+) and the previous one (-), job specs like `%1`, and the
 * status lines bash prints.
 *
 * A job is a pipeline started in the background with `&`, or a foreground
 * one the player stopped with Ctrl+Z. Its process lives in `sys.procs`. As
 * in bash, the table lags behind the processes: a process that ends or
 * stops changes its job only when the shell hears of it (`reap`), which is
 * before each line, while it waits for a foreground command, and after one.
 * What changed is printed (`notify`) after a foreground program and before
 * the next prompt. So `kill %1` alone prints nothing; the next line reports
 * `Terminated`.
 *
 * Time: a process may have `endsAt`, the clock reading (ms) when it ends by
 * itself (Infinity for never), and while stopped `left`, the time it still
 * needs. `expire` ends the processes whose time has come.
 */

import { parseSignal } from '../backend/signals.js';

/** The width bash pads a job's status to (LONGEST_SIGNAL_DESC). */
const STATUS_WIDTH = 24;
const INT = parseSignal('INT');

// strsignal(3) in glibc, as bash prints a job's end.
const DESCRIPTIONS = ['Hangup', 'Interrupt', 'Quit', 'Illegal instruction', 'Trace/breakpoint trap', 'Aborted', 'Bus error',
  'Floating point exception', 'Killed', 'User defined signal 1', 'Segmentation fault', 'User defined signal 2', 'Broken pipe',
  'Alarm clock', 'Terminated', 'Stack fault', 'Child exited', 'Continued', 'Stopped (signal)', 'Stopped', 'Stopped (tty input)',
  'Stopped (tty output)', 'Urgent I/O condition', 'CPU time limit exceeded', 'File size limit exceeded', 'Virtual timer expired',
  'Profiling timer expired', 'Window changed', 'I/O possible', 'Power failure', 'Bad system call'];
const FIRST_REALTIME = 34;

/**
 * How glibc's strsignal names a signal, the words bash prints for a job it ended or stopped.
 *
 * @param {number} sig A signal number from 1 to 64.
 * @returns {string} Like 'Terminated', 'Killed' or 'Stopped (signal)'.
 */
export function describeSignal(sig) {
  return sig >= FIRST_REALTIME ? `Real-time signal ${sig - FIRST_REALTIME}` : DESCRIPTIONS[sig - 1] ?? `Unknown signal ${sig}`;
}

const findJob = (sys, id) => sys.jobs.find(j => j.id === id) ?? null;
const inState = (sys, id, state) => findJob(sys, id)?.state === state;

// The newest job older than `below` in a state, or null.
function newest(sys, below, state) {
  return sys.jobs.filter(j => j.id < below && j.state === state).at(-1)?.id ?? null;
}

// bash's set_current_job: make id current and choose a useful previous job.
function setCurrent(sys, id) {
  const marks = sys.jobMarks;
  if (marks.current !== id) Object.assign(marks, { previous: marks.current, current: id });
  const keep = marks.previous !== marks.current && inState(sys, marks.previous, 'stopped');
  const olderStopped = inState(sys, id, 'stopped') ? newest(sys, id, 'stopped') : null;
  const running = inState(sys, id, 'running') ? newest(sys, id, 'running') : newest(sys, Infinity, 'running');
  if (!keep) marks.previous = olderStopped ?? running ?? id;
}

// bash's reset_current: the newest stopped job is current, else the newest running one.
function resetCurrent(sys) {
  const { current, previous } = sys.jobMarks;
  let candidate = inState(sys, current, 'stopped') ? current : null;
  if (candidate === null && inState(sys, previous, 'stopped')) candidate = previous;
  candidate ??= newest(sys, Infinity, 'stopped') ?? newest(sys, Infinity, 'running');
  if (candidate === null) sys.jobMarks = { current: null, previous: null };
  else setCurrent(sys, candidate);
}

/**
 * Drop the jobs whose end the player has been told about, as bash does
 * before it starts a job and after it notifies.
 *
 * @param {object} sys The machine state.
 * @returns {void}
 */
export function cleanupJobs(sys) {
  const gone = sys.jobs.filter(j => j.state === 'dead' && j.notified).map(j => j.id);
  sys.jobs = sys.jobs.filter(j => !gone.includes(j.id));
  if (gone.includes(sys.jobMarks.current) || gone.includes(sys.jobMarks.previous)) resetCurrent(sys);
}

/**
 * Enter a job in the table. Like interactive bash, it takes the number after
 * the highest one in use.
 *
 * @param {object} sys The machine state.
 * @param {{pid: number, text: string, foreground: boolean}} spec The process, the
 *   command as `jobs` shows it, and whether it runs in the foreground.
 * @returns {object} The job: `{id, pid, text, wd, state, status, stopSignal, notified, foreground}`.
 */
export function addJob(sys, { pid, text, foreground }) {
  cleanupJobs(sys);
  const id = (sys.jobs.at(-1)?.id ?? 0) + 1;
  const job = { id, pid, text, wd: sys.cwd, state: 'running', status: null, stopSignal: null, notified: false, foreground };
  sys.jobs.push(job);
  if (!foreground) resetCurrent(sys);
  return job;
}

/**
 * Take a job out of the table without ending its process (disown, or a job fg finished).
 *
 * @param {object} sys The machine state.
 * @param {object} job The job.
 * @returns {void}
 */
export function removeJob(sys, job) {
  sys.jobs = sys.jobs.filter(j => j !== job);
  if (job.id === sys.jobMarks.current || job.id === sys.jobMarks.previous) resetCurrent(sys);
}

/**
 * Make a job the current one, as fg does.
 *
 * @param {object} sys The machine state.
 * @param {object} job The job.
 * @returns {void}
 */
export const makeCurrent = (sys, job) => setCurrent(sys, job.id);

/**
 * Recompute the current and previous jobs, as bash does after bg.
 *
 * @param {object} sys The machine state.
 * @returns {void}
 */
export const refreshMarks = sys => resetCurrent(sys);

/**
 * @param {object} sys The machine state.
 * @param {object} job A job in the table.
 * @returns {'+'|'-'|' '} The mark `jobs` shows: current, previous or neither.
 */
export function markOf(sys, job) {
  let mark = ' ';
  if (job.id === sys.jobMarks.current) mark = '+';
  else if (job.id === sys.jobMarks.previous) mark = '-';
  return mark;
}

/**
 * Note how a process of the machine ended, so its job can report it.
 *
 * @param {object} sys The machine state.
 * @param {object} proc The process, already out of `sys.procs`.
 * @param {{exit?: number, signal?: number}} how Its exit status, or the signal that ended it.
 * @returns {void}
 */
export function noteExit(sys, proc, how) {
  if (sys.jobs.some(j => j.pid === proc.pid)) sys.exits.set(proc.pid, how);
}

/**
 * End the processes whose time has come on the clock, with their exit status.
 *
 * @param {object} sys The machine state.
 * @param {number} [now] The time to end them by, in ms; the clock by default.
 * @returns {void}
 */
export function expire(sys, now = sys.now()) {
  const done = sys.procs.filter(p => p.endsAt !== undefined && p.endsAt !== null && p.endsAt <= now);
  sys.procs = sys.procs.filter(p => !done.includes(p));
  for (const p of done) noteExit(sys, p, { exit: p.exitStatus ?? 0 });
}

const isStopped = proc => proc.stat.startsWith('T');

/**
 * Let the shell hear what happened to its jobs' processes (bash's waitchld):
 * a job whose process is gone is dead, one whose process stopped is stopped
 * (and becomes current), one whose process was continued runs again.
 *
 * @param {object} sys The machine state.
 * @returns {void}
 */
export function reap(sys) {
  let stopped = null;
  let changed = false;
  for (const job of sys.jobs.filter(j => j.state !== 'dead')) {
    const proc = sys.procs.find(p => p.pid === job.pid);
    if (!proc) {
      Object.assign(job, { state: 'dead', status: sys.exits.get(job.pid) ?? { exit: 0 }, notified: false });
      sys.exits.delete(job.pid);
    } else if (isStopped(proc) && job.state === 'running') {
      Object.assign(job, { state: 'stopped', stopSignal: proc.stopSignal ?? null, notified: false, foreground: false });
      stopped = job.id;
    } else if (!isStopped(proc) && job.state === 'stopped') {
      Object.assign(job, { state: 'running', notified: false });
      changed = true;
    }
  }
  if (stopped !== null) setCurrent(sys, stopped);
  else if (changed) resetCurrent(sys);
}

/**
 * The exit status a job's end gives `$?`, wait and fg: its own, or 128 plus the signal.
 *
 * @param {{exit?: number, signal?: number}} status How the job ended.
 * @returns {number} The status.
 */
export const statusCode = status => (status.signal ? 128 + status.signal : status.exit);

function statusWord(job, long) {
  let word;
  if (job.state === 'running') word = 'Running';
  else if (job.state === 'stopped') word = long && job.stopSignal ? describeSignal(job.stopSignal) : 'Stopped';
  else if (job.status.signal) word = describeSignal(job.status.signal);
  else word = job.status.exit === 0 ? 'Done' : `Exit ${job.status.exit}`;
  return word;
}

/**
 * The working directory as bash shows it in job lines, with the home as `~`.
 *
 * @param {object} sys The machine state.
 * @param {string} path An absolute path.
 * @returns {string} The path for the player to read.
 */
export function politePath(sys, path) {
  let polite = path;
  if (path === sys.home) polite = '~';
  else if (path.startsWith(`${sys.home}/`)) polite = `~${path.slice(sys.home.length)}`;
  return polite;
}

/**
 * The line `jobs` prints for a job (and the notice bash prints when it ends).
 *
 * @param {object} sys The machine state.
 * @param {object} job The job.
 * @param {{long?: boolean}} [opts] `jobs -l`: the PID too, and how it stopped.
 * @returns {string} The line with its newline: `[1]+  Running                 sleep 30 &`.
 */
export function jobLine(sys, job, { long = false } = {}) {
  const pid = long ? `${String(job.pid).padStart(5)} ` : ' ';
  const amp = job.state === 'running' && !job.foreground ? ' &' : '';
  const wd = job.wd === sys.cwd ? '' : `  (wd: ${politePath(sys, job.wd)})`;
  return `[${job.id}]${markOf(sys, job)} ${pid}${statusWord(job, long).padEnd(STATUS_WIDTH)}${job.text}${amp}${wd}\n`;
}

/**
 * What bash prints about jobs that changed since it last said so, and drop
 * the ended ones from the table: a background job that ended, a stopped one
 * (after a blank line), and a foreground job killed by a signal other than
 * SIGINT (the signal's name). Each line is followed by `(wd now: DIR)` when
 * the job started in another directory.
 *
 * @param {object} sys The machine state.
 * @returns {string} The text for standard error, often ''.
 */
export function notify(sys) {
  let text = '';
  const wdNow = job => (job.wd === sys.cwd ? '' : `(wd now: ${politePath(sys, sys.cwd)})\n`);
  for (const job of sys.jobs.filter(j => !j.notified)) {
    const fgSignal = job.state === 'dead' && job.foreground ? job.status.signal ?? null : null;
    if (fgSignal !== null && fgSignal !== INT) text += `${describeSignal(fgSignal)}\n`;
    else if (job.state === 'dead' && !job.foreground) text += jobLine(sys, job) + wdNow(job);
    else if (job.state === 'stopped') text += `\n${jobLine(sys, job)}${wdNow(job)}`;
    if (job.state !== 'running') job.notified = true;
  }
  cleanupJobs(sys);
  return text;
}

/**
 * Find the job a job spec names, as bash reads it: `%N` or `N`, `%%`, `%+`
 * or `%` (current), `%-` (previous), `%NAME` (a command starting with NAME)
 * and `%?TEXT` (a command containing TEXT, in any case).
 *
 * @param {object} sys The machine state.
 * @param {string} spec The spec as typed.
 * @returns {{job: object|null, ambiguous: string|null}} The job, or null; for a
 *   spec matching several jobs, the text bash names in its "ambiguous job spec" error.
 */
export function findJobSpec(sys, spec) {
  const word = spec.startsWith('%') ? spec.slice(1) : spec;
  let id = null;
  let ambiguous = null;
  if (/^\d+$/.test(word)) id = Number(word);
  else if (['', '%', '+'].includes(word)) id = sys.jobMarks.current;
  else if (word === '-') id = sys.jobMarks.previous;
  else {
    const name = word.startsWith('?') ? word.slice(1) : word;
    const matches = word.startsWith('?')
      ? sys.jobs.filter(j => j.text.toLowerCase().includes(name.toLowerCase()))
      : sys.jobs.filter(j => j.text.startsWith(name));
    if (matches.length > 1) ambiguous = name;
    else id = matches[0]?.id ?? null;
  }
  return { job: id === null ? null : findJob(sys, id), ambiguous };
}

/**
 * Stop a process, as SIGSTOP or SIGTSTP do: its clock pauses, keeping the
 * time it still needs, and it leaves the terminal's foreground.
 *
 * @param {object} sys The machine state.
 * @param {object} proc The process.
 * @param {number} sig The signal that stopped it.
 * @returns {void}
 */
export function stopProcess(sys, proc, sig) {
  if (proc.endsAt !== undefined && proc.endsAt !== null) Object.assign(proc, { left: proc.endsAt - sys.now(), endsAt: null });
  Object.assign(proc, { stat: `T${proc.stat.slice(1).replace('+', '')}`, stopSignal: sig });
}

/**
 * End a process with an exit status or a signal, so its job can report it.
 *
 * @param {object} sys The machine state.
 * @param {object} proc The process.
 * @param {{exit?: number, signal?: number}} how How it ended.
 * @returns {void}
 */
export function endProcess(sys, proc, how) {
  sys.procs = sys.procs.filter(p => p !== proc);
  noteExit(sys, proc, how);
}

/**
 * Continue a stopped process (SIGCONT): its clock runs again from where it
 * stopped, and a terminating signal that waited for it ends it now.
 *
 * @param {object} sys The machine state.
 * @param {object} proc The process.
 * @param {{foreground?: boolean}} [opts] Whether it gets the terminal (fg), shown as + in ps.
 * @returns {void}
 */
export function continueProcess(sys, proc, { foreground = false } = {}) {
  const rest = proc.stat.slice(1).replace('+', '');
  if (isStopped(proc)) proc.stat = `${proc.runStat}${rest}`;
  if (foreground) proc.stat = `${proc.stat[0]}${rest}+`;
  if (proc.left !== undefined && proc.left !== null) Object.assign(proc, { endsAt: sys.now() + proc.left, left: null });
  if (proc.pending) endProcess(sys, proc, { signal: proc.pending });
}
