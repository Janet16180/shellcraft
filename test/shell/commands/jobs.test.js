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
