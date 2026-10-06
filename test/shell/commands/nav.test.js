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

test('ls lists visible names; -a adds dot entries and -A hidden ones only', async () => {
  const b = await shell();
  assert.equal((await run(b, 'ls -1')).out, 'forest\nreadme.txt\n');
  assert.equal((await run(b, 'ls -1a')).out, '.\n..\nforest\nreadme.txt\n.secret_map\n');
  assert.equal((await run(b, 'ls -1A')).out, 'forest\nreadme.txt\n.secret_map\n');
});

test('ls -l shows mode, links, owner, group, size and time', async () => {
  const r = await run(await shell(), 'ls -l');
  assert.equal(r.out, 'total 8\ndrwxr-xr-x  3 hero hero 4096 Oct  6 10:00 forest\n-rw-r--r--  1 hero hero   26 Oct  6 10:00 readme.txt\n');
});

test('ls -F marks directories and executables; -r reverses; -d lists the directory itself', async () => {
  const b = await shell();
  assert.equal((await run(b, 'ls -1F')).out, 'forest/\nreadme.txt\n');
  assert.equal((await run(b, 'ls -1r')).out, 'readme.txt\nforest\n');
  assert.equal((await run(b, 'ls -d forest')).out, 'forest\n');
});

test('ls of several targets heads each directory and reports missing ones', async () => {
  const r = await run(await shell(), 'ls readme.txt forest nope');
  assert.equal(r.err, "ls: cannot access 'nope': No such file or directory\n");
  assert.equal(r.status, 2);
  assert.match(r.out, /^readme\.txt\n\nforest:\n/);
});

test('ls of an unreadable directory is refused', async () => {
  assert.equal((await run(await shell(), 'ls /root')).err, "ls: cannot open directory '/root': Permission denied\n");
});

test('ls output carries coloured markup for directories', async () => {
  const r = await (await shell()).run('ls');
  assert.match(r.output[0].html, /<span class="c-dir">forest<\/span>/);
});

test('nameHTML colours directories and executables and escapes names', () => {
  assert.equal(nameHTML('a<b', { type: 'file', mode: 0o644 }, false), 'a&lt;b');
  assert.equal(nameHTML('run', { type: 'file', mode: 0o755 }, true), '<span class="c-exe">run</span>*');
});

test('tree draws the hierarchy and counts directories and files', async () => {
  const r = await run(await shell(), 'tree forest');
  assert.equal(r.out, 'forest\n├── cave\n│   └── bat.txt\n└── mushroom.txt\n\n1 directory, 2 files\n');
});
