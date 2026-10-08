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
import { findJobSpec, jobLine } from '../jobs.js';

const SLEEP_HELP = "Try 'sleep --help' for more information.";
const UNITS = { s: 1, m: 60, h: 3600, d: 86400 };
// strtod's forms that coreutils accepts, with an optional unit.
const INTERVAL = /^\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|(inf(?:inity)?))([smhd]?)$/i;
const INTERRUPTED = 130;

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

/**
 * Wait for a process the shell runs in the foreground, as bash's wait_for:
 * until it ends on the clock, or until the player presses a key. Ctrl+C
 * ends it and the whole line.
 *
 * @param {object} ctx The command context.
 * @param {object} proc The process, in `sys.procs`, with `endsAt`.
 * @returns {{waiting?: boolean, status: number, key?: string, abort?: boolean}} The outcome:
 *   `waiting` while the line waits, else its status and the key that ended it, if any.
 */
export function foreground(ctx, proc) {
  const { sys } = ctx;
  const event = ctx.hold(proc.endsAt ?? Infinity, proc.pid);
  let outcome;
  if (event.waiting) outcome = { waiting: true, status: 0 };
  else if (event.key === 'INT') {
    sys.procs = sys.procs.filter(p => p !== proc);
    ctx.tty('^C\n');
    ctx.cancel();
    outcome = { status: INTERRUPTED, key: 'INT', abort: true };
  } else {
    sys.procs = sys.procs.filter(p => p !== proc);
    outcome = { status: proc.exitStatus ?? 0 };
  }
  return outcome;
}

// In a background job, a sleep holds nothing: the job's process lives longer.
function sleep(args, ctx) {
  const { sys } = ctx;
  const time = sleepTime(args);
  if (time.error) return result('', time.error, 1);
  if (ctx.background) ctx.background.ms += time.ms;
  if (time.ms === 0 || ctx.background) return result();
  const proc = makeProc({ pid: allocPid(sys), ppid: sys.shellPid, user: sys.user, cmd: ['sleep', ...args].join(' '), tty: TERMINAL, stat: 'S+' });
  sys.procs.push({ ...proc, endsAt: sys.now() + time.ms });
  const outcome = foreground(ctx, sys.procs.at(-1));
  return { ...result('', '', outcome.status), key: outcome.key, abort: outcome.abort };
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

export default { sleep, jobs };
