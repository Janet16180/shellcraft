import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, lookup, joinDisp, splitLines, byteLength, sizeOf, newDir, newFile, newSymlink, linkCounts, linksOf, cloneNode, fromSpec, snapshot, insert, detach, addChild, removeChild, heightOf, MAX_TREE_DEPTH } from '../../src/shell/fs.js';
import { dir, file, symlink } from '../../src/backend/spec.js';
import { nameTable } from '../../src/shell/table.js';

const meta = { mode: 0o755, owner: 'root', group: 'root', mtime: 1 };
const tree = () => newDir({ home: newDir({ hero: newDir({ 'a.txt': newFile('hi\n', meta) }, meta) }, meta) }, meta);

test('normalize resolves relative paths, dots and repeated slashes', () => {
  assert.equal(normalize('forest/../cave//./x', '/home/hero'), '/home/hero/cave/x');
  assert.equal(normalize('/../..', '/home'), '/');
  assert.equal(normalize('.', '/tmp'), '/tmp');
});

test('lookup finds nodes and returns null through files or missing names', () => {
  const root = tree();
  assert.equal(lookup(root, '/'), root);
  assert.equal(lookup(root, '/home/hero/a.txt').content, 'hi\n');
  assert.equal(lookup(root, '/home/hero/a.txt/x'), null);
  assert.equal(lookup(root, '/nope'), null);
});

test('joinDisp joins a typed path and a name for display', () => {
  assert.equal(joinDisp('', 'a'), 'a');
  assert.equal(joinDisp('dir/', 'a'), 'dir/a');
  assert.equal(joinDisp('dir', 'a'), 'dir/a');
});

test('splitLines ignores the final newline and gives nothing for empty text', () => {
  assert.deepEqual(splitLines('a\nb\n'), ['a', 'b']);
  assert.deepEqual(splitLines('a\nb'), ['a', 'b']);
  assert.deepEqual(splitLines(''), []);
});

test('sizes are UTF-8 bytes for files and 4096 for directories', () => {
  assert.equal(byteLength('é'), 2);
  assert.equal(sizeOf(newFile('abc', meta)), 3);
  assert.equal(sizeOf(newDir({}, meta)), 4096);
});

test('cloneNode copies deeply and stamps the new time', () => {
  const original = lookup(tree(), '/home');
  const copy = cloneNode(original, 99);
  copy.children.hero.children['a.txt'].content = 'changed';
  assert.equal(original.children.hero.children['a.txt'].content, 'hi\n');
  assert.equal(copy.children.hero.mtime, 99);
});

test('fromSpec turns spec nodes into filesystem nodes with a time', () => {
  const node = fromSpec(dir({ 'x.txt': file('x', { owner: 'hero' }) }, { mode: 0o700 }), 5);
  assert.deepEqual(node, {
    type: 'dir', mode: 0o700, owner: 'root', group: 'root', mtime: 5,
    children: nameTable({ 'x.txt': { type: 'file', mode: 0o644, owner: 'hero', group: 'hero', mtime: 5, content: 'x' } }),
  });
});

test('snapshot adds sizes and shares nothing with the tree', () => {
  const root = tree();
  const snap = snapshot(root);
  assert.equal(snap.children.home.size, 4096);
  assert.equal(snap.children.home.children.hero.children['a.txt'].size, 3);
  snap.children.home.children.hero.children['a.txt'].content = 'x';
  assert.equal(lookup(root, '/home/hero/a.txt').content, 'hi\n');
});

test('insert places a node under an existing directory and raises otherwise', () => {
  const root = tree();
  insert(root, '/home/hero/b', newDir({}, meta));
  assert.equal(lookup(root, '/home/hero/b').type, 'dir');
  assert.throws(() => insert(root, '/nope/b', newDir({}, meta)), /not a directory/);
});

test('detach removes a node, stamps its parent, and ignores a missing one', () => {
  const root = tree();
  detach(root, '/home/hero/a.txt', 50);
  detach(root, '/nope/x', 60);
  assert.equal(lookup(root, '/home/hero/a.txt'), null);
  assert.equal(lookup(root, '/home/hero').mtime, 50);
});

test('adding or removing an entry updates the directory time', () => {
  const d = newDir({}, meta);
  addChild(d, 'x', newFile('', meta), 10);
  assert.equal(d.mtime, 10);
  removeChild(d, 'x', 20);
  assert.deepEqual([d.mtime, d.children], [20, nameTable()]);
});

test('entries named like object members are ordinary entries', () => {
  const root = newDir({}, meta);
  addChild(root, '__proto__', newFile('p', meta), 10);
  assert.equal(lookup(root, '/__proto__').content, 'p');
  assert.equal(lookup(root, '/constructor'), null);
  assert.deepEqual(Object.keys(cloneNode(root, 11).children), ['__proto__']);
  assert.ok(Object.hasOwn(snapshot(root).children, '__proto__'));
  removeChild(root, '__proto__', 12);
  assert.equal(lookup(root, '/__proto__'), null);
});

test('byteLength counts UTF-8 bytes for every width of character', () => {
  const encoded = text => new TextEncoder().encode(text).length;
  for (const text of ['', 'abc', 'é', 'ü€', '\u{1F600}', 'a\u{1F600}b€é', '߿ࠀ￿']) assert.equal(byteLength(text), encoded(text), text);
});

test('heightOf counts the levels of a subtree without recursion', () => {
  assert.equal(heightOf(newFile('', meta)), 1);
  assert.equal(heightOf(newDir({}, meta)), 1);
  let deep = newFile('', meta);
  for (let i = 0; i < 50000; i++) deep = newDir({ d: deep }, meta);
  assert.equal(heightOf(deep), 50001);
  assert.equal(MAX_TREE_DEPTH, 256);
});

test('a symbolic link node keeps its target text, and its size is that text in bytes', () => {
  const link = newSymlink('forest/caé', meta);
  assert.deepEqual(link, { type: 'symlink', mode: 0o777, owner: 'root', group: 'root', mtime: 1, target: 'forest/caé' });
  assert.equal(sizeOf(link), 11);
});

test('fromSpec makes symbolic links from symlink()', () => {
  const node = fromSpec(dir({ p: symlink('/x', { owner: 'hero' }) }), 5);
  assert.deepEqual(node.children.p, { type: 'symlink', mode: 0o777, owner: 'hero', group: 'hero', mtime: 5, target: '/x' });
});

test('lookup follows symbolic links unless told not to for the last name', () => {
  const root = tree();
  addChild(lookup(root, '/home/hero'), 'p', newSymlink('a.txt', meta), 2);
  assert.equal(lookup(root, '/home/hero/p').content, 'hi\n');
  assert.equal(lookup(root, '/home/hero/p', { follow: false }).type, 'symlink');
});

test('link counts: names of a file, 2 plus subdirectories for a directory', () => {
  const root = tree();
  const hero = lookup(root, '/home/hero');
  const a = lookup(root, '/home/hero/a.txt');
  addChild(hero, 'b.txt', a, 2);
  addChild(hero, 'sub', newDir({}, meta), 2);
  const counts = linkCounts(root);
  assert.equal(linksOf(a, counts), 2);
  assert.equal(linksOf(hero, counts), 3);
  assert.equal(linksOf(root, counts), 3);
});

test('snapshot shows inode numbers, link counts and symbolic links, and repeats a hard-linked file under each name', () => {
  const root = tree();
  const hero = lookup(root, '/home/hero');
  const a = lookup(root, '/home/hero/a.txt');
  a.ino = 1801;
  hero.ino = 1802;
  addChild(hero, 'b.txt', a, 2);
  addChild(hero, 'p', { ...newSymlink('a.txt', meta), ino: 1803 }, 2);
  const snap = snapshot(root).children.home.children.hero;
  assert.equal(snap.ino, 1802);
  assert.equal(snap.links, 2);
  assert.deepEqual([snap.children['a.txt'].ino, snap.children['b.txt'].ino, snap.children['b.txt'].links], [1801, 1801, 2]);
  assert.deepEqual(snap.children.p, { type: 'symlink', mode: 0o777, owner: 'root', group: 'root', size: 5, mtime: 1, ino: 1803, links: 1, target: 'a.txt' });
});

test('cloneNode gives the copies no inode number of their own yet', () => {
  const original = lookup(tree(), '/home');
  original.ino = 5;
  assert.equal(cloneNode(original, 9).ino, undefined);
});
