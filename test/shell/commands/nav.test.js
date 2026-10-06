import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from '../helpers.js';
import { nameHTML } from '../../../src/shell/commands/nav.js';

test('cd moves by relative, absolute, .., ~ and no argument', async () => {
  const b = await shell();
  const cwd = async () => (await b.observe()).cwd;
  await run(b, 'cd forest/cave');
  assert.equal(await cwd(), '/home/hero/forest/cave');
  await run(b, 'cd ../..');
  assert.equal(await cwd(), '/home/hero');
  await run(b, 'cd /tmp');
  assert.equal(await cwd(), '/tmp');
  await run(b, 'cd');
  assert.equal(await cwd(), '/home/hero');
  await run(b, 'cd ~/forest');
  assert.equal(await cwd(), '/home/hero/forest');
});

test('cd - returns to the previous directory and prints it', async () => {
  const b = await shell();
  assert.equal((await run(b, 'cd -')).err, 'bash: cd: OLDPWD not set\n');
  const r = await runAll(b, ['cd /tmp', 'cd -']);
  assert.equal(r.out, '/home/hero\n');
});

test('cd reports bash errors', async () => {
  const b = await shell();
  assert.equal((await run(b, 'cd nope')).err, 'bash: cd: nope: No such file or directory\n');
  assert.equal((await run(b, 'cd readme.txt')).err, 'bash: cd: readme.txt: Not a directory\n');
  assert.equal((await run(b, 'cd /root')).err, 'bash: cd: /root: Permission denied\n');
  assert.equal((await run(b, 'cd a b')).err, 'bash: cd: too many arguments\n');
});

test('nameHTML colours directories and executables and escapes names', () => {
  assert.equal(nameHTML('a<b', { type: 'file', mode: 0o644 }, false), 'a&lt;b');
  assert.equal(nameHTML('run', { type: 'file', mode: 0o755 }, true), '<span class="c-exe">run</span>*');
});

test('tree draws the hierarchy and counts directories and files', async () => {
  const r = await run(await shell(), 'tree forest');
  assert.equal(r.out, 'forest\n├── cave\n│\u00a0\u00a0 └── bat.txt\n└── mushroom.txt\n\n2 directories, 2 files\n');
});

test('cd resolves .. in the path as typed, like bash, so it can leave a locked directory', async () => {
  const b = await shell();
  await run(b, 'cd /root/..');
  assert.equal((await b.observe()).cwd, '/');
  await run(b, 'cd /tmp');
  assert.equal((await run(b, 'cd nope/..')).err, 'bash: cd: nope/..: No such file or directory\n');
  assert.equal((await run(b, 'cd ~/readme.txt/..')).err, 'bash: cd: /home/hero/readme.txt/..: Not a directory\n');
});
