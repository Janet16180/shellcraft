import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from '../helpers.js';
import { put, dir, file, symlink } from '../../../src/backend/spec.js';
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

test('cd accepts -L, -P and --, and rejects other options like bash', async () => {
  const b = await shell();
  await run(b, 'cd -L /tmp');
  assert.equal((await b.observe()).cwd, '/tmp');
  await run(b, 'cd -- /home/hero');
  assert.equal((await b.observe()).cwd, '/home/hero');
  const bad = await run(b, 'cd -help');
  assert.deepEqual([bad.err, bad.status], ['bash: cd: -h: invalid option\ncd: usage: cd [-L|[-P [-e]] [-@]] [dir]\n', 2]);
});

test('cd -@ is an invalid option on Linux although the usage line lists it', async () => {
  const b = await shell();
  const r = await run(b, 'cd -@ /tmp');
  assert.deepEqual([r.err, r.status], ['bash: cd: -@: invalid option\ncd: usage: cd [-L|[-P [-e]] [-@]] [dir]\n', 2]);
  assert.equal((await b.observe()).cwd, '/home/hero');
});

const portals = () => shell([
  put('/home/hero/forest/cave/deep', dir({ 'key.txt': file('key\n', { owner: 'hero' }) }, { owner: 'hero' })),
  put('/home/hero/portal', symlink('/home/hero/forest/cave/deep', { owner: 'hero' })),
  put('/home/hero/near', symlink('forest/cave', { owner: 'hero' })),
  put('/home/hero/broken', symlink('nowhere', { owner: 'hero' })),
  put('/home/hero/loop', symlink('loop', { owner: 'hero' })),
]);

test('cd through a symbolic link keeps the path as typed, and .. goes back the way it came', async () => {
  const b = await portals();
  await run(b, 'cd portal');
  assert.equal((await b.observe()).cwd, '/home/hero/portal');
  assert.equal((await run(b, 'cat key.txt')).out, 'key\n');
  assert.equal((await run(b, 'echo $PWD')).out, '/home/hero/portal\n');
  await run(b, 'cd ..');
  assert.equal((await b.observe()).cwd, '/home/hero');
  await run(b, 'cd near/deep/../..');
  assert.equal((await b.observe()).cwd, '/home/hero');
});

test('cd -P goes to where the link really leads', async () => {
  const b = await portals();
  await run(b, 'cd -P portal');
  assert.equal((await b.observe()).cwd, '/home/hero/forest/cave/deep');
  assert.equal((await run(b, 'echo $PWD')).out, '/home/hero/forest/cave/deep\n');
});

test('cd into a dangling link or a loop fails like bash', async () => {
  const b = await portals();
  assert.equal((await run(b, 'cd broken')).err, 'bash: cd: broken: No such file or directory\n');
  assert.equal((await run(b, 'cd loop')).err, 'bash: cd: loop: Too many levels of symbolic links\n');
});

test('when the path as typed leads nowhere but the real one does, cd takes the real one', async () => {
  const b = await portals();
  await run(b, 'cd portal/../../cave');
  assert.equal((await b.observe()).cwd, '/home/hero/forest/cave');
});
