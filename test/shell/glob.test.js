import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globRe, expandGlob } from '../../src/shell/glob.js';
import { newDir, newFile } from '../../src/shell/fs.js';

const meta = { mode: 0o755, owner: 'hero', group: 'hero', mtime: 0 };
const f = () => newFile('', meta);
const root = newDir({ d: newDir({ 'b.txt': f(), 'a.txt': f(), '.h.txt': f(), sub: newDir({ 'x.md': f() }, meta) }, meta) }, meta);

test('globRe matches whole names with * and ?', () => {
  assert.ok(globRe('*.txt').test('a.txt'));
  assert.ok(!globRe('*.txt').test('a.txt.bak'));
  assert.ok(globRe('?.txt').test('a.txt'));
  assert.ok(globRe('A*', true).test('abc'));
});

test('a pattern expands to the matching names, hidden ones excluded', () => {
  assert.deepEqual(expandGlob({ v: '*.txt', glob: true }, root, '/d'), ['a.txt', 'b.txt']);
  assert.deepEqual(expandGlob({ v: '.*.txt', glob: true }, root, '/d'), ['.h.txt']);
});

test('patterns work in several path segments and keep the typed prefix', () => {
  assert.deepEqual(expandGlob({ v: '/d/*/*.md', glob: true }, root, '/'), ['/d/sub/x.md']);
  assert.deepEqual(expandGlob({ v: 'd/s*', glob: true }, root, '/'), ['d/sub']);
});

test('a pattern that matches nothing, or a word without wildcards, stays as typed', () => {
  assert.deepEqual(expandGlob({ v: '*.zip', glob: true }, root, '/d'), ['*.zip']);
  assert.deepEqual(expandGlob({ v: '*.txt', glob: false }, root, '/d'), ['*.txt']);
});
