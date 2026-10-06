import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { proc } from '../../../src/backend/spec.js';
import { parseSignal } from '../../../src/shell/commands/procs.js';

const withProcs = () => shell([
  proc({ key: 'sleeper', user: 'hero', cmd: 'sleep 9999', tty: 'pts/0' }),
  proc({ key: 'daemon', user: 'hero', cmd: './shadow_daemon --devour-cpu', cpu: 99.7, mem: 12.4, stat: 'R', ignores: ['TERM'] }),
]);
const pidOf = async (b, key) => (await b.observe()).procs.find(p => p.key === key).pid;

test('parseSignal reads numbers and names with or without SIG', () => {
  assert.equal(parseSignal('9'), 9);
  assert.equal(parseSignal('KILL'), 9);
  assert.equal(parseSignal('sigterm'), 15);
  assert.equal(parseSignal('NOPE'), null);
});

test('ps shows the terminal processes; ps aux and ps -ef show all', async () => {
  const b = await withProcs();
  const plain = (await run(b, 'ps')).out;
  assert.match(plain, /bash\n/);
  assert.match(plain, /sleep\n/);
  assert.doesNotMatch(plain, /shadow_daemon/);
  assert.match((await run(b, 'ps aux')).out, /^USER {9}PID %CPU/);
  assert.match((await run(b, 'ps aux')).out, /99\.7 12\.4 .* \.\/shadow_daemon --devour-cpu\n/);
  assert.match((await run(b, 'ps -ef')).out, /^UID {10}PID {4}PPID/);
});

test('kill sends TERM by default and removes the process', async () => {
  const b = await withProcs();
  const r = await run(b, `kill ${await pidOf(b, 'sleeper')}`);
  assert.equal(r.status, 0);
  assert.equal((await b.observe()).procs.some(p => p.key === 'sleeper'), false);
});

test('kill reports bad PIDs, missing processes and other users\' processes', async () => {
  const b = await withProcs();
  assert.equal((await run(b, 'kill abc')).err, 'bash: kill: abc: arguments must be process or job IDs\n');
  assert.equal((await run(b, 'kill 99999')).err, 'bash: kill: (99999) - No such process\n');
  assert.equal((await run(b, 'kill 1')).err, 'bash: kill: (1) - Operation not permitted\n');
  assert.equal((await run(b, 'kill -FOO 1')).err, 'bash: kill: FOO: invalid signal specification\n');
});

test('STOP freezes a process and CONT resumes it', async () => {
  const b = await withProcs();
  const pid = await pidOf(b, 'daemon');
  await run(b, `kill -STOP ${pid}`);
  assert.equal((await b.observe()).procs.find(p => p.pid === pid).stat, 'T');
  await run(b, `kill -CONT ${pid}`);
  assert.equal((await b.observe()).procs.find(p => p.pid === pid).stat, 'R');
});

test('kill -l lists signal names', async () => {
  assert.match((await run(await shell(), 'kill -l')).out, / 9\) SIGKILL/);
});

test('pkill and killall signal by name; pgrep prints PIDs', async () => {
  const b = await withProcs();
  assert.equal((await run(b, 'pgrep sleep')).out, `${await pidOf(b, 'sleeper')}\n`);
  await run(b, 'pkill sleep');
  assert.equal((await b.observe()).procs.some(p => p.key === 'sleeper'), false);
  assert.equal((await run(b, 'killall nope')).err, 'nope: no process found\n');
  await run(b, 'killall -9 shadow_daemon');
  assert.equal((await b.observe()).procs.some(p => p.key === 'daemon'), false);
});

test('top shows one snapshot sorted by CPU, with a note', async () => {
  const r = await run(await withProcs(), 'top');
  const rows = r.out.split('\n').filter(l => /^\s+\d+ /.test(l));
  assert.match(rows[0], /shadow_daemon/);
  assert.match(r.note, /refreshes/);
});
