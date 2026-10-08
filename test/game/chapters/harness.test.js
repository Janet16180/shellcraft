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
