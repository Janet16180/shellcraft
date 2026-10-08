/**
 * Commands that take time and job control: sleep, jobs, fg, bg, wait and
 * disown. See src/shell/jobs.js for the job table.
 *
 * A foreground command that takes time holds the line (`ctx.hold`) until
 * the clock reaches its end or the player presses Ctrl+C (SIGINT) or
 * Ctrl+Z (SIGTSTP). The terminal echoes the key as `^C` or `^Z`.
 */

import { allocPid, makeProc, TERMINAL } from '../system.js';
import { result, withNote } from '../result.js';
import { builtinOptions } from '../builtins.js';
import { parseSignal } from '../../backend/signals.js';
import { findJobSpec, jobLine, addJob, removeJob, reap, notify, expire, markOf, makeCurrent, refreshMarks, politePath, statusCode,
  stopProcess, continueProcess, endProcess } from '../jobs.js';

const SLEEP_HELP = "Try 'sleep --help' for more information.";
const UNITS = { s: 1, m: 60, h: 3600, d: 86400 };
// strtod's forms that coreutils accepts, with an optional unit.
const INTERVAL = /^\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|(inf(?:inity)?))([smhd]?)$/i;
const INT = parseSignal('INT');
const TSTP = parseSignal('TSTP');
const NO_JOB_CONTROL = name => result('', `bash: ${name}: no job control`, 1);

function seconds(word) {
  const m = INTERVAL.exec(word);
  let value = null;
  if (m && m[2]) value = Infinity;
  else if (m) value = Number(m[1]) * UNITS[m[3] || 's'];
  return value;
}

// sleep's operands, summed in milliseconds, or the complaint coreutils makes.
function sleepTime(args) {
  const words = args[0] === '--' ? args.slice(1) : args;
  const option = args[0] !== '--' ? args.find(a => /^-./.test(a) && seconds(a) === null) : undefined;
  const bad = words.find(w => seconds(w) === null);
  let error = null;
  if (option !== undefined) error = option.startsWith('--') ? `sleep: unrecognized option '${option}'` : `sleep: invalid option -- '${option[1]}'`;
  else if (!words.length) error = 'sleep: missing operand';
  else if (bad !== undefined) error = `sleep: invalid time interval \u2018${bad}\u2019`;
  const total = words.reduce((sum, w) => sum + (seconds(w) ?? 0), 0);
  return error ? { error: `${error}\n${SLEEP_HELP}` } : { ms: total * 1000 };
}

// What bash says after it waited for a foreground job: the jobs that ended
// meanwhile (by `at`, the clock by default) and what else changed. The ^Z the
// terminal echoes ends its line where bash's notice starts with a newline.
function report(ctx, { stopped = false, at = ctx.sys.now() } = {}) {
  const { sys } = ctx;
  expire(sys, at);
  if (!sys.flags.includes('i')) return;
  reap(sys);
  const text = notify(sys);
  if (stopped) ctx.tty(text.startsWith('\n') ? '^Z\n' : '^Z');
  if (text) ctx.notice(stopped ? text.replace(/^\n/, '') : text);
}

// Ctrl+Z: the process stops and becomes a job (if it was not one), and loops are left.
function suspend(ctx, proc) {
  const { sys } = ctx;
  if (!sys.jobs.some(j => j.pid === proc.pid)) addJob(sys, { pid: proc.pid, text: ctx.jobText, foreground: true });
  stopProcess(sys, proc, TSTP);
  if (ctx.loops > 0) ctx.jump('break', ctx.loops);
}

/**
 * Wait for a process the shell runs in the foreground, as bash's wait_for:
 * until it ends on the clock, or until the player presses a key. Ctrl+C
 * ends it and the rest of the line; Ctrl+Z stops it as a job. Then bash
 * says what changed among its jobs.
 *
 * @param {object} ctx The command context.
 * @param {object} proc The process, in `sys.procs`, with `endsAt`.
 * @returns {{waiting?: boolean, status: number, key?: string, abort?: boolean}} The outcome:
 *   `waiting` while the line waits, else its status and the key that ended it, if any.
 */
export function foreground(ctx, proc) {
  const { sys } = ctx;
  const event = ctx.hold(proc.endsAt ?? Infinity, proc.pid);
  if (event.waiting) return { waiting: true, status: 0 };
  let outcome;
  if (event.key === 'INT') {
    endProcess(sys, proc, { signal: INT });
    ctx.tty('^C\n');
    ctx.cancel();
    outcome = { status: statusCode({ signal: INT }), key: 'INT', abort: true };
  } else if (event.key === 'TSTP') {
    suspend(ctx, proc);
    outcome = { status: statusCode({ signal: TSTP }), key: 'TSTP' };
  } else {
    endProcess(sys, proc, { exit: proc.exitStatus ?? 0 });
    outcome = { status: proc.exitStatus ?? 0 };
  }
  report(ctx, { stopped: event.key === 'TSTP' });
  return outcome;
}

const keyed = (r, outcome) => ({ ...r, status: outcome.status, key: outcome.key, abort: outcome.abort });

// In a background job, a sleep holds nothing: the job's process lives longer.
function sleep(args, ctx) {
  const { sys } = ctx;
  const time = sleepTime(args);
  if (time.error) return result('', time.error, 1);
  if (ctx.background) ctx.background.ms += time.ms;
  if (time.ms === 0 || ctx.background) return result();
  const proc = makeProc({ pid: allocPid(sys), ppid: sys.shellPid, user: sys.user, cmd: ['sleep', ...args].join(' '), tty: TERMINAL, stat: 'S+' });
  sys.procs.push({ ...proc, endsAt: sys.now() + time.ms });
  return keyed(result(), foreground(ctx, sys.procs.at(-1)));
}

/**
 * The jobs a builtin's job specs name, with bash's complaints about the others.
 *
 * @param {object} sys The machine state.
 * @param {string} name The builtin, for its messages.
 * @param {string[]} specs The specs as typed.
 * @param {{bothErrors?: boolean}} [opts] Also say "no such job" after "ambiguous job spec", as jobs and disown do.
 * @returns {{jobs: object[], errors: string[]}} The jobs found, in the order named, and the error lines.
 */
export function namedJobs(sys, name, specs, { bothErrors = false } = {}) {
  const jobs = [];
  const errors = [];
  for (const spec of specs) {
    const { job, ambiguous } = findJobSpec(sys, spec);
    if (job) jobs.push(job);
    if (ambiguous !== null) errors.push(`bash: ${name}: ${ambiguous}: ambiguous job spec`);
    if (!job && (ambiguous === null || bothErrors)) errors.push(`bash: ${name}: ${spec}: no such job`);
  }
  return { jobs, errors };
}

const JOB_FILTERS = { r: job => job.state === 'running', s: job => job.state === 'stopped', n: job => !job.notified };

function jobs(args, { sys }) {
  const opts = builtinOptions('jobs', args, 'lnprsx');
  if (opts.error) return result('', opts.error, 2);
  if (opts.flags.has('x')) return withNote(result('', '', 1), 'jobs -x runs a command with job specs replaced by PIDs; the game does not simulate it.');
  const named = opts.rest.length ? namedJobs(sys, 'jobs', opts.rest, { bothErrors: true }) : { jobs: sys.jobs, errors: [] };
  const shown = named.jobs.filter(job => Object.keys(JOB_FILTERS).every(f => !opts.flags.has(f) || JOB_FILTERS[f](job)));
  const out = shown.map(job => (opts.flags.has('p') ? `${job.pid}\n` : jobLine(sys, job, { long: opts.flags.has('l') }))).join('');
  for (const job of shown) job.notified = true;
  return result(out, named.errors.join('\n'), named.errors.length ? 1 : 0);
}

const wdNote = (sys, job) => (job.wd === sys.cwd ? '' : `\t(wd: ${politePath(sys, job.wd)})`);

// The job a fg or bg spec names (the current job without one), or bash's complaint.
function pickJob(sys, name, spec) {
  const found = spec === undefined ? { job: sys.jobs.find(j => j.id === sys.jobMarks.current) ?? null, ambiguous: null } : findJobSpec(sys, spec);
  let error = null;
  if (found.ambiguous !== null) error = `bash: ${name}: ${found.ambiguous}: ambiguous job spec`;
  else if (!found.job) error = `bash: ${name}: ${spec ?? 'current'}: no such job`;
  else if (found.job.state === 'dead') error = `bash: ${name}: job has terminated`;
  return { job: found.job, error };
}

function fg(args, ctx) {
  const { sys } = ctx;
  const opts = builtinOptions('fg', args, '');
  if (opts.error) return result('', opts.error, 2);
  if (ctx.background || !sys.flags.includes('i')) return NO_JOB_CONTROL('fg');
  const { job, error } = pickJob(sys, 'fg', opts.rest[0]);
  if (error) return result('', error, 1);
  const proc = sys.procs.find(p => p.pid === job.pid);
  makeCurrent(sys, job);
  ctx.tty(`${job.text}${wdNote(sys, job)}\n`);
  Object.assign(job, { foreground: true, state: 'running', notified: true });
  if (!proc) report(ctx);
  if (!proc) return result('', '', statusCode(job.status));
  continueProcess(sys, proc, { foreground: true });
  return keyed(result(), foreground(ctx, proc));
}

function bgOne(sys, job, out) {
  const mark = markOf(sys, job);
  out.push(`[${job.id}]${mark === ' ' ? ' ' : `${mark} `}${job.text} &${wdNote(sys, job)}\n`);
  Object.assign(job, { foreground: false, state: 'running', notified: true });
  const proc = sys.procs.find(p => p.pid === job.pid);
  if (proc) continueProcess(sys, proc);
  refreshMarks(sys);
}

function bg(args, { sys, background }) {
  const opts = builtinOptions('bg', args, '');
  if (opts.error) return result('', opts.error, 2);
  if (background || !sys.flags.includes('i')) return NO_JOB_CONTROL('bg');
  const out = [];
  const errors = [];
  let status = 0;
  for (const spec of opts.rest.length ? opts.rest : [undefined]) {
    const { job, error } = pickJob(sys, 'bg', spec);
    if (error) status = 1;
    if (error) errors.push(error);
    else if (job.state === 'running') errors.push(`bash: bg: job ${job.id} already in background`);
    else bgOne(sys, job, out);
  }
  return result(out.join(''), errors.join('\n'), status);
}

const procOf = (sys, job) => sys.procs.find(p => p.pid === job.pid) ?? null;
const endOf = proc => proc?.endsAt ?? (proc ? Infinity : -Infinity);

// Hold the line until `until`. The shell ignores Ctrl+Z while it waits, and
// Ctrl+C ends the wait and the line, not the jobs.
function waitUntil(ctx, until) {
  let event = ctx.hold(until);
  while (event.key === 'TSTP') event = ctx.hold(until);
  if (event.key === 'INT') {
    ctx.tty('^C\n');
    ctx.cancel();
  }
  return event;
}

const interrupted = event => (event.waiting ? { status: 0 } : { status: statusCode({ signal: INT }), key: 'INT', abort: true });

// wait with no operand, as wait_for_background_pids: each time it waits for
// the first running job and then reports what ended by then; it warns about
// the stopped jobs before that one each time.
function waitAll(ctx) {
  const { sys } = ctx;
  const order = sys.jobs.filter(j => j.state === 'running');
  const stoppedBefore = id => sys.jobs.filter(j => j.state === 'stopped' && j.id < id);
  const warn = jobs => jobs.forEach(j => ctx.notice(`bash: wait: warning: job ${j.id}[${j.pid}] stopped\n`));
  const until = Math.max(-Infinity, ...order.map(j => endOf(procOf(sys, j))));
  if (order.length) warn(stoppedBefore(order[0].id));
  const event = order.length && until > sys.now() ? waitUntil(ctx, until) : { done: true };
  if (!event.done) return interrupted(event);
  for (const [i, job] of order.entries()) {
    if (i > 0 && job.state === 'running') warn(stoppedBefore(job.id));
    if (job.state !== 'running') continue;
    report(ctx, { at: Math.min(endOf(procOf(sys, job)), sys.now()) });
  }
  warn(sys.jobs.filter(j => j.state === 'stopped'));
  return { status: 0 };
}

// The job a wait operand names: a job spec, or the PID of one.
function waitTarget(sys, word) {
  let found = { job: null, error: `bash: wait: \`${word}': not a pid or valid job spec`, status: 2 };
  if (word.startsWith('%')) {
    const { job, ambiguous } = findJobSpec(sys, word);
    found = { job, error: ambiguous !== null ? `bash: wait: ${ambiguous}: ambiguous job spec` : `bash: wait: ${word}: no such job`, status: 127 };
  } else if (/^\d+$/.test(word)) {
    found = { job: sys.jobs.find(j => j.pid === Number(word)) ?? null, error: `bash: wait: pid ${word} is not a child of this shell`, status: 127 };
  }
  return found;
}

function waitOne(ctx, job) {
  const { sys } = ctx;
  const proc = procOf(sys, job);
  const event = proc && endOf(proc) > sys.now() ? waitUntil(ctx, endOf(proc)) : { done: true };
  if (!event.done) return interrupted(event);
  report(ctx);
  return { status: job.status ? statusCode(job.status) : 0 };
}

function wait(args, ctx) {
  const { sys } = ctx;
  const opts = builtinOptions('wait', args, 'fnp');
  if (opts.error) return result('', opts.error, 2);
  if (opts.flags.size) return withNote(result('', '', 1), 'wait -n, -f and -p are not simulated: wait with no option waits for every job.');
  if (ctx.background) return result();
  if (!opts.rest.length) return keyed(result(), waitAll(ctx));
  let outcome = { status: 0 };
  for (const word of opts.rest) {
    const { job, error, status } = waitTarget(sys, word);
    if (!job) ctx.notice(`${error}\n`);
    outcome = job ? waitOne(ctx, job) : { status };
    if (outcome.waiting || outcome.key) break;
  }
  return keyed(result(), outcome);
}

// disown reads a number as a PID, anything else as a job spec.
function disownTargets(sys, words) {
  const named = { jobs: [], errors: [] };
  for (const word of words) {
    const byPid = /^\d+$/.test(word) ? sys.jobs.find(j => j.pid === Number(word)) : undefined;
    const one = /^\d+$/.test(word) ? { jobs: byPid ? [byPid] : [], errors: byPid ? [] : [`bash: disown: ${word}: no such job`] }
      : namedJobs(sys, 'disown', [word], { bothErrors: true });
    named.jobs.push(...one.jobs);
    named.errors.push(...one.errors);
  }
  return named;
}

function disown(args, { sys }) {
  const opts = builtinOptions('disown', args, 'ahr');
  if (opts.error) return result('', opts.error, 2);
  const all = opts.flags.has('a') || (opts.flags.has('r') && !opts.rest.length);
  let named = { jobs: [], errors: [] };
  if (all) named.jobs = sys.jobs.filter(job => !opts.flags.has('r') || job.state === 'running');
  else if (opts.rest.length) named = disownTargets(sys, opts.rest);
  else named = { jobs: sys.jobs.filter(j => j.id === sys.jobMarks.current), errors: sys.jobMarks.current === null ? ['bash: disown: current: no such job'] : [] };
  const warnings = [];
  for (const job of named.jobs) {
    if (opts.flags.has('h')) job.nohup = true;
    else {
      if (job.state === 'stopped') warnings.push(`bash: warning: deleting stopped job ${job.id} with process group ${job.pid}`);
      removeJob(sys, job);
    }
  }
  return result('', [...warnings, ...named.errors].join('\n'), named.errors.length ? 1 : 0);
}

export default { sleep, jobs, fg, bg, wait, disown };
