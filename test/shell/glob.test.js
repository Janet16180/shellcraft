import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileGlob, hasGlob, unescapeGlob, expandPattern } from '../../src/shell/glob.js';
import { newDir, newFile, newSymlink } from '../../src/shell/fs.js';

const meta = { mode: 0o755, owner: 'hero', group: 'hero', mtime: 0 };
const f = () => newFile('', meta);
const tree = () => newDir({
  d: newDir({ 'b.txt': f(), 'a.txt': f(), 'B.txt': f(), '.h.txt': f(), 'c1': f(), 'c22': f(), 'my file': f(), sub: newDir({ 'x.md': f() }, meta) }, meta),
  locked: newDir({ 'in.txt': f() }, { ...meta, owner: 'root', mode: 0o700 }),
}, meta);
const sys = () => ({ root: tree(), cwd: '/d', user: 'hero', gids: [1000] });

test('compileGlob matches whole names with * ? and bracket expressions', () => {
  assert.ok(compileGlob('*.txt').test('a.txt'));
  assert.ok(!compileGlob('*.txt').test('a.txt.bak'));
  assert.ok(compileGlob('c?').test('c1'));
  assert.ok(!compileGlob('c?').test('c22'));
  assert.ok(compileGlob('[ab].txt').test('b.txt'));
  assert.ok(compileGlob('[!a]*').test('b.txt'));
  assert.ok(compileGlob('[^a]*').test('b.txt'));
  assert.ok(compileGlob('c[0-9]').test('c1'));
  assert.ok(compileGlob('c[[:digit:]]*').test('c22'));
  assert.ok(compileGlob('[]x]').test(']'));
});

test('escaped wildcards and regex characters match themselves', () => {
  assert.ok(compileGlob('a\\*').test('a*'));
  assert.ok(!compileGlob('a\\*').test('ab'));
  assert.ok(compileGlob('a.(b)+').test('a.(b)+'));
  assert.ok(compileGlob('[a').test('[a'));
});

test('compileGlob can ignore case for find -iname', () => {
  assert.ok(compileGlob('A*', { ignoreCase: true }).test('abc'));
});

test('hasGlob sees only unescaped wildcards and complete brackets', () => {
  assert.equal(hasGlob('*.txt'), true);
  assert.equal(hasGlob('a\\*'), false);
  assert.equal(hasGlob('[ab]'), true);
  assert.equal(hasGlob('[a'), false);
  assert.equal(hasGlob('plain'), false);
});

test('unescapeGlob removes the escaping backslashes', () => {
  assert.equal(unescapeGlob('my\\ file\\*'), 'my file*');
});

test('a pattern expands to matches in byte order, without hidden names', () => {
  assert.deepEqual(expandPattern('*.txt', sys()), ['B.txt', 'a.txt', 'b.txt']);
  assert.deepEqual(expandPattern('.*', sys()), ['.h.txt']);
  assert.deepEqual(expandPattern('my*', sys()), ['my file']);
});

test('patterns work across directories and keep the typed prefix', () => {
  assert.deepEqual(expandPattern('/d/*/*.md', sys()), ['/d/sub/x.md']);
  assert.deepEqual(expandPattern('../d/s*', sys()), ['../d/sub']);
  assert.deepEqual(expandPattern('*/x.md', sys()), ['sub/x.md']);
});

test('no match, or an unreadable directory, expands to nothing', () => {
  assert.deepEqual(expandPattern('*.zip', sys()), []);
  assert.deepEqual(expandPattern('/locked/*', sys()), []);
});

test('a dash or slash in a pattern is literal outside brackets', () => {
  assert.ok(compileGlob('a-b*').test('a-b.txt'));
  assert.ok(compileGlob('[a-]x').test('-x'));
});

test('a trailing slash keeps only directories', () => {
  assert.deepEqual(expandPattern('*/', sys()), ['sub/']);
});

test('matching takes time proportional to the pattern and the name, whatever the stars', () => {
  const name = 'a'.repeat(255);
  const started = Date.now();
  assert.equal(compileGlob(`${'*'.repeat(40)}zz`).test(name), false);
  assert.equal(compileGlob(`${'*a'.repeat(30)}b`).test(name), false);
  assert.equal(compileGlob(`${'*a'.repeat(30)}*`).test(name), true);
  assert.ok(Date.now() - started < 200);
});

test('stars, question marks and brackets match whole characters, emoji included', () => {
  assert.ok(compileGlob('?').test('\u{1F600}'));
  assert.ok(compileGlob('\u{1F600}*').test('\u{1F600}x'));
  assert.ok(compileGlob('a*b*c').test('aXbYbZc'));
  assert.ok(!compileGlob('a*b*c').test('aXbYbZ'));
  assert.ok(compileGlob('*').test(''));
  assert.ok(compileGlob('[[:upper:]]*', { ignoreCase: false }).test('Readme'));
  assert.ok(compileGlob('readme*', { ignoreCase: true }).test('README.md'));
  assert.ok(compileGlob('\\*x').test('*x'));
  assert.ok(!compileGlob('\\*x').test('ax'));
});

test('a pattern matches a dangling link by its name, and reads a directory through a link', () => {
  const s = sys();
  Object.assign(s.root.children.d.children, { broken: newSymlink('nowhere', meta), portal: newSymlink('sub', meta) });
  assert.deepEqual(expandPattern('b*', s), ['b.txt', 'broken']);
  assert.deepEqual(expandPattern('portal/*', s), ['portal/x.md']);
});
