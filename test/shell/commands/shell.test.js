import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from '../helpers.js';
import { put, file } from '../../../src/backend/spec.js';

test('man prints a page with a note about the pager, and errors like man-db', async () => {
  const b = await shell();
  const r = await run(b, 'man ls');
  assert.match(r.out, /^LS\(1\)/);
  assert.match(r.note, /pager/);
  assert.deepEqual(await run(b, 'man nope').then(x => [x.err, x.status]), ['No manual entry for nope\n', 16]);
  assert.equal((await run(b, 'man')).status, 1);
});

test('which finds programs in PATH; builtins without a program are not found', async () => {
  const b = await shell();
  assert.equal((await run(b, 'which ls')).out, '/usr/bin/ls\n');
  const cd = await run(b, 'which cd');
  assert.deepEqual([cd.out, cd.status], ['', 1]);
});

test('type tells aliases, builtins and programs apart', async () => {
  const r = await run(await shell(), 'type ll cd ls nope');
  assert.equal(r.out, "ll is aliased to `ls -alF'\ncd is a shell builtin\nls is /usr/bin/ls\n");
  assert.equal(r.err, 'bash: type: nope: not found\n');
});

test('alias defines and shows aliases', async () => {
  const b = await shell();
  await run(b, "alias l='ls -1'");
  assert.equal((await run(b, 'alias l')).out, "alias l='ls -1'\n");
  assert.equal((await run(b, 'l')).out, 'forest\nreadme.txt\n');
  assert.equal((await run(b, 'alias zz')).err, 'bash: alias: zz: not found\n');
});

test('export sets variables that env and printenv show', async () => {
  const b = await shell();
  await run(b, 'export SPELL=fire');
  assert.match((await run(b, 'env')).out, /^SPELL=fire$/m);
  assert.equal((await run(b, 'printenv SPELL HOME')).out, 'fire\n/home/hero\n');
});

test('sudo refuses a user outside the sudoers file', async () => {
  const r = await run(await shell(), 'sudo ls');
  assert.equal(r.status, 1);
  assert.match(r.err, /hero is not in the sudoers file/);
});

test('editors, exit and a bare bash explain themselves with a note', async () => {
  const b = await shell();
  for (const cmd of ['nano x', 'vim x', 'exit', 'bash']) assert.notEqual((await run(b, cmd)).note, '', cmd);
});

test('bash FILE runs a script without needing the execute bit', async () => {
  const b = await shell([put('/home/hero/s.sh', file('echo hi\necho there\n', { owner: 'hero' }))]);
  assert.equal((await run(b, 'bash s.sh')).out, 'hi\nthere\n');
});

test('help lists the simulated commands without game helpers', async () => {
  const r = await run(await shell(), 'help');
  assert.match(r.out, /grep/);
  assert.doesNotMatch(r.out, /hint|quest/);
});

test('type says a program is hashed after it has run', async () => {
  const b = await shell();
  assert.equal((await run(b, 'type ls')).out, 'ls is /usr/bin/ls\n');
  await run(b, 'ls > /dev/null');
  assert.equal((await run(b, 'type ls')).out, 'ls is hashed (/usr/bin/ls)\n');
});

test('unalias removes an alias', async () => {
  const b = await shell();
  await run(b, 'unalias ll');
  assert.equal((await run(b, 'll')).status, 127);
  assert.equal((await run(b, 'unalias zz')).err, 'bash: unalias: zz: not found\n');
});

test('printenv fails with no output for an unset variable', async () => {
  const r = await run(await shell(), 'printenv NOPE');
  assert.deepEqual([r.out, r.status], ['', 1]);
});

test('history skips lines that start with a space and repeated lines, like Ubuntu', async () => {
  const r = await runAll(await shell(), ['pwd', 'pwd', ' echo secret', 'ls', 'history']);
  assert.equal(r.out, '    1  pwd\n    2  ls\n    3  history\n');
});
