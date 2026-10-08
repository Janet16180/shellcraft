import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from '../helpers.js';
import { put, dir, file, symlink } from '../../../src/backend/spec.js';

const home = async b => (await b.observe()).tree.children.home.children.hero.children;
const mine = { owner: 'hero' };
const portals = () => shell([
  put('/home/hero/forest/cave/deep', dir({ 'key.txt': file('key\n', mine) }, mine)),
  put('/home/hero/portal', symlink('/home/hero/forest/cave/deep', mine)),
  put('/home/hero/broken', symlink('nowhere', mine)),
  put('/home/hero/loop', symlink('loop', mine)),
]);

test('ln makes a second name for the same file: one inode, two links, writes show through both', async () => {
  const b = await shell();
  const r = await run(b, 'ln readme.txt copy.txt');
  assert.deepEqual([r.out, r.err, r.status], ['', '', 0]);
  let h = await home(b);
  assert.equal(h['copy.txt'].ino, h['readme.txt'].ino);
  assert.equal(h['copy.txt'].links, 2);
  await run(b, 'echo more >> copy.txt');
  assert.equal((await run(b, 'cat readme.txt')).out, 'Dear apprentice,\nwelcome.\nmore\n');
  await run(b, 'rm readme.txt');
  h = await home(b);
  assert.equal(h['copy.txt'].content, 'Dear apprentice,\nwelcome.\nmore\n');
  assert.equal(h['copy.txt'].links, 1);
});

test('ln into a directory keeps the name, and with one operand links into the working directory', async () => {
  const b = await shell();
  await run(b, 'ln readme.txt forest');
  assert.equal((await home(b)).forest.children['readme.txt'].links, 2);
  await run(b, 'cd forest/cave');
  await run(b, 'ln ../mushroom.txt');
  assert.equal((await home(b)).forest.children.cave.children['mushroom.txt'].links, 2);
});

test('ln refuses directories, existing names and missing targets with the real messages', async () => {
  const b = await shell();
  const fails = async (line, err) => assert.deepEqual(await run(b, line).then(r => [r.err, r.status]), [err, 1], line);
  await fails('ln forest f2', 'ln: forest: hard link not allowed for directory\n');
  await fails('ln readme.txt .secret_map', "ln: failed to create hard link '.secret_map': File exists\n");
  await fails('ln missing x', "ln: failed to access 'missing': No such file or directory\n");
  await fails('ln -s readme.txt .secret_map', "ln: failed to create symbolic link '.secret_map': File exists\n");
  await fails('ln readme.txt', "ln: failed to create hard link './readme.txt': File exists\n");
  await fails('ln', "ln: missing file operand\nTry 'ln --help' for more information.\n");
  await fails('ln a b c', "ln: target 'c': No such file or directory\n");
  await fails('ln a b readme.txt', "ln: target 'readme.txt': Not a directory\n");
  await fails('ln readme.txt nodir/x', "ln: failed to create hard link 'nodir/x' => 'readme.txt': No such file or directory\n");
  await fails('ln -s readme.txt /etc/x', "ln: failed to create symbolic link '/etc/x': Permission denied\n");
  await fails('ln readme.txt /etc/x', "ln: failed to create hard link '/etc/x' => 'readme.txt': Permission denied\n");
});

test('ln will not hard link a file of someone else that you may not read and write', async () => {
  const r = await run(await shell(), 'ln /etc/shadow sh');
  assert.deepEqual([r.err, r.status], ["ln: failed to create hard link 'sh' => '/etc/shadow': Operation not permitted\n", 1]);
});

test('ln -s stores the target as typed; a relative one is read from the link\'s directory', async () => {
  const b = await shell();
  await run(b, 'ln -s ../readme.txt forest/letter');
  const link = (await home(b)).forest.children.letter;
  assert.deepEqual([link.type, link.target, link.size, link.mode, link.owner], ['symlink', '../readme.txt', 13, 0o777, 'hero']);
  assert.equal((await run(b, 'cat forest/letter')).out, 'Dear apprentice,\nwelcome.\n');
  await run(b, 'ln -s nowhere ghost');
  assert.equal((await home(b)).ghost.target, 'nowhere');
});

test('ln -s into a directory, -v, -f and -n', async () => {
  const b = await portals();
  assert.equal((await run(b, 'ln -sv /home/hero/readme.txt forest')).out, "'forest/readme.txt' -> '/home/hero/readme.txt'\n");
  assert.equal((await run(b, 'ln -v readme.txt r2')).out, "'r2' => 'readme.txt'\n");
  await run(b, 'ln -s readme.txt portal');
  assert.equal((await home(b)).forest.children.cave.children.deep.children['readme.txt'].type, 'symlink');
  assert.equal((await run(b, 'ln -sn readme.txt portal')).err, "ln: failed to create symbolic link 'portal': File exists\n");
  await run(b, 'ln -sfn readme.txt portal');
  assert.equal((await home(b)).portal.target, 'readme.txt');
  await run(b, 'ln -f readme.txt r2');
  assert.equal((await home(b)).r2.links, 2);
});

test('ln options it does not know fail like GNU ln, and ones it does not simulate say so', async () => {
  const b = await shell();
  assert.equal((await run(b, 'ln -q a b')).err, "ln: invalid option -- 'q'\nTry 'ln --help' for more information.\n");
  assert.match((await run(b, 'ln -r a b')).note, /-r/);
});

test('readlink prints a link\'s target text; anything else prints nothing and fails', async () => {
  const b = await portals();
  assert.deepEqual(await run(b, 'readlink portal').then(r => [r.out, r.status]), ['/home/hero/forest/cave/deep\n', 0]);
  assert.deepEqual(await run(b, 'readlink broken').then(r => [r.out, r.status]), ['nowhere\n', 0]);
  assert.deepEqual(await run(b, 'readlink readme.txt').then(r => [r.out, r.err, r.status]), ['', '', 1]);
  assert.deepEqual(await run(b, 'readlink nope').then(r => [r.out, r.err, r.status]), ['', '', 1]);
  assert.deepEqual(await run(b, 'readlink').then(r => [r.err, r.status]), ["readlink: missing operand\nTry 'readlink --help' for more information.\n", 1]);
});

test('readlink -f gives the real absolute path; -e needs it to exist, -m needs nothing', async () => {
  const b = await portals();
  const out = async line => run(b, line).then(r => [r.out, r.status]);
  assert.deepEqual(await out('readlink -f portal'), ['/home/hero/forest/cave/deep\n', 0]);
  assert.deepEqual(await out('readlink -f portal/../x'), ['/home/hero/forest/cave/x\n', 0]);
  assert.deepEqual(await out('readlink -f broken'), ['/home/hero/nowhere\n', 0]);
  assert.deepEqual(await out('readlink -f nope/x'), ['', 1]);
  assert.deepEqual(await out('readlink -f loop'), ['', 1]);
  assert.deepEqual(await out('readlink -e broken'), ['', 1]);
  assert.deepEqual(await out('readlink -e portal'), ['/home/hero/forest/cave/deep\n', 0]);
  assert.deepEqual(await out('readlink -m a/b/../c'), ['/home/hero/a/c\n', 0]);
  assert.deepEqual(await out('readlink -fn portal'), ['/home/hero/forest/cave/deep', 0]);
  await runAll(b, ['cd portal']);
  assert.deepEqual(await out('readlink -f .'), ['/home/hero/forest/cave/deep\n', 0]);
});
