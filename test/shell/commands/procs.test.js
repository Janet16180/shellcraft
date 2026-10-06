import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { proc } from '../../../src/backend/spec.js';

const withProcs = () => shell([
  proc({ key: 'sleeper', user: 'hero', cmd: 'sleep 9999', tty: 'pts/0' }),
  proc({ key: 'daemon', user: 'hero', cmd: './shadow_daemon --devour-cpu', cpu: 99.7, mem: 12.4, stat: 'R', ignores: ['TERM'] }),
]);
const pidOf = async (b, key) => (await b.observe()).procs.find(p => p.key === key).pid;

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

test('kill -l lists all 64 signals and translates numbers and names', async () => {
  const b = await shell();
  const table = (await run(b, 'kill -l')).out;
  assert.match(table, /^ 1\) SIGHUP\t 2\) SIGINT/);
  assert.match(table, /31\) SIGSYS\t34\) SIGRTMIN\t/);
  assert.match(table, /64\) SIGRTMAX\t\n$/);
  assert.equal((await run(b, 'kill -l 9')).out, 'KILL\n');
  assert.equal((await run(b, 'kill -l TERM')).out, '15\n');
  assert.equal((await run(b, 'kill -s')).err, 'bash: kill: -s: option requires an argument\n');
});

test('kill takes -sNAME and -nNUM as bash does', async () => {
  const b = await withProcs();
  await run(b, `kill -sKILL ${await pidOf(b, 'daemon')}`);
  assert.equal((await b.observe()).procs.some(p => p.key === 'daemon'), false);
  const bad = await run(b, `kill -sigkill ${await pidOf(b, 'sleeper')}`);
  assert.deepEqual([bad.err, bad.status], ['bash: kill: igkill: invalid signal specification\n', 1]);
});

test('pkill takes --signal and skips the values of its other options', async () => {
  const b = await withProcs();
  await run(b, 'pkill -u hero --signal KILL shadow');
  assert.equal((await b.observe()).procs.some(p => p.key === 'daemon'), false);
  assert.equal((await b.observe()).procs.some(p => p.key === 'sleeper'), true);
  const bad = await run(b, 'pkill --signal NOPE sleep');
  assert.match(bad.err, /^Unknown signal "NOPE"\.\nUsage:\n pkill \[options\] <pattern>\n/);
  assert.equal(bad.status, 2);
  const missing = await run(b, 'pkill --signal');
  assert.match(missing.err, /^pkill: option '--signal' requires an argument\n\nUsage:\n/);
});

test('killall reads -s and -NAME, and lists its signals', async () => {
  const b = await withProcs();
  await run(b, 'killall shadow_daemon -s KILL');
  assert.equal((await b.observe()).procs.some(p => p.key === 'daemon'), false);
  const bad = await run(b, 'killall -s kill sleep');
  assert.deepEqual([bad.err, bad.status], ['kill: unknown signal; killall -l lists signals.\n', 1]);
  assert.match((await run(b, 'killall -l')).out, /^HUP INT QUIT .* STKFLT\nCHLD .* POLL PWR SYS\n$/);
  const usage = await run(b, 'killall');
  assert.match(usage.err, /^Usage: killall \[OPTION\]\.\.\. \[--\] NAME\.\.\.\n {7}killall -l, --list\n/);
  assert.equal(usage.status, 1);
  assert.equal((await run(b, 'killall -kill sleep')).err, usage.err);
});

test('signals that end an interactive bash are blocked; ignored ones only get a note', async () => {
  const b = await shell();
  const pid = (await b.observe()).procs.find(p => p.key === 'shell').pid;
  assert.equal((await b.run(`kill -ILL ${pid}`)).blocked.length, 1);
  const term = await b.run(`kill -TTOU ${pid}`);
  assert.deepEqual(term.blocked, []);
  assert.match(term.output.find(c => c.stream === 'note').text, /Interactive bash ignores SIGTTOU/);
  const winch = await b.run(`kill -WINCH ${pid}`);
  assert.deepEqual([winch.blocked, winch.output], [[], []]);
});

test('kill 0 and minus the shell PID reach the shell itself', async () => {
  const b = await withProcs();
  const pid = await pidOf(b, 'shell');
  assert.equal((await b.run('kill -9 0')).blocked.length, 1);
  assert.equal((await b.run(`kill -9 -${pid}`)).blocked.length, 1);
  const term = await run(b, 'kill 0');
  assert.deepEqual([term.result.blocked, term.status], [[], 0]);
  assert.match(term.note, /Interactive bash ignores SIGTERM/);
});

test('kill -1 signals every other process of the user, which the shell survives', async () => {
  const b = await withProcs();
  const r = await b.run('kill -9 -1');
  assert.deepEqual([r.status, r.blocked], [0, []]);
  const keys = (await b.observe()).procs.map(p => p.key);
  assert.equal(keys.includes('sleeper') || keys.includes('daemon'), false);
  assert.ok(keys.includes('shell'));
  const alone = await run(b, 'kill -9 -1');
  assert.deepEqual([alone.err, alone.status], ['bash: kill: (-1) - No such process\n', 1]);
});

test('kill -N signals the process group led by N', async () => {
  const b = await withProcs();
  await run(b, `kill -9 -${await pidOf(b, 'sleeper')}`);
  assert.equal((await b.observe()).procs.some(p => p.key === 'sleeper'), false);
  const missing = await run(b, 'kill -15 -99999');
  assert.deepEqual([missing.err, missing.status], ['bash: kill: (-99999) - No such process\n', 1]);
});

test('pgrep matches an extended regular expression, a user and a terminal', async () => {
  const b = await withProcs();
  const sleeper = await pidOf(b, 'sleeper');
  const shellPid = await pidOf(b, 'shell');
  assert.equal((await run(b, "pgrep '^sl'")).out, `${sleeper}\n`);
  assert.equal((await run(b, "pgrep 'b.sh$'")).out, `${shellPid}\n`);
  assert.deepEqual(await run(b, 'pgrep -x sle').then(r => [r.out, r.status]), ['', 1]);
  assert.equal((await run(b, 'pgrep -t pts/0')).out, [shellPid, sleeper].sort((x, y) => x - y).map(p => `${p}\n`).join(''));
  assert.equal((await run(b, 'pgrep -u root -x cron')).status, 0);
});

test('pgrep and pkill complain the way procps does', async () => {
  const b = await withProcs();
  assert.equal((await run(b, 'pgrep a b')).err, "pgrep: only one pattern can be provided\nTry `pgrep --help' for more information.\n");
  assert.equal((await run(b, 'pgrep')).err, "pgrep: no matching criteria specified\nTry `pgrep --help' for more information.\n");
  assert.equal((await run(b, "pgrep '('")).err, 'pgrep: regex error: Unmatched ( or \\(\n');
  assert.equal((await run(b, 'pgrep -u nobodyzz x')).err, 'pgrep: invalid user name: nobodyzz\n');
  assert.match((await run(b, 'pgrep -k x')).err, /^pgrep: invalid option -- 'k'\n\nUsage:\n pgrep \[options\] <pattern>\n/);
  assert.match((await run(b, 'pkill -u')).err, /^pkill: option requires an argument -- 'u'\n\nUsage:\n pkill /);
  assert.equal((await run(b, 'pgrep -n sleep')).note, 'pgrep -n is a real option, but this game does not simulate it.');
});

test('pkill by pattern, user or terminal reaches the shell like the real one', async () => {
  const b = await withProcs();
  assert.equal((await b.run("pkill -HUP '^ba'")).blocked.length, 1);
  assert.equal((await b.run('pkill -9 -t pts/0')).blocked.length, 1);
  const all = await b.run('pkill -KILL -u hero');
  assert.equal(all.blocked.length, 1);
  const keys = (await b.observe()).procs.map(p => p.key);
  assert.equal(keys.includes('sleeper') || keys.includes('daemon'), false);
  assert.deepEqual((await b.run('pkill -9 -u hero cron')).blocked, []);
});

test('killall takes whole names, -u and -r', async () => {
  const b = await withProcs();
  assert.equal((await run(b, 'killall -9 sha')).err, 'sha: no process found\n');
  assert.equal((await run(b, 'killall -u nobodyzz')).err, 'Cannot find user nobodyzz\n');
  assert.equal((await run(b, 'killall -g sleep')).note, 'killall -g is a real option, but this game does not simulate it.');
  await run(b, "killall -r '^sha'");
  assert.equal((await b.observe()).procs.some(p => p.key === 'daemon'), true);
  await run(b, "killall -9 -r '^sha'");
  assert.equal((await b.observe()).procs.some(p => p.key === 'daemon'), false);
  assert.equal((await b.run('killall -9 -u hero')).blocked.length, 1);
});
