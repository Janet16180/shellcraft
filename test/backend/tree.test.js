import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeAt, walkPath, childOf, isInside, compareNames, parentOf, joinPath, baseName } from '../../src/backend/tree.js';
import { dir, file, symlink } from '../../src/backend/spec.js';

const tree = dir({ home: dir({ hero: dir({ 'a.txt': file('hi\n') }) }) });

test('nodeAt finds a node by its absolute path and the root by /', () => {
  assert.equal(nodeAt(tree, '/home/hero/a.txt').content, 'hi\n');
  assert.equal(nodeAt(tree, '/'), tree);
});

test('nodeAt gives null for a path where nothing is, even below a file', () => {
  assert.equal(nodeAt(tree, '/home/nobody'), null);
  assert.equal(nodeAt(tree, '/home/hero/a.txt/x'), null);
});

test('nodeAt raises for a relative path, which is a caller bug', () => {
  assert.throws(() => nodeAt(tree, 'home/hero'), /absolute/);
});

test('a directory is inside itself and holds everything below it', () => {
  assert.equal(isInside('/home/hero', '/home/hero'), true);
  assert.equal(isInside('/home/hero/forest/cave', '/home/hero'), true);
});

test('a sibling that only shares a prefix is not inside', () => {
  assert.equal(isInside('/home/heroine', '/home/hero'), false);
  assert.equal(isInside('/home', '/home/hero'), false);
});

test('every absolute path is inside the root', () => {
  assert.equal(isInside('/', '/'), true);
  assert.equal(isInside('/home/hero', '/'), true);
});

test('names compare in C.UTF-8 order: by code point, capitals and dots first', () => {
  assert.deepEqual(['b', '.x', 'B', 'a', '_y'].sort(compareNames), ['.x', 'B', '_y', 'a', 'b']);
});

test('names compare by code point even beyond the basic plane', () => {
  assert.ok(compareNames('\u{1F600}', '�') > 0);
  assert.ok(compareNames('ab', 'abc') < 0);
  assert.equal(compareNames('same', 'same'), 0);
});

test('nodeAt finds nothing at a name an object inherits, like constructor or __proto__', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(nodeAt(tree, `/home/hero/${name}`), null, name);
  }
});

test('childOf gives a directory\'s own entry by name, or null', () => {
  const home = nodeAt(tree, '/home/hero');
  assert.equal(childOf(home, 'a.txt').content, 'hi\n');
  assert.equal(childOf(home, 'constructor'), null);
  assert.equal(childOf(nodeAt(tree, '/home/hero/a.txt'), 'x'), null);
});

test('childOf finds an entry really named like an inherited property', () => {
  const odd = dir({ constructor: file('real\n') });
  assert.equal(childOf(odd, 'constructor').content, 'real\n');
  assert.equal(nodeAt(dir({ etc: odd }), '/etc/constructor').content, 'real\n');
});

test('the parent of a path drops its last name, and / is its own parent', () => {
  assert.equal(parentOf('/home/hero/forest'), '/home/hero');
  assert.equal(parentOf('/etc'), '/');
  assert.equal(parentOf('/'), '/');
});

test('joining a name onto a directory gives one slash between them', () => {
  assert.equal(joinPath('/', 'etc'), '/etc');
  assert.equal(joinPath('/home/hero', 'forest'), '/home/hero/forest');
});

test('the base name is the last name of a path, and empty for /', () => {
  assert.equal(baseName('/home/hero/readme.txt'), 'readme.txt');
  assert.equal(baseName('/etc'), 'etc');
  assert.equal(baseName('/'), '');
});

test('parentOf and baseName raise for a relative path, which is a caller bug', () => {
  assert.throws(() => parentOf('home/hero'), /absolute/);
  assert.throws(() => baseName('readme.txt'), /absolute/);
});

test('a path is its parent joined with its base name', () => {
  for (const path of ['/etc', '/home/hero', '/home/hero/forest/cave/deep', '/tmp/ ', '/x/~.txt']) {
    assert.equal(joinPath(parentOf(path), baseName(path)), path);
  }
});

const linked = () => dir({ home: dir({ hero: dir({
  'a.txt': file('hi\n'),
  forest: dir({ cave: dir({ deep: dir({ 'key.txt': file('key\n') }) }) }),
  portal: symlink('/home/hero/forest/cave/deep'),
  near: symlink('forest/cave'),
  up: symlink('../hero/a.txt'),
  broken: symlink('nowhere'),
  loop1: symlink('loop2'),
  loop2: symlink('loop1'),
}) }) });

test('nodeAt follows symbolic links, absolute or relative to the link\'s directory', () => {
  const t = linked();
  assert.equal(nodeAt(t, '/home/hero/portal/key.txt').content, 'key\n');
  assert.equal(nodeAt(t, '/home/hero/portal'), nodeAt(t, '/home/hero/forest/cave/deep'));
  assert.equal(nodeAt(t, '/home/hero/near/deep/key.txt').content, 'key\n');
  assert.equal(nodeAt(t, '/home/hero/up').content, 'hi\n');
});

test('.. after a followed link goes up from where the link leads', () => {
  assert.equal(nodeAt(linked(), '/home/hero/portal/../deep/key.txt').content, 'key\n');
});

test('with follow false, nodeAt gives the link itself when it is the last name', () => {
  const t = linked();
  assert.deepEqual(nodeAt(t, '/home/hero/portal', { follow: false }), symlink('/home/hero/forest/cave/deep'));
  assert.equal(nodeAt(t, '/home/hero/portal/key.txt', { follow: false }).content, 'key\n');
});

test('a dangling link or a loop leads nowhere, but the link itself is there', () => {
  const t = linked();
  assert.equal(nodeAt(t, '/home/hero/broken'), null);
  assert.equal(nodeAt(t, '/home/hero/loop1'), null);
  assert.equal(nodeAt(t, '/home/hero/broken', { follow: false }).type, 'symlink');
});

test('walkPath reports the kernel errors: a loop, a file in the middle, a missing name', () => {
  const t = linked();
  const root = [{ name: '', node: t }];
  assert.equal(walkPath(root, '/home/hero/loop1').error, 'ELOOP');
  assert.equal(walkPath(root, '/home/hero/a.txt/x').error, 'ENOTDIR');
  assert.equal(walkPath(root, '/home/hero/nope/x').error, 'ENOENT');
});

test('walkPath ends a dangling link at the name it points to, with that name\'s directory as parent', () => {
  const t = linked();
  const w = walkPath([{ name: '', node: t }], '/home/hero/broken');
  assert.equal(w.error, 'ENOENT');
  assert.equal(w.parent, nodeAt(t, '/home/hero'));
  assert.deepEqual(w.stack.map(s => s.name), ['', 'home', 'hero', 'nowhere']);
});

test('walkPath follows a last link anyway when the path ends in a slash', () => {
  const w = walkPath([{ name: '', node: linked() }], '/home/hero/portal/', { follow: false });
  assert.equal(w.stack.at(-1).node.type, 'dir');
  assert.deepEqual(w.stack.map(s => s.name).slice(-3), ['forest', 'cave', 'deep']);
});

test('walkPath asks check before each step and stops at its error', () => {
  const t = linked();
  const w = walkPath([{ name: '', node: t }], '/home/hero/a.txt', { check: (_dir, name) => (name === 'hero' ? 'EACCES' : null) });
  assert.equal(w.error, 'EACCES');
});
