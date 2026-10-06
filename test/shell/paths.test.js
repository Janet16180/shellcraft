import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, errorText } from '../../src/shell/paths.js';
import { newDir, newFile } from '../../src/shell/fs.js';

const m = (owner, mode) => ({ owner, group: owner, mode, mtime: 0 });
const sys = () => ({
  user: 'hero', groups: ['hero'], cwd: '/home/hero',
  root: newDir({
    home: newDir({ hero: newDir({ 'a.txt': newFile('a', m('hero', 0o644)), d: newDir({}, m('hero', 0o755)) }, m('hero', 0o750)) }, m('root', 0o755)),
    root: newDir({ 'secret.txt': newFile('s', m('root', 0o644)) }, m('root', 0o700)),
  }, m('root', 0o755)),
});

test('a path resolves to its absolute form, node and parent', () => {
  const r = resolve(sys(), 'd/../a.txt');
  assert.equal(r.abs, '/home/hero/a.txt');
  assert.equal(r.node.content, 'a');
  assert.equal(r.parent.type, 'dir');
  assert.equal(r.error, null);
});

test('a missing last component is ENOENT but keeps the parent for creating it', () => {
  const r = resolve(sys(), 'new.txt');
  assert.deepEqual([r.abs, r.node, r.error], ['/home/hero/new.txt', null, 'ENOENT']);
  assert.ok(r.parent);
});

test('a missing directory before .. is ENOENT, as the kernel walks every component', () => {
  assert.equal(resolve(sys(), 'nope/..').error, 'ENOENT');
  assert.equal(resolve(sys(), 'nope/x').parent, null);
});

test('a file used as a directory is ENOTDIR', () => {
  assert.equal(resolve(sys(), 'a.txt/x').error, 'ENOTDIR');
  assert.equal(resolve(sys(), 'a.txt/').error, 'ENOTDIR');
});

test('a directory without search permission hides what is inside', () => {
  assert.equal(resolve(sys(), '/root/secret.txt').error, 'EACCES');
  assert.equal(resolve(sys(), '/root').error, null);
});

test('.. at the root stays at the root', () => {
  assert.equal(resolve(sys(), '/../../home').abs, '/home');
});

test('errorText gives the message for each error', () => {
  assert.equal(errorText('ENOENT'), 'No such file or directory');
  assert.equal(errorText('ENOTDIR'), 'Not a directory');
  assert.equal(errorText('EACCES'), 'Permission denied');
});
