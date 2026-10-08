import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystem, makeProc } from '../../src/shell/system.js';
import { addJob, removeJob, reap, notify, expire, jobLine, findJobSpec, markOf, describeSignal, statusCode, noteExit, makeCurrent } from '../../src/shell/jobs.js';

function machine() {
  const clock = { now: 1000 };
  const sys = createSystem({ user: 'hero', host: 'kernelia', home: '/home/hero', now: () => clock.now, random: () => 0.5, binaries: [] });
  return { sys, clock };
}

// A background sleep: its process and its job.
function sleeper(sys, seconds, pid) {
  sys.procs.push({ ...makeProc({ pid, ppid: sys.shellPid, user: 'hero', cmd: `sleep ${seconds}`, tty: 'pts/0' }), endsAt: sys.now() + seconds * 1000 });
  return addJob(sys, { pid, text: `sleep ${seconds}`, foreground: false });
}

const stop = (sys, pid, sig = 20) => Object.assign(sys.procs.find(p => p.pid === pid), { stat: 'T', stopSignal: sig });
const kill = (sys, pid, how) => {
  const proc = sys.procs.find(p => p.pid === pid);
  sys.procs = sys.procs.filter(p => p !== proc);
  noteExit(sys, proc, how);
};

test('jobs are numbered after the highest number in use, and the newest running one is current', () => {
  const { sys } = machine();
  const one = sleeper(sys, 30, 2001);
  const two = sleeper(sys, 60, 2002);
  assert.deepEqual([one.id, two.id], [1, 2]);
  assert.equal(markOf(sys, two), '+');
  assert.equal(markOf(sys, one), '-');
});

test('a single job is both current and previous, and shows +', () => {
  const { sys } = machine();
  const one = sleeper(sys, 30, 2001);
  assert.deepEqual(sys.jobMarks, { current: 1, previous: 1 });
  assert.equal(markOf(sys, one), '+');
});

test('a stopped job stays current when new jobs start in the background', () => {
  const { sys } = machine();
  sleeper(sys, 100, 2001);
  stop(sys, 2001);
  reap(sys);
  sleeper(sys, 2, 2002);
  sleeper(sys, 200, 2003);
  assert.deepEqual(sys.jobMarks, { current: 1, previous: 3 });
});

test('a job line pads the status to 24 columns and marks a running background job with &', () => {
  const { sys } = machine();
  const job = sleeper(sys, 30, 2001);
  assert.equal(jobLine(sys, job), '[1]+  Running                 sleep 30 &\n');
  assert.equal(jobLine(sys, job, { long: true }), '[1]+  2001 Running                 sleep 30 &\n');
});

test('a job that started in another directory names it, with the home as ~', () => {
  const { sys } = machine();
  const job = sleeper(sys, 30, 2001);
  sys.cwd = '/tmp';
  assert.equal(jobLine(sys, job), '[1]+  Running                 sleep 30 &  (wd: ~)\n');
});

test('a process that ended on the clock makes its job Done when the shell reaps it, not before', () => {
  const { sys, clock } = machine();
  const job = sleeper(sys, 30, 2001);
  clock.now += 30_000;
  expire(sys);
  assert.equal(sys.procs.some(p => p.pid === 2001), false);
  assert.equal(job.state, 'running');
  reap(sys);
  assert.equal(job.state, 'dead');
  assert.equal(jobLine(sys, job), '[1]+  Done                    sleep 30\n');
});

test('notify reports a finished job once and drops it from the table', () => {
  const { sys, clock } = machine();
  sleeper(sys, 30, 2001);
  clock.now += 31_000;
  expire(sys);
  reap(sys);
  assert.equal(notify(sys), '[1]+  Done                    sleep 30\n');
  assert.deepEqual(sys.jobs, []);
  assert.equal(notify(sys), '');
});

test('notify says nothing about running jobs', () => {
  const { sys } = machine();
  sleeper(sys, 30, 2001);
  assert.equal(notify(sys), '');
  assert.equal(sys.jobs.length, 1);
});

test('a stopped job is reported after a blank line, and becomes current', () => {
  const { sys } = machine();
  sleeper(sys, 100, 2001);
  sleeper(sys, 100, 2002);
  stop(sys, 2001, 19);
  reap(sys);
  assert.equal(notify(sys), '\n[1]+  Stopped                 sleep 100\n');
});

test('jobs -l tells SIGSTOP from Ctrl+Z', () => {
  const { sys } = machine();
  const job = sleeper(sys, 100, 2001);
  stop(sys, 2001, 19);
  reap(sys);
  assert.equal(jobLine(sys, job, { long: true }), '[1]+  2001 Stopped (signal)        sleep 100\n');
  assert.equal(jobLine(sys, job), '[1]+  Stopped                 sleep 100\n');
});

test('a job killed by a signal reports the signal, one with a status reports Exit', () => {
  const { sys } = machine();
  sleeper(sys, 100, 2001);
  sleeper(sys, 100, 2002);
  sleeper(sys, 100, 2003);
  kill(sys, 2001, { signal: 15 });
  kill(sys, 2002, { signal: 9 });
  kill(sys, 2003, { exit: 3 });
  reap(sys);
  assert.equal(notify(sys), [
    '[1]   Terminated              sleep 100\n',
    '[2]-  Killed                  sleep 100\n',
    '[3]+  Exit 3                  sleep 100\n',
  ].join(''));
});

test('a job that ended in another directory is followed by the directory now', () => {
  const { sys } = machine();
  sleeper(sys, 1, 2001);
  sys.cwd = '/tmp';
  kill(sys, 2001, { exit: 0 });
  reap(sys);
  assert.equal(notify(sys), '[1]+  Done                    sleep 1  (wd: ~)\n(wd now: /tmp)\n');
});

test('a dead job not yet reported keeps its number, so the next job takes the one after', () => {
  const { sys } = machine();
  sleeper(sys, 1, 2001);
  kill(sys, 2001, { exit: 0 });
  reap(sys);
  assert.equal(sleeper(sys, 1, 2002).id, 2);
  kill(sys, 2002, { exit: 0 });
  reap(sys);
  notify(sys);
  assert.equal(sleeper(sys, 1, 2003).id, 1);
});

test('job specs: number, current, previous, prefix and substring', () => {
  const { sys } = machine();
  sleeper(sys, 100, 2001);
  sys.procs.push(makeProc({ pid: 2002, ppid: 1, user: 'hero', cmd: 'tail -f log' }));
  addJob(sys, { pid: 2002, text: 'tail -f log', foreground: false });
  const id = spec => findJobSpec(sys, spec).job?.id ?? null;
  assert.deepEqual(['%1', '1', '%%', '%+', '%', '%-', '%sl', '%?F LO', '%3', '%x'].map(id), [1, 1, 2, 2, 2, 1, 1, 2, null, null]);
});

test('a job spec that matches two jobs is ambiguous', () => {
  const { sys } = machine();
  sleeper(sys, 100, 2001);
  sleeper(sys, 200, 2002);
  assert.deepEqual(findJobSpec(sys, '%s'), { job: null, ambiguous: 's' });
  assert.deepEqual(findJobSpec(sys, '%?SLEEP'), { job: null, ambiguous: 'SLEEP' });
  assert.equal(findJobSpec(sys, '%Sl').ambiguous, null);
});

test('removing the current job makes another one current', () => {
  const { sys } = machine();
  sleeper(sys, 100, 2001);
  const two = sleeper(sys, 100, 2002);
  removeJob(sys, two);
  assert.deepEqual(sys.jobMarks, { current: 1, previous: 1 });
});

test('a job brought to the foreground and stopped again is current, the newest running one previous', () => {
  const { sys } = machine();
  const one = sleeper(sys, 100, 2001);
  sleeper(sys, 100, 2002);
  makeCurrent(sys, one);
  assert.deepEqual(sys.jobMarks, { current: 1, previous: 1 });
  stop(sys, 2001);
  reap(sys);
  assert.deepEqual(sys.jobMarks, { current: 1, previous: 2 });
});

test('signal descriptions and exit codes follow glibc and bash', () => {
  assert.deepEqual([1, 2, 9, 15, 19, 20, 35].map(describeSignal), ['Hangup', 'Interrupt', 'Killed', 'Terminated', 'Stopped (signal)', 'Stopped', 'Real-time signal 1']);
  assert.equal(statusCode({ signal: 15 }), 143);
  assert.equal(statusCode({ exit: 2 }), 2);
});
