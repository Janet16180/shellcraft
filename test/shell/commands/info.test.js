import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { formatDate } from '../../../src/shell/commands/info.js';

test('whoami, id, groups and hostname describe the user and machine', async () => {
  const b = await shell();
  assert.equal((await run(b, 'whoami')).out, 'hero\n');
  assert.equal((await run(b, 'id')).out, 'uid=1000(hero) gid=1000(hero) groups=1000(hero)\n');
  assert.equal((await run(b, 'groups')).out, 'hero\n');
  assert.equal((await run(b, 'hostname')).out, 'kernelia\n');
});

test('pwd prints the working directory', async () => {
  const b = await shell();
  await run(b, 'cd forest');
  assert.equal((await run(b, 'pwd')).out, '/home/hero/forest\n');
});

test('date prints the clock in UTC like the C locale', async () => {
  assert.equal(formatDate(Date.UTC(2026, 9, 6, 9, 5, 3)), 'Tue Oct  6 09:05:03 UTC 2026');
  assert.equal((await run(await shell(), 'date')).out, 'Tue Oct  6 10:00:00 UTC 2026\n');
});

test('echo joins its arguments; -n drops the newline and -e reads escapes', async () => {
  const b = await shell();
  assert.equal((await run(b, 'echo a   b')).out, 'a b\n');
  assert.equal((await run(b, 'echo -n a')).out, 'a');
  assert.equal((await run(b, 'echo -e "a\\tb\\nc"')).out, 'a\tb\nc\n');
});

test('true and false only set the status', async () => {
  const b = await shell();
  assert.equal((await run(b, 'true')).status, 0);
  assert.equal((await run(b, 'false')).status, 1);
});

test('uname names the kernel', async () => {
  const b = await shell();
  assert.equal((await run(b, 'uname')).out, 'Linux\n');
  assert.match((await run(b, 'uname -a')).out, /^Linux kernelia /);
});

test('uname prints the fields asked for, in the standard order', async () => {
  const b = await shell();
  assert.equal((await run(b, 'uname -n')).out, 'kernelia\n');
  assert.equal((await run(b, 'uname -sr')).out, 'Linux 6.8.0-kernelia\n');
  assert.equal((await run(b, 'uname -a')).out, 'Linux kernelia 6.8.0-kernelia #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n');
});

test('id -u, -g, -G and -n print single fields', async () => {
  const b = await shell();
  assert.equal((await run(b, 'id -u')).out, '1000\n');
  assert.equal((await run(b, 'id -un')).out, 'hero\n');
  assert.equal((await run(b, 'id -Gn')).out, 'hero\n');
});

test('whoami takes no operands', async () => {
  const r = await run(await shell(), 'whoami now');
  assert.deepEqual([r.err, r.status], ["whoami: extra operand ‘now’\nTry 'whoami --help' for more information.\n", 1]);
});

test('echo -e reads every bash escape and stops at \\c', async () => {
  const b = await shell();
  assert.equal((await run(b, "echo -e 'a\\x41\\0102\\\\b'")).out, 'aAB\\b\n');
  assert.equal((await run(b, "echo -e 'stop\\cnever'")).out, 'stop');
  assert.equal((await run(b, "echo -E 'a\\nb'")).out, 'a\\nb\n');
});
