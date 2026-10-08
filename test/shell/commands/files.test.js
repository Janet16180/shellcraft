import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from '../helpers.js';
import { put, file, dir, symlink } from '../../../src/backend/spec.js';

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

test('less and more report files they cannot open in their own words', async () => {
  const b = await shell();
  await run(b, 'echo s > secret; chmod 000 secret; mkdir d');
  const less = await run(b, 'less secret');
  assert.deepEqual([less.out, less.err, less.status], ['', 'secret: Permission denied\n', 1]);
  assert.deepEqual(await run(b, 'less nope d').then(r => [r.err, r.status]), ['nope: No such file or directory\nd is a directory\n', 1]);
  const mixed = await run(b, 'less secret readme.txt');
  assert.deepEqual([mixed.out, mixed.err, mixed.status], ['Dear apprentice,\nwelcome.\n', 'secret: Permission denied\n', 0]);
  const more = await run(b, 'more secret');
  assert.deepEqual([more.err, more.status], ['more: cannot open secret: Permission denied\n', 0]);
  assert.equal((await run(b, 'more d')).out, '\n*** d: directory ***\n\n');
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

test('rm takes --recursive, --force, --verbose and --dir', async () => {
  const b = await shell();
  assert.equal((await run(b, 'rm --force nope')).status, 0);
  assert.equal((await run(b, 'rm --verbose --recursive --force forest/cave')).out, "removed 'forest/cave/bat.txt'\nremoved directory 'forest/cave'\n");
  assert.equal((await home(b)).forest.children.cave, undefined);
});

test('rm -d removes an empty directory, but not a full one', async () => {
  const b = await shell();
  await run(b, 'mkdir empty');
  const full = await run(b, 'rm -d forest');
  assert.deepEqual([full.err, full.status], ["rm: cannot remove 'forest': Directory not empty\n", 1]);
  assert.equal((await run(b, 'rm -dv empty readme.txt')).out, "removed directory 'empty'\nremoved 'readme.txt'\n");
  assert.equal((await run(b, 'mkdir e2; rm --dir e2')).status, 0);
  const h = await home(b);
  assert.deepEqual([h.empty, h['readme.txt'], h.e2, typeof h.forest], [undefined, undefined, undefined, 'object']);
});

test('rm -v reports each removal and -i notes that the game answers yes', async () => {
  const r = await run(await shell(), 'rm -iv readme.txt');
  assert.equal(r.out, "removed 'readme.txt'\n");
  assert.match(r.note, /answers yes/);
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

test('rm -r removes what it can and names each entry it cannot', async () => {
  const b = await shell([put('/srv', dir({ 'a.txt': file('x') }))]);
  const r = await run(b, 'rm -rf /srv');
  assert.deepEqual([r.err, r.status], ["rm: cannot remove '/srv/a.txt': Permission denied\n", 1]);
});

test('rm -rv reports every file and directory it removes', async () => {
  const r = await run(await shell(), 'rm -rv forest');
  assert.equal(r.out, "removed 'forest/cave/bat.txt'\nremoved directory 'forest/cave'\nremoved 'forest/mushroom.txt'\nremoved directory 'forest'\n");
});

test('mkdir -v and rmdir -v report what they do', async () => {
  const b = await shell();
  assert.equal((await run(b, 'mkdir -pv a/b')).out, "mkdir: created directory 'a'\nmkdir: created directory 'a/b'\n");
  assert.equal((await run(b, 'rmdir -v a/b')).out, "rmdir: removing directory, 'a/b'\n");
});

test('a path through a file or a locked directory gives the matching error', async () => {
  const b = await shell();
  assert.equal((await run(b, 'touch readme.txt/x')).err, "touch: cannot touch 'readme.txt/x': Not a directory\n");
  assert.equal((await run(b, 'cat /root/secret.txt')).err, 'cat: /root/secret.txt: Permission denied\n');
});

test('cat options beyond -n, and touch -c, rm -I and mkdir -m, get a note', async () => {
  const b = await shell();
  for (const [line, option] of [['cat -A readme.txt', '-A'], ['cat -E readme.txt', '-E'], ['cat -T readme.txt', '-T'], ['cat -v readme.txt', '-v'], ['cat --show-ends readme.txt', '--show-ends']]) {
    const r = await run(b, line);
    assert.deepEqual([r.out, r.status, r.note], ['', 1, `cat ${option} is a real option, but this game does not simulate it.`], line);
  }
  assert.equal((await run(b, 'touch -c nofile')).note, 'touch -c is a real option, but this game does not simulate it.');
  assert.equal((await run(b, 'ls nofile')).status, 2);
  assert.equal((await run(b, 'rm -I forest')).note, 'rm -I is a real option, but this game does not simulate it.');
  assert.equal((await run(b, 'mkdir -m 700 d')).note, 'mkdir -m is a real option, but this game does not simulate it.');
});

const linkWorld = () => shell([
  put('/home/hero/forest/cave/deep', dir({ 'key.txt': file('key\n', { owner: 'hero' }) }, { owner: 'hero' })),
  put('/home/hero/portal', symlink('/home/hero/forest/cave/deep', { owner: 'hero' })),
  put('/home/hero/letter', symlink('readme.txt', { owner: 'hero' })),
  put('/home/hero/broken', symlink('nowhere', { owner: 'hero' })),
  put('/home/hero/deeper', symlink('gone/x', { owner: 'hero' })),
  put('/home/hero/loop', symlink('loop', { owner: 'hero' })),
]);

test('cat reads through a link; a dangling link is missing and a loop too deep', async () => {
  const b = await linkWorld();
  assert.equal((await run(b, 'cat letter')).out, 'Dear apprentice,\nwelcome.\n');
  assert.equal((await run(b, 'cat portal/key.txt')).out, 'key\n');
  assert.deepEqual(await run(b, 'cat broken').then(r => [r.err, r.status]), ['cat: broken: No such file or directory\n', 1]);
  assert.equal((await run(b, 'cat loop')).err, 'cat: loop: Too many levels of symbolic links\n');
});

test('rm removes the link, never what it points at', async () => {
  const b = await linkWorld();
  assert.equal((await run(b, 'rm portal letter broken')).status, 0);
  const h = await home(b);
  assert.deepEqual([h.portal, h.letter, h.broken], [undefined, undefined, undefined]);
  assert.ok(h['readme.txt'] && h.forest.children.cave.children.deep.children['key.txt']);
});

test('rm -r of a link removes only the link; with a slash the path is the directory', async () => {
  const b = await linkWorld();
  assert.equal((await run(b, 'rm portal/')).err, "rm: cannot remove 'portal/': Is a directory\n");
  await run(b, 'rm -r portal');
  const h = await home(b);
  assert.equal(h.portal, undefined);
  assert.ok(h.forest.children.cave.children.deep.children['key.txt']);
});

test('rmdir will not remove a link, with or without a slash', async () => {
  const b = await linkWorld();
  assert.equal((await run(b, 'rmdir portal')).err, "rmdir: failed to remove 'portal': Not a directory\n");
  assert.equal((await run(b, 'rmdir portal/')).err, "rmdir: failed to remove 'portal/': Symbolic link not followed\n");
  assert.ok((await home(b)).forest.children.cave.children.deep);
});

test('mkdir on a dangling link says it exists; touch creates the file it points at', async () => {
  const b = await linkWorld();
  assert.equal((await run(b, 'mkdir broken')).err, 'mkdir: cannot create directory ‘broken’: File exists\n');
  await run(b, 'touch broken');
  assert.equal((await home(b)).nowhere.type, 'file');
  assert.equal((await home(b)).broken.type, 'symlink');
});

test('chmod changes what a link points at; chmod -R passes links by', async () => {
  const b = await linkWorld();
  await run(b, 'chmod 600 letter');
  assert.equal((await home(b))['readme.txt'].mode, 0o600);
  await run(b, 'chmod -R 700 forest');
  await run(b, 'mkdir box && ln -s ../.secret_map box/m && chmod -R 711 box');
  assert.equal((await home(b))['.secret_map'].mode, 0o644);
});

test('rm -r of a link with a slash empties the directory it leads to, then fails on the link\'s name', async () => {
  const b = await linkWorld();
  assert.deepEqual(await run(b, 'rm -r portal/').then(r => [r.err, r.status]), ["rm: cannot remove 'portal/': Not a directory\n", 1]);
  const h = await home(b);
  assert.deepEqual([h.portal.type, Object.keys(h.forest.children.cave.children.deep.children)], ['symlink', []]);
});
