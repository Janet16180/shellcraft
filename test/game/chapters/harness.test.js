import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startChapter, type, play, passwordOf, errors } from './harness.js';
import { put, file, login, password } from '../../../src/backend/spec.js';

const SUDOERS = put('/etc/group', file('root:x:0:\nsudo:x:27:hero\nhero:x:1000:\n'));

// A chapter in the shape the harness needs: a setup and tasks.
const crown = (setupPassword = 'dragon') => ({
  setup: () => [SUDOERS, login(), ...(setupPassword ? [password(setupPassword)] : [])],
  tasks: [{ done: ctx => ctx.ran('cat', r => r.user === 'root') }],
});

test('type answers the password prompt with the password given, and joins the parts of the line', async () => {
  const backend = await startChapter(crown());
  const { result, ctx } = await type(backend, 'echo a; sudo cat /etc/hostname', { password: 'dragon' });
  assert.equal(result.input, undefined);
  assert.equal(result.status, 0);
  assert.deepEqual(result.output.map(c => c.text), ['a\n', '[sudo] password for hero: \n', 'kernelia\n']);
  assert.ok(ctx.ran('cat', r => r.user === 'root'));
});

test('type answers wrong tries in order, null is Ctrl+C, and a prompt left unanswered raises', async () => {
  const backend = await startChapter(crown());
  const { result } = await type(backend, 'sudo whoami', { password: ['nope', null] });
  assert.equal(errors(result), 'sudo: 1 incorrect password attempt\n');
  await assert.rejects(type(backend, 'sudo whoami'), /asked for input .*\[sudo\] password for hero/);
  await assert.rejects(type(backend, 'sudo whoami', { password: 'nope' }), /asked for input/);
});

test("play answers with the password the chapter's setup sets", async () => {
  assert.equal(passwordOf(crown()), 'dragon');
  assert.equal(passwordOf(crown(null)), null);
  const backend = await startChapter(crown());
  const { done, errors: errs } = await play(crown(), backend, ['sudo cat /etc/hostname', 'sudo cat /etc/hostname']);
  assert.deepEqual([done, errs], [[true], []]);
});

const plain = { setup: () => [], tasks: [{ done: ctx => ctx.pressed('TSTP') }] };
const texts = result => result.output.map(c => c.text);

test('a line that takes time runs to its end on the test clock unless keys are pressed', async () => {
  const backend = await startChapter(plain);
  const { result, ctx } = await type(backend, 'sleep 5; echo after');
  assert.deepEqual([texts(result), result.running], [['after\n'], undefined]);
  assert.ok(ctx.ran('sleep'));
});

test('keys press Ctrl+C or Ctrl+Z while the line runs, and a number waits that many seconds first', async () => {
  const backend = await startChapter(plain);
  const stopped = await type(backend, 'sleep 100', { keys: ['ctrl-z'] });
  assert.deepEqual(texts(stopped.result), ['^Z\n', '[1]+  Stopped                 sleep 100\n']);
  assert.ok(stopped.ctx.pressed('TSTP', 'sleep'));
  assert.equal(stopped.ctx.job(1).state, 'stopped');
  const ended = await type(backend, 'fg', { keys: [30, 'ctrl-c'] });
  assert.deepEqual([texts(ended.result), ended.result.status], [['sleep 100\n', '^C\n'], 130]);
});

test('backend.tick moves the test clock, so background jobs end', async () => {
  const backend = await startChapter(plain);
  await type(backend, 'sleep 30 &');
  await backend.tick(30);
  const { result, ctx } = await type(backend, 'echo x');
  assert.deepEqual(texts(result), ['x\n', '[1]+  Done                    sleep 30\n']);
  assert.ok(ctx.ended(1));
});

test('a line that never ends by itself needs a key, and keys the line did not use are a test bug', async () => {
  const backend = await startChapter(plain);
  await assert.rejects(type(backend, 'sleep infinity'), /kept running/);
  await assert.rejects(type(backend, 'echo hi', { keys: ['ctrl-c'] }), /did not use/);
  assert.deepEqual(texts((await type(backend, 'echo ok')).result), ['ok\n']);
});

test('play presses the Ctrl+C and Ctrl+Z written at the end of a solve line', async () => {
  const backend = await startChapter(plain);
  const { done, errors: errs } = await play(plain, backend, ['sleep 100\u001a', 'fg\u0003']);
  assert.deepEqual([done, errs], [[true], []]);
});

test('type judges a line against the observation after the line before, as the session does', async () => {
  const backend = await startChapter(plain);
  await type(backend, 'sleep 5 &');
  await backend.tick(10);
  const { result, ctx } = await type(backend, '');
  assert.deepEqual(texts(result), ['[1]+  Done                    sleep 5\n']);
  assert.equal(ctx.before.jobs[0].state, 'running');
  assert.ok(ctx.ended(1));
});

test('a load between lines refreshes the observation the next line starts from', async () => {
  const backend = await startChapter(plain);
  await type(backend, 'pwd');
  await backend.load([put('/home/hero/new.txt', file('x\n', { owner: 'hero' }))]);
  const { ctx } = await type(backend, 'cat new.txt');
  assert.equal(ctx.before.tree.children.home.children.hero.children['new.txt'].type, 'file');
});

test('the check context sees the line after history expansion, and the keys as typed', { todo: 'ctx.line becomes the expanded line once memory.js reads the keys from ctx.typed' }, async () => {
  const backend = await startChapter(plain);
  await type(backend, 'echo hi');
  const { ctx } = await type(backend, '!!');
  assert.deepEqual([ctx.line, ctx.typed], ['echo hi', '!!']);
});
