import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';

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
