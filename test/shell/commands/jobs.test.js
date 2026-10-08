import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, NOW } from '../helpers.js';

// A shell whose clock the test moves.
async function timed() {
  const clock = { now: NOW };
  const b = await shell([], { now: () => clock.now });
  const tick = seconds => { clock.now += seconds * 1000; };
  return { b, tick };
}

const text = (r, stream) => r.output.filter(c => c.stream === stream).map(c => c.text).join('');
const outcome = r => [r.out, r.err, r.status];

test('sleep without a number, or with a bad one, fails as coreutils does', async () => {
  const b = await shell();
  const usage = "Try 'sleep --help' for more information.";
  assert.deepEqual(outcome(await run(b, 'sleep')), ['', `sleep: missing operand\n${usage}\n`, 1]);
  assert.deepEqual(outcome(await run(b, 'sleep x')), ['', `sleep: invalid time interval \u2018x\u2019\n${usage}\n`, 1]);
  assert.deepEqual(outcome(await run(b, 'sleep 1x 2')), ['', `sleep: invalid time interval \u20181x\u2019\n${usage}\n`, 1]);
  assert.deepEqual(outcome(await run(b, 'sleep -1')), ['', `sleep: invalid option -- '1'\n${usage}\n`, 1]);
});

test('sleep 0 ends at once', async () => {
  const b = await shell();
  const r = await b.run('sleep 0; echo done');
  assert.equal(r.running, undefined);
  assert.equal(text(r, 'out'), 'done\n');
});

test('a foreground sleep keeps the line running until the clock reaches its end', async () => {
  const { b, tick } = await timed();
  const started = await b.run('sleep 5');
  assert.deepEqual(started, { output: [], status: 0, commands: [], blocked: [], running: { seconds: 5 } });
  tick(2);
  assert.deepEqual(await b.poll(), { output: [], status: 0, commands: [], blocked: [], running: { seconds: 3 } });
  tick(3);
  const done = await b.poll();
  assert.equal(done.running, undefined);
  assert.equal(done.status, 0);
  assert.deepEqual(done.commands.map(r => [r.name, r.args, r.status]), [['sleep', ['5'], 0]]);
});

test('the rest of the line runs once the sleep is over, after what came before it', async () => {
  const { b, tick } = await timed();
  const first = await b.run('echo before; sleep 2; echo after');
  assert.deepEqual(first.output, [{ stream: 'out', text: 'before\n' }]);
  tick(2);
  const done = await b.poll();
  assert.deepEqual(done.output, [{ stream: 'out', text: 'after\n' }]);
  assert.deepEqual(done.commands.map(r => r.name), ['echo', 'sleep', 'echo']);
});

test('sleep adds up its numbers and reads s, m, h and d suffixes and fractions', async () => {
  const b = await shell();
  const seconds = async line => (await b.run(line)).running.seconds;
  assert.equal(await seconds('sleep 1 2'), 3);
  await b.signal('INT');
  assert.equal(await seconds('sleep 1.5m'), 90);
  await b.signal('INT');
  assert.equal(await seconds('sleep 2h 1d .5'), 2 * 3600 + 86400 + 0.5);
  await b.signal('INT');
});

test('sleep infinity runs until it is stopped', async () => {
  const b = await shell();
  assert.deepEqual((await b.run('sleep infinity')).running, { seconds: null });
  assert.equal((await b.signal('INT')).status, 130);
});

test('ps shows a running foreground sleep with the + of the terminal foreground', async () => {
  const b = await shell();
  await b.run('sleep 30');
  const proc = (await b.observe()).procs.find(p => p.cmd === 'sleep 30');
  assert.equal(proc.stat, 'S+');
  assert.equal(proc.tty, 'pts/0');
  await b.signal('INT');
  assert.equal((await b.observe()).procs.some(p => p.cmd === 'sleep 30'), false);
});

test('Ctrl+C ends the foreground command: ^C, status 130, and the rest of the line is dropped', async () => {
  const b = await shell();
  await b.run('sleep 100; echo after');
  const r = await b.signal('INT');
  assert.deepEqual(r.output, [{ stream: 'out', text: '^C\n' }]);
  assert.equal(r.status, 130);
  assert.deepEqual(r.commands.map(c => [c.name, c.status, c.signal]), [['sleep', 130, 'INT']]);
  assert.equal((await run(b, 'echo $?')).out, '130\n');
});

test('Ctrl+C in a loop ends the whole loop', async () => {
  const b = await shell();
  await b.run('for i in 1 2 3; do sleep 10; echo $i; done; echo end');
  const r = await b.signal('INT');
  assert.deepEqual(r.output, [{ stream: 'out', text: '^C\n' }]);
});

test('Ctrl+C in a script ends the line that ran it', async () => {
  const b = await shell();
  await run(b, "printf 'sleep 10\\necho in\\n' > nap.sh; chmod +x nap.sh");
  await b.run('./nap.sh; echo out');
  const r = await b.signal('INT');
  assert.deepEqual(r.output, [{ stream: 'out', text: '^C\n' }]);
});

test('poll and signal raise when no line runs, and run and answer raise while one does', async () => {
  const b = await shell();
  await assert.rejects(b.poll(), /no command is running/);
  await assert.rejects(b.signal('INT'), /no command is running/);
  await b.run('sleep 10');
  await assert.rejects(b.run('ls'), /running/);
  await assert.rejects(b.answer('x'), /no line is waiting for input/);
  await assert.rejects(b.signal('HUP'), /INT or TSTP/);
  await b.signal('INT');
});

test('loading a world abandons a running line and ends its command, as closing the terminal would', async () => {
  const b = await shell();
  await b.run('sleep 10');
  await b.load([]);
  assert.equal((await b.observe()).procs.some(p => p.cmd === 'sleep 10'), false);
  assert.equal((await run(b, 'echo hi')).out, 'hi\n');
});

const pidOf = r => Number(/^\[\d+\] (\d+)\n$/.exec(r.err)?.[1]);

test('a command with & starts a job: bash prints its number and PID, and the line ends at once', async () => {
  const b = await shell();
  const r = await run(b, 'sleep 30 &');
  assert.match(r.err, /^\[1\] \d+\n$/);
  assert.deepEqual([r.out, r.status, r.result.running], ['', 0, undefined]);
  const proc = (await b.observe()).procs.find(p => p.pid === pidOf(r));
  assert.deepEqual([proc.cmd, proc.stat, proc.tty, proc.user], ['sleep 30', 'S', 'pts/0', 'hero']);
});

test('$! is the PID of the last job started in the background', async () => {
  const b = await shell();
  assert.equal((await run(b, 'echo $!')).out, '\n');
  const r = await run(b, 'sleep 30 &');
  assert.equal((await run(b, 'echo $!')).out, `${pidOf(r)}\n`);
});

test('jobs lists running jobs with the current one marked + and the previous -', async () => {
  const b = await shell();
  await run(b, 'sleep 30 &');
  assert.equal((await run(b, 'jobs')).out, '[1]+  Running                 sleep 30 &\n');
  await run(b, 'sleep 60 &');
  assert.equal((await run(b, 'jobs')).out, '[1]-  Running                 sleep 30 &\n[2]+  Running                 sleep 60 &\n');
});

test('a job that finishes on the clock is reported Done after the next line, then forgotten', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 30 &');
  tick(10);
  assert.equal((await run(b, 'echo early')).err, '');
  tick(20);
  const r = await b.run('echo x');
  assert.deepEqual(r.output, [{ stream: 'out', text: 'x\n' }, { stream: 'err', text: '[1]+  Done                    sleep 30\n' }]);
  assert.deepEqual(outcome(await run(b, 'jobs')), ['', '', 0]);
  assert.equal((await b.observe()).procs.some(p => p.cmd === 'sleep 30'), false);
});

test('pressing Enter on an empty line is enough to see the Done', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 1 &');
  tick(1);
  assert.equal((await run(b, '')).err, '[1]+  Done                    sleep 1\n');
});

test('a job is not reported on the line that started it, even when it is over at once', async () => {
  const b = await shell();
  const r = await run(b, 'true &');
  assert.match(r.err, /^\[1\] \d+\n$/);
  assert.equal((await run(b, '')).err, '[1]+  Done                    true\n');
});

test('jobs reports a finished job itself, and then no notice follows', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 2 &');
  tick(3);
  assert.deepEqual(outcome(await run(b, 'jobs')), ['[1]+  Done                    sleep 2\n', '', 0]);
  assert.equal((await run(b, '')).err, '');
});

test('a job that fails is reported with its exit status', async () => {
  const b = await shell();
  await run(b, 'false &');
  assert.equal((await run(b, '')).err, '[1]+  Exit 1                  false\n');
});

test('a job runs in a subshell: cd and variables in it do not reach the shell', async () => {
  const b = await shell();
  await run(b, 'cd /tmp &');
  await run(b, 'x=1 &');
  assert.equal((await run(b, 'pwd; echo "[$x]"')).out, '/home/hero\n[]\n');
});

test('what a job prints appears at once, after the job number', async () => {
  const b = await shell();
  const r = await b.run('echo hi &');
  assert.deepEqual(r.output.map(c => c.stream), ['err', 'out']);
  assert.equal(r.output[1].text, 'hi\n');
});

test('the line goes on after &', async () => {
  const b = await shell();
  const r = await run(b, 'sleep 5 & echo now');
  assert.equal(r.out, 'now\n');
  assert.match(r.err, /^\[1\] \d+\n$/);
});

test('bash reports finished jobs after each program the line runs, not after builtins', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 1 &');
  tick(2);
  const r = await b.run('echo a; cat readme.txt; echo b');
  assert.deepEqual(r.output, [
    { stream: 'out', text: 'a\n' },
    { stream: 'out', text: 'Dear apprentice,\nwelcome.\n' },
    { stream: 'err', text: '[1]+  Done                    sleep 1\n' },
    { stream: 'out', text: 'b\n' },
  ]);
});

test('a job started in another directory says where, and the notice where you are now', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 1 &');
  await run(b, 'cd /tmp');
  assert.equal((await run(b, 'jobs')).out, '[1]+  Running                 sleep 1 &  (wd: ~)\n');
  tick(1);
  assert.equal((await run(b, '')).err, '[1]+  Done                    sleep 1  (wd: ~)\n(wd now: /tmp)\n');
});

test('jobs shows the command as typed, with pipes, && and redirections', async () => {
  const b = await shell();
  await run(b, 'sleep 3 && echo hi &');
  await run(b, 'sleep 1 | cat &');
  await run(b, 'sleep 9 >/dev/null 2>&1 &');
  assert.equal((await run(b, 'jobs')).out, [
    '[1]   Running                 sleep 3 && echo hi &\n',
    '[2]-  Running                 sleep 1 | cat &\n',
    '[3]+  Running                 sleep 9 > /dev/null 2>&1 &\n',
  ].join(''));
});

test('a job lives as long as the sleeps in it', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 3 && sleep 2 &');
  tick(4);
  assert.equal((await run(b, '')).err, '');
  tick(1);
  assert.equal((await run(b, '')).err, '[1]+  Done                    sleep 3 && sleep 2\n');
});

test('sleep infinity in the background never ends by itself', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep infinity &');
  tick(1e6);
  assert.equal((await run(b, 'jobs')).out, '[1]+  Running                 sleep infinity &\n');
});

test('the commands of a job are recorded as run in the background, with the job number', async () => {
  const b = await shell();
  await run(b, 'sleep 1 &');
  const r = await b.run('sleep 30 & echo now');
  assert.deepEqual(r.commands.map(c => [c.name, c.background, c.job]), [['sleep', true, 2], ['echo', undefined, undefined]]);
});

test('jobs -l adds the PID, -p prints only PIDs, -r and -s pick running or stopped jobs', async () => {
  const b = await shell();
  const pid = pidOf(await run(b, 'sleep 30 &'));
  assert.equal((await run(b, 'jobs -l')).out, `[1]+ ${String(pid).padStart(5)} Running                 sleep 30 &\n`);
  assert.equal((await run(b, 'jobs -p')).out, `${pid}\n`);
  assert.equal((await run(b, 'jobs -r')).out, '[1]+  Running                 sleep 30 &\n');
  assert.equal((await run(b, 'jobs -s')).out, '');
});

test('jobs with a job spec lists that job, and complains about one that does not exist', async () => {
  const b = await shell();
  await run(b, 'sleep 30 &');
  await run(b, 'sleep 60 &');
  assert.equal((await run(b, 'jobs %1')).out, '[1]-  Running                 sleep 30 &\n');
  assert.deepEqual(outcome(await run(b, 'jobs %1 %9')), ['[1]-  Running                 sleep 30 &\n', 'bash: jobs: %9: no such job\n', 1]);
  assert.deepEqual(outcome(await run(b, 'jobs %s')), ['', 'bash: jobs: s: ambiguous job spec\nbash: jobs: %s: no such job\n', 1]);
  assert.deepEqual(outcome(await run(b, 'jobs -z')), ['', 'bash: jobs: -z: invalid option\njobs: usage: jobs [-lnprs] [jobspec ...] or jobs -x command [args]\n', 2]);
});

const STOPPED_100 = '[1]+  Stopped                 sleep 100\n';

test('Ctrl+Z stops the foreground command as a job: ^Z, Stopped, status 148', async () => {
  const b = await shell();
  await b.run('sleep 100');
  const r = await b.signal('TSTP');
  assert.deepEqual(r.output, [{ stream: 'out', text: '^Z\n' }, { stream: 'err', text: STOPPED_100 }]);
  assert.equal(r.status, 148);
  assert.equal(r.running, undefined);
  assert.deepEqual(r.commands.map(c => [c.name, c.status, c.signal]), [['sleep', 148, 'TSTP']]);
  assert.equal((await run(b, 'jobs')).out, STOPPED_100);
  assert.equal((await b.observe()).procs.find(p => p.cmd === 'sleep 100').stat, 'T');
});

test('after Ctrl+Z the rest of the line runs', async () => {
  const b = await shell();
  await b.run('sleep 100; echo after');
  const r = await b.signal('TSTP');
  assert.deepEqual(r.output.map(c => c.text), ['^Z\n', STOPPED_100, 'after\n']);
  assert.equal(r.status, 0);
});

test('Ctrl+Z in a loop stops the job and leaves every loop', async () => {
  const b = await shell();
  await b.run('for i in 1 2; do sleep 100; echo i$i; done; echo end');
  const r = await b.signal('TSTP');
  assert.deepEqual(r.output.map(c => c.text), ['^Z\n', STOPPED_100, 'end\n']);
});

test('a stopped job keeps the time it still needs', async () => {
  const { b, tick } = await timed();
  await b.run('sleep 10');
  tick(4);
  await b.signal('TSTP');
  tick(100);
  assert.deepEqual((await b.run('fg')).running, { seconds: 6 });
});

test('fg brings the current job back: it prints the command, runs it to its end and forgets it', async () => {
  const { b, tick } = await timed();
  await b.run('sleep 100');
  await b.signal('TSTP');
  const started = await b.run('fg');
  assert.deepEqual(started.output, [{ stream: 'out', text: 'sleep 100\n' }]);
  assert.deepEqual(started.running, { seconds: 100 });
  assert.equal((await b.observe()).procs.find(p => p.cmd === 'sleep 100').stat, 'S+');
  tick(100);
  const done = await b.poll();
  assert.deepEqual(done.output, []);
  assert.equal(done.status, 0);
  assert.deepEqual(outcome(await run(b, 'jobs')), ['', '', 0]);
});

test('fg %N picks the job, and fg on a background job waits for it', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 30 &');
  await run(b, 'sleep 60 &');
  const r = await b.run('fg %1');
  assert.deepEqual([r.output[0].text, r.running], ['sleep 30\n', { seconds: 30 }]);
  tick(30);
  assert.equal((await b.poll()).status, 0);
  assert.equal((await run(b, 'jobs')).out, '[2]+  Running                 sleep 60 &\n');
});

test('Ctrl+C on a job in the foreground ends it, and Ctrl+Z stops it again', async () => {
  const b = await shell();
  await run(b, 'sleep 100 &');
  await run(b, 'sleep 200 &');
  await b.run('fg %1');
  const stopped = await b.signal('TSTP');
  assert.deepEqual(stopped.output.map(c => c.text), ['^Z\n', '[1]+  Stopped                 sleep 100\n']);
  assert.equal(stopped.status, 148);
  await b.run('fg');
  const ended = await b.signal('INT');
  assert.deepEqual(ended.output, [{ stream: 'out', text: '^C\n' }]);
  assert.equal(ended.status, 130);
  assert.equal((await run(b, 'jobs')).out, '[2]+  Running                 sleep 200 &\n');
});

test('fg names the directory the job started in', async () => {
  const b = await shell();
  await run(b, 'sleep 100 &');
  await run(b, 'cd /tmp');
  assert.equal((await b.run('fg')).output[0].text, 'sleep 100\t(wd: ~)\n');
  await b.signal('INT');
});

test('bg continues a stopped job in the background', async () => {
  const { b, tick } = await timed();
  await b.run('sleep 100');
  await b.signal('TSTP');
  assert.deepEqual(outcome(await run(b, 'bg')), ['[1]+ sleep 100 &\n', '', 0]);
  assert.equal((await run(b, 'jobs')).out, '[1]+  Running                 sleep 100 &\n');
  assert.equal((await b.observe()).procs.find(p => p.cmd === 'sleep 100').stat, 'S');
  tick(100);
  assert.equal((await run(b, '')).err, '[1]+  Done                    sleep 100\n');
});

test('bg with two stopped jobs: the newest stopped is current, bg %1 continues the other', async () => {
  const b = await shell();
  await b.run('sleep 100');
  await b.signal('TSTP');
  await b.run('sleep 200');
  await b.signal('TSTP');
  assert.equal((await run(b, 'jobs')).out, '[1]-  Stopped                 sleep 100\n[2]+  Stopped                 sleep 200\n');
  assert.equal((await run(b, 'bg %1')).out, '[1]- sleep 100 &\n');
  assert.equal((await run(b, 'jobs')).out, '[1]-  Running                 sleep 100 &\n[2]+  Stopped                 sleep 200\n');
});

test('fg and bg complain like bash when there is no such job', async () => {
  const { b, tick } = await timed();
  assert.deepEqual(outcome(await run(b, 'fg')), ['', 'bash: fg: current: no such job\n', 1]);
  assert.deepEqual(outcome(await run(b, 'bg')), ['', 'bash: bg: current: no such job\n', 1]);
  assert.deepEqual(outcome(await run(b, 'fg %3')), ['', 'bash: fg: %3: no such job\n', 1]);
  assert.deepEqual(outcome(await run(b, 'fg 3')), ['', 'bash: fg: 3: no such job\n', 1]);
  await run(b, 'sleep 100 &');
  assert.deepEqual(outcome(await run(b, 'bg %1')), ['', 'bash: bg: job 1 already in background\n', 0]);
  await run(b, 'sleep 1 &');
  tick(2);
  const r = await run(b, 'fg');
  assert.deepEqual(outcome(r), ['', 'bash: fg: job has terminated\n[2]+  Done                    sleep 1\n', 1]);
  await run(b, 'sleep 200 &');
  assert.deepEqual(outcome(await run(b, 'fg %s')), ['', 'bash: fg: s: ambiguous job spec\n', 1]);
  assert.deepEqual(outcome(await run(b, 'bg -x')), ['', 'bash: bg: -x: invalid option\nbg: usage: bg [job_spec ...]\n', 2]);
});

test('fg on a job killed earlier on the line reports how it ended', async () => {
  const b = await shell();
  await run(b, 'sleep 100 &');
  const r = await run(b, 'kill -9 $!; fg');
  assert.deepEqual(outcome(r), ['sleep 100\n', 'Killed\n', 137]);
});

test('kill %1 ends a running job; bash reports Terminated after the next line', async () => {
  const b = await shell();
  await run(b, 'sleep 100 &');
  assert.deepEqual(outcome(await run(b, 'kill %1')), ['', '', 0]);
  assert.equal((await b.observe()).procs.some(p => p.cmd === 'sleep 100'), false);
  assert.equal((await run(b, '')).err, '[1]+  Terminated              sleep 100\n');
});

test('kill %1 on a stopped job continues it so it can end; this line still calls it Stopped', async () => {
  const b = await shell();
  await b.run('sleep 100');
  await b.signal('TSTP');
  assert.equal((await run(b, 'kill %1')).err, `\n${STOPPED_100}`);
  assert.equal((await run(b, 'jobs')).out, '[1]+  Terminated              sleep 100\n');
});

test('kill -9 %1 reports Killed', async () => {
  const b = await shell();
  await run(b, 'sleep 100 &');
  await run(b, 'kill -9 %1');
  assert.equal((await run(b, 'echo')).err, '[1]+  Killed                  sleep 100\n');
});

test('kill -STOP %1 stops a job, reported after the next line; kill -CONT %1 lets it run on', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 100 &');
  await run(b, 'kill -STOP %1');
  assert.deepEqual((await b.run('echo a')).output, [{ stream: 'out', text: 'a\n' }, { stream: 'err', text: `\n${STOPPED_100}` }]);
  assert.match((await run(b, 'jobs -l')).out, /^\[1\]\+ +\d+ Stopped \(signal\) {8}sleep 100\n$/);
  tick(50);
  assert.deepEqual(outcome(await run(b, 'kill -CONT %1')), ['', '', 0]);
  assert.equal((await run(b, 'jobs')).out, '[1]+  Running                 sleep 100 &\n');
  tick(99);
  assert.equal((await run(b, '')).err, '');
  tick(1);
  assert.equal((await run(b, '')).err, '[1]+  Done                    sleep 100\n');
});

test('kill with a job spec that names no job, or two', async () => {
  const b = await shell();
  assert.deepEqual(outcome(await run(b, 'kill %1')), ['', 'bash: kill: %1: no such job\n', 1]);
  await run(b, 'sleep 100 &');
  await run(b, 'sleep 200 &');
  assert.deepEqual(outcome(await run(b, 'kill %0')), ['', 'bash: kill: %0: no such job\n', 1]);
  assert.deepEqual(outcome(await run(b, 'kill %s')), ['', 'bash: kill: s: ambiguous job spec\n', 1]);
  assert.deepEqual(outcome(await run(b, 'kill %- %3')), ['', 'bash: kill: %3: no such job\n', 1]);
  assert.equal((await run(b, 'jobs')).out, '[1]-  Terminated              sleep 100\n[2]+  Running                 sleep 200 &\n');
});

test('a stopped process keeps SIGTERM sent by PID until it is continued', async () => {
  const b = await shell();
  await b.run('sleep 100');
  await b.signal('TSTP');
  const pid = (await b.observe()).procs.find(p => p.cmd === 'sleep 100').pid;
  await run(b, `kill ${pid}`);
  assert.equal((await run(b, 'jobs')).out, STOPPED_100);
  await run(b, `kill -CONT ${pid}`);
  assert.equal((await run(b, '')).err, '[1]+  Terminated              sleep 100\n');
});

test('a job killed on the line is reported after the next program the line runs', async () => {
  const b = await shell();
  await run(b, 'sleep 100 &');
  const r = await b.run('kill %1; cat readme.txt; echo end');
  assert.deepEqual(r.output.map(c => c.text), ['Dear apprentice,\nwelcome.\n', '[1]+  Terminated              sleep 100\n', 'end\n']);
});

test('wait waits for every running job, and reports each as it ends', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 10 &');
  await run(b, 'sleep 20 &');
  const r = await b.run('wait; echo w$?');
  assert.deepEqual(r.running, { seconds: 20 });
  tick(20);
  const done = await b.poll();
  assert.deepEqual(done.output.map(c => c.text), ['[1]-  Done                    sleep 10\n', '[2]+  Done                    sleep 20\n', 'w0\n']);
});

test('wait %1 and wait PID return the status of that job, and report it', async () => {
  const { b, tick } = await timed();
  await run(b, 'sleep 10 &');
  assert.deepEqual((await b.run('wait %1; echo s$?')).running, { seconds: 10 });
  tick(10);
  assert.deepEqual((await b.poll()).output.map(c => c.text), ['[1]+  Done                    sleep 10\n', 's0\n']);
  await run(b, 'sleep 100 &');
  assert.deepEqual((await run(b, 'kill $!; wait $!; echo s$?')).out, 's143\n');
});

test('Ctrl+C ends wait, and the jobs go on; Ctrl+Z does nothing to it', async () => {
  const b = await shell();
  await run(b, 'sleep 100 &');
  await b.run('wait; echo after');
  assert.deepEqual((await b.signal('TSTP')).running, { seconds: 100 });
  const r = await b.signal('INT');
  assert.deepEqual([r.output, r.status], [[{ stream: 'out', text: '^C\n' }], 130]);
  assert.deepEqual(r.commands.map(c => [c.name, c.signal]), [['wait', 'INT']]);
  assert.equal((await run(b, 'jobs')).out, '[1]+  Running                 sleep 100 &\n');
});

test('wait does not wait for a stopped job, and warns about it', async () => {
  const b = await shell();
  await b.run('sleep 100');
  await b.signal('TSTP');
  const pid = (await b.observe()).procs.find(p => p.cmd === 'sleep 100').pid;
  assert.deepEqual(outcome(await run(b, 'wait')), ['', `bash: wait: warning: job 1[${pid}] stopped\n`, 0]);
});

test('wait without jobs returns at once; wait for a job or process the shell does not have fails', async () => {
  const b = await shell();
  assert.deepEqual(outcome(await run(b, 'wait')), ['', '', 0]);
  assert.deepEqual(outcome(await run(b, 'wait %9')), ['', 'bash: wait: %9: no such job\n', 127]);
  assert.deepEqual(outcome(await run(b, 'wait 123')), ['', 'bash: wait: pid 123 is not a child of this shell\n', 127]);
});

test('disown takes a job out of the table: no notice later, but the process runs on', async () => {
  const { b, tick } = await timed();
  const pid = pidOf(await run(b, 'sleep 10 &'));
  assert.deepEqual(outcome(await run(b, 'disown')), ['', '', 0]);
  assert.equal((await run(b, 'jobs')).out, '');
  assert.ok((await b.observe()).procs.some(p => p.pid === pid));
  tick(10);
  assert.equal((await run(b, '')).err, '');
});

test('disown %N, -a and -r, and a warning for a stopped job', async () => {
  const b = await shell();
  await run(b, 'sleep 100 &');
  await run(b, 'sleep 200 &');
  await b.run('sleep 300');
  await b.signal('TSTP');
  const pid = (await b.observe()).procs.find(p => p.cmd === 'sleep 300').pid;
  await run(b, 'disown %1');
  assert.equal((await run(b, 'jobs')).out, '[2]-  Running                 sleep 200 &\n[3]+  Stopped                 sleep 300\n');
  await run(b, 'disown -r');
  assert.equal((await run(b, 'jobs')).out, '[3]+  Stopped                 sleep 300\n');
  assert.deepEqual(outcome(await run(b, 'disown -a')), ['', `bash: warning: deleting stopped job 3 with process group ${pid}\n`, 0]);
  assert.deepEqual(outcome(await run(b, 'disown')), ['', 'bash: disown: current: no such job\n', 1]);
  assert.deepEqual(outcome(await run(b, 'disown %9')), ['', 'bash: disown: %9: no such job\n', 1]);
});

test('the observation lists the jobs bash has: number, PID, command, mark and the state of the process', async () => {
  const b = await shell();
  const pid = pidOf(await run(b, 'sleep 100 &'));
  await b.run('sleep 200');
  await b.signal('TSTP');
  const stopped = (await b.observe()).procs.find(p => p.cmd === 'sleep 200').pid;
  await run(b, 'true &');
  assert.equal((await run(b, 'kill %1')).err, '[3]-  Done                    true\n');
  assert.deepEqual((await b.observe()).jobs, [
    { id: 1, pid, cmd: 'sleep 100', state: 'done', mark: '-' },
    { id: 2, pid: stopped, cmd: 'sleep 200', state: 'stopped', mark: '+' },
  ]);
});
