import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { put, dir, file, symlink } from '../../../src/backend/spec.js';

const home = async b => (await b.observe()).tree.children.home.children.hero.children;

test('cp copies a file; the copy belongs to the user and keeps the mode minus the umask', async () => {
  const b = await shell();
  await run(b, 'cp readme.txt copy.txt');
  await run(b, 'cp /etc/hostname .');
  const h = await home(b);
  assert.equal(h['copy.txt'].content, 'Dear apprentice,\nwelcome.\n');
  assert.deepEqual([h.hostname.owner, h.hostname.mode], ['hero', 0o644]);
});

test('cp into a directory uses the source name, and needs -r for directories', async () => {
  const b = await shell();
  await run(b, 'cp readme.txt forest');
  assert.ok((await home(b)).forest.children['readme.txt']);
  assert.equal((await run(b, 'cp forest woods')).err, "cp: -r not specified; omitting directory 'forest'\n");
  await run(b, 'cp -r forest woods');
  assert.ok((await home(b)).woods.children.cave.children['bat.txt']);
});

test('cp messages name the full target', async () => {
  const b = await shell();
  assert.equal((await run(b, 'cp readme.txt /etc/')).err, "cp: cannot create regular file '/etc/readme.txt': Permission denied\n");
  assert.equal((await run(b, 'cp -r forest forest/cave')).err, "cp: cannot copy a directory, 'forest', into itself, 'forest/cave/forest'\n");
  assert.equal((await run(b, 'cp a b c')).err, "cp: target 'c': No such file or directory\n");
  assert.equal((await run(b, 'cp readme.txt readme.txt')).err, "cp: 'readme.txt' and 'readme.txt' are the same file\n");
  assert.equal((await run(b, 'cp readme.txt')).err, "cp: missing destination file operand after 'readme.txt'\nTry 'cp --help' for more information.\n");
});

test('cp -v prints each copy', async () => {
  assert.equal((await run(await shell(), 'cp -v readme.txt r2.txt')).out, "'readme.txt' -> 'r2.txt'\n");
});

test('mv renames, moves into directories, and refuses to move a directory into itself', async () => {
  const b = await shell();
  await run(b, 'mv readme.txt letter.txt');
  await run(b, 'mv letter.txt forest');
  assert.ok((await home(b)).forest.children['letter.txt']);
  assert.equal((await run(b, 'mv nope x')).err, "mv: cannot stat 'nope': No such file or directory\n");
  assert.equal((await run(b, 'mv forest forest/cave')).err, "mv: cannot move 'forest' to a subdirectory of itself, 'forest/cave/forest'\n");
  assert.equal((await run(b, 'mv /etc/hostname .')).err, "mv: cannot move '/etc/hostname' to './hostname': Permission denied\n");
  assert.equal((await run(b, 'mv -v forest woods')).out, "renamed 'forest' -> 'woods'\n");
});

test('a real cp or mv long option the game does not simulate gets a note; an unknown one is an error', async () => {
  const b = await shell();
  const sparse = await run(b, 'cp --sparse=always readme.txt copy.txt');
  assert.deepEqual([sparse.err, sparse.status, sparse.note], ['', 1, 'cp --sparse is a real option, but this game does not simulate it.']);
  assert.equal((await run(b, 'mv -f readme.txt moved.txt')).note, 'mv -f is a real option, but this game does not simulate it.');
  assert.equal((await run(b, 'cp --bogus readme.txt x')).err, "cp: unrecognized option '--bogus'\nTry 'cp --help' for more information.\n");
});

const linkWorld = () => shell([
  put('/home/hero/forest/cave/deep', dir({ 'key.txt': file('key\n', { owner: 'hero' }) }, { owner: 'hero' })),
  put('/home/hero/portal', symlink('/home/hero/forest/cave/deep', { owner: 'hero' })),
  put('/home/hero/letter', symlink('readme.txt', { owner: 'hero' })),
  put('/home/hero/broken', symlink('nowhere', { owner: 'hero' })),
  put('/home/hero/deeper', symlink('gone/x', { owner: 'hero' })),
  put('/home/hero/loop', symlink('loop', { owner: 'hero' })),
]);

test('cp follows a link it copies from; cp -r copies links as links', async () => {
  const b = await linkWorld();
  assert.equal((await run(b, 'cp portal p1')).err, "cp: -r not specified; omitting directory 'portal'\n");
  await run(b, 'cp letter forest');
  assert.deepEqual([(await home(b)).forest.children.letter.type, (await home(b)).forest.children.letter.content], ['file', 'Dear apprentice,\nwelcome.\n']);
  await run(b, 'cp -r portal p2');
  assert.deepEqual([(await home(b)).p2.type, (await home(b)).p2.target], ['symlink', '/home/hero/forest/cave/deep']);
  await run(b, 'mkdir box && ln -s ../readme.txt box/rel && cp -r box box2');
  assert.equal((await home(b)).box2.children.rel.target, '../readme.txt');
  assert.equal((await run(b, 'cat box2/rel')).out, 'Dear apprentice,\nwelcome.\n');
});

test('cp writes through a link to a file, into a link to a directory, never through a dangling one', async () => {
  const b = await linkWorld();
  await run(b, 'cp .secret_map letter');
  assert.equal((await home(b))['readme.txt'].content, 'the map\n');
  await run(b, 'cp .secret_map portal');
  assert.ok((await home(b)).forest.children.cave.children.deep.children['.secret_map']);
  assert.deepEqual(await run(b, 'cp .secret_map broken').then(r => [r.err, r.status]), ["cp: not writing through dangling symlink 'broken'\n", 1]);
  assert.equal((await run(b, 'cp broken b2')).err, "cp: cannot stat 'broken': No such file or directory\n");
});

test('cp refuses to copy a file onto another name of itself', async () => {
  const b = await linkWorld();
  await run(b, 'ln readme.txt copy.txt');
  assert.equal((await run(b, 'cp readme.txt copy.txt')).err, "cp: 'readme.txt' and 'copy.txt' are the same file\n");
});

test('mv moves the link itself, and into the directory a link leads to', async () => {
  const b = await linkWorld();
  await run(b, 'mv broken b3');
  assert.deepEqual([(await home(b)).broken, (await home(b)).b3.target], [undefined, 'nowhere']);
  await run(b, 'mv .secret_map portal');
  assert.ok((await home(b)).forest.children.cave.children.deep.children['.secret_map']);
  assert.equal((await home(b)).portal.type, 'symlink');
  await run(b, 'mv letter forest');
  assert.equal((await home(b)).forest.children.letter.type, 'symlink');
});

test('a hard link keeps its inode when moved', async () => {
  const b = await linkWorld();
  await run(b, 'ln readme.txt copy.txt');
  const before = (await home(b))['copy.txt'].ino;
  await run(b, 'mv copy.txt forest');
  assert.equal((await home(b)).forest.children['copy.txt'].ino, before);
});
