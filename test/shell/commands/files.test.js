import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from '../helpers.js';
import { put, file } from '../../../src/backend/spec.js';

const home = async b => (await b.observe()).tree.children.home.children.hero.children;

test('cat prints files in order and -n numbers lines', async () => {
  const b = await shell();
  assert.equal((await run(b, 'cat readme.txt .secret_map')).out, 'Dear apprentice,\nwelcome.\nthe map\n');
  assert.equal((await run(b, 'cat -n readme.txt')).out, '     1\tDear apprentice,\n     2\twelcome.\n');
});

test('cat reports missing files, directories and unreadable files', async () => {
  const b = await shell();
  assert.equal((await run(b, 'cat nope')).err, 'cat: nope: No such file or directory\n');
  assert.equal((await run(b, 'cat forest')).err, 'cat: forest: Is a directory\n');
  assert.equal((await run(b, 'cat /etc/shadow')).err, 'cat: /etc/shadow: Permission denied\n');
});

test('cat with no file and no input explains instead of waiting', async () => {
  const r = await run(await shell(), 'cat');
  assert.equal(r.status, 1);
  assert.match(r.note, /Ctrl\+D/);
});

test('less and more print the file with a note about the pager', async () => {
  const r = await run(await shell(), 'less readme.txt');
  assert.equal(r.out, 'Dear apprentice,\nwelcome.\n');
  assert.match(r.note, /scrollable viewer/);
});

test('touch creates an empty file and refuses where the user cannot write', async () => {
  const b = await shell();
  await run(b, 'touch new.txt');
  assert.equal((await home(b))['new.txt'].content, '');
  assert.equal((await run(b, 'touch /etc/x')).err, "touch: cannot touch '/etc/x': Permission denied\n");
  assert.equal((await run(b, 'touch nope/x')).err, "touch: cannot touch 'nope/x': No such file or directory\n");
});

test('mkdir creates directories, -p creates parents, and errors match coreutils', async () => {
  const b = await shell();
  await run(b, 'mkdir camp');
  await run(b, 'mkdir -p a/b/c');
  const h = await home(b);
  assert.equal(h.camp.type, 'dir');
  assert.equal(h.a.children.b.children.c.mode, 0o755);
  assert.equal((await run(b, 'mkdir camp')).err, 'mkdir: cannot create directory \u2018camp\u2019: File exists\n');
  assert.equal((await run(b, 'mkdir x/y')).err, 'mkdir: cannot create directory \u2018x/y\u2019: No such file or directory\n');
  assert.equal((await run(b, 'mkdir /etc/x')).err, 'mkdir: cannot create directory \u2018/etc/x\u2019: Permission denied\n');
  assert.equal((await run(b, 'mkdir')).err, "mkdir: missing operand\nTry 'mkdir --help' for more information.\n");
});

test('rmdir removes only empty directories', async () => {
  const b = await shell();
  assert.equal((await run(b, 'rmdir forest')).err, "rmdir: failed to remove 'forest': Directory not empty\n");
  await runAll(b, ['mkdir empty', 'rmdir empty']);
  assert.equal((await home(b)).empty, undefined);
});

test('rm removes files, needs -r for directories, and -f hides missing files', async () => {
  const b = await shell();
  assert.equal((await run(b, 'rm forest')).err, "rm: cannot remove 'forest': Is a directory\n");
  assert.equal((await run(b, 'rm nope')).err, "rm: cannot remove 'nope': No such file or directory\n");
  assert.equal((await run(b, 'rm -f nope')).status, 0);
  await run(b, 'rm -r forest readme.txt');
  const h = await home(b);
  assert.equal(h.forest, undefined);
  assert.equal(h['readme.txt'], undefined);
});

test('rm refuses . and .., and files the user may not unlink', async () => {
  const b = await shell([put('/tmp/theirs', file('x'))]);
  assert.equal((await run(b, 'rm -r .')).err, "rm: refusing to remove '.' or '..' directory: skipping '.'\n");
  assert.equal((await run(b, 'rm /tmp/theirs')).err, "rm: cannot remove '/tmp/theirs': Permission denied\n");
  assert.equal((await run(b, 'rm /etc/hostname')).err, "rm: cannot remove '/etc/hostname': Permission denied\n");
});

test('rm -v reports each removal and -i notes that the game answers yes', async () => {
  const r = await run(await shell(), 'rm -iv readme.txt');
  assert.equal(r.out, "removed 'readme.txt'\n");
  assert.match(r.note, /answers yes/);
});

test('cp copies files, needs -r for directories, and the copy belongs to the user', async () => {
  const b = await shell();
  await run(b, 'cp readme.txt copy.txt');
  assert.equal((await home(b))['copy.txt'].content, 'Dear apprentice,\nwelcome.\n');
  assert.equal((await run(b, 'cp forest woods')).err, "cp: -r not specified; omitting directory 'forest'\n");
  await run(b, 'cp -r forest woods');
  assert.ok((await home(b)).woods.children.cave);
  await run(b, 'cp /etc/hostname .');
  assert.equal((await home(b)).hostname.owner, 'hero');
});

test('mv renames and moves into directories', async () => {
  const b = await shell();
  await run(b, 'mv readme.txt letter.txt');
  await run(b, 'mv letter.txt forest');
  assert.ok((await home(b)).forest.children['letter.txt']);
  assert.equal((await run(b, 'mv nope x')).err, "mv: cannot stat 'nope': No such file or directory\n");
  assert.equal((await run(b, 'mv forest forest/cave')).err, "mv: cannot move 'forest' to a subdirectory of itself, 'forest/cave/forest'\n");
});

test('chmod sets octal and symbolic modes on files the user owns', async () => {
  const b = await shell();
  await run(b, 'chmod 700 readme.txt');
  assert.equal((await home(b))['readme.txt'].mode, 0o700);
  await run(b, 'chmod go+r,u-w readme.txt');
  assert.equal((await home(b))['readme.txt'].mode, 0o544);
  assert.equal((await run(b, 'chmod 777 /etc/hostname')).err, "chmod: changing permissions of '/etc/hostname': Operation not permitted\n");
  assert.equal((await run(b, 'chmod q+z x')).err, "chmod: invalid mode: \u2018q+z\u2019\nTry 'chmod --help' for more information.\n");
});
