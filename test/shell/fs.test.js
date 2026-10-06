import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, lookup, parentOf, baseName, joinPath, joinDisp, splitLines, byteLength, sizeOf, newDir, newFile, cloneNode, fromSpec, snapshot, insert, detach } from '../../src/shell/fs.js';
import { dir, file } from '../../src/backend/spec.js';

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

test('path helpers split and join paths', () => {
  assert.equal(parentOf('/home/hero'), '/home');
  assert.equal(parentOf('/home'), '/');
  assert.equal(baseName('/home/hero'), 'hero');
  assert.equal(joinPath('/', 'etc'), '/etc');
  assert.equal(joinPath('/etc', 'passwd'), '/etc/passwd');
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
    children: { 'x.txt': { type: 'file', mode: 0o644, owner: 'hero', group: 'hero', mtime: 5, content: 'x' } },
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

test('detach removes a node and ignores a missing one', () => {
  const root = tree();
  detach(root, '/home/hero/a.txt');
  detach(root, '/nope/x');
  assert.equal(lookup(root, '/home/hero/a.txt'), null);
});
