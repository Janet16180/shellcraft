import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { put, file } from '../../../src/backend/spec.js';

const lines = n => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
const withScroll = () => shell([put('/home/hero/scroll.txt', file(lines(15), { owner: 'hero' })), put('/home/hero/inv.txt', file('b\na\nb\nc\na\n', { owner: 'hero' }))]);

test('head and tail print 10 lines by default, -n N or -N for more or fewer', async () => {
  const b = await withScroll();
  assert.equal((await run(b, 'head scroll.txt')).out, lines(10));
  assert.equal((await run(b, 'head -n 2 scroll.txt')).out, 'line 1\nline 2\n');
  assert.equal((await run(b, 'tail -3 scroll.txt')).out, 'line 13\nline 14\nline 15\n');
  assert.equal((await run(b, 'tail -n +14 scroll.txt')).out, 'line 14\nline 15\n');
});

test('head of several files heads each one', async () => {
  const r = await run(await withScroll(), 'head -n 1 scroll.txt inv.txt');
  assert.equal(r.out, '==> scroll.txt <==\nline 1\n\n==> inv.txt <==\nb\n');
});

test('wc counts lines, words and bytes', async () => {
  const b = await withScroll();
  assert.equal((await run(b, 'wc readme.txt')).out, ' 2  3 26 readme.txt\n');
  assert.equal((await run(b, 'wc -l scroll.txt')).out, '15 scroll.txt\n');
  assert.equal((await run(b, 'cat inv.txt | wc -l')).out, '5\n');
});

test('sort orders lines; -r reverses, -u drops repeats, -n compares numbers', async () => {
  const b = await withScroll();
  assert.equal((await run(b, 'sort inv.txt')).out, 'a\na\nb\nb\nc\n');
  assert.equal((await run(b, 'sort -ru inv.txt')).out, 'c\nb\na\n');
  assert.equal((await run(b, 'echo -e "10\\n9" | sort -n')).out, '9\n10\n');
});

test('uniq collapses adjacent repeats; -c counts them', async () => {
  const b = await withScroll();
  assert.equal((await run(b, 'sort inv.txt | uniq')).out, 'a\nb\nc\n');
  assert.equal((await run(b, 'sort inv.txt | uniq -c')).out, '      2 a\n      2 b\n      1 c\n');
});

test('head -c counts bytes and head -n -N drops the last N lines', async () => {
  const b = await withScroll();
  assert.equal((await run(b, 'head -c 5 readme.txt')).out, 'Dear ');
  assert.equal((await run(b, 'head -n -13 scroll.txt')).out, 'line 1\nline 2\n');
});

test('head and tail name the file they cannot open, with quotes', async () => {
  const b = await withScroll();
  assert.equal((await run(b, 'head nope')).err, "head: cannot open 'nope' for reading: No such file or directory\n");
  assert.equal((await run(b, 'tail forest')).err, "tail: error reading 'forest': Is a directory\n");
  assert.equal((await run(b, 'head -n x scroll.txt')).err, 'head: invalid number of lines: \u2018x\u2019\n');
});

test('wc pads its columns to the total size of the files, and to 7 for piped input', async () => {
  const b = await withScroll();
  assert.equal((await run(b, 'wc -l scroll.txt inv.txt')).out, ' 15 scroll.txt\n  5 inv.txt\n 20 total\n');
  assert.equal((await run(b, 'cat inv.txt | wc')).out, '      5       5      10\n');
  const dir = await run(b, 'wc forest');
  assert.deepEqual([dir.out, dir.err, dir.status], ['      0       0       0 forest\n', 'wc: forest: Is a directory\n', 1]);
});

test('sort uses byte order, so capitals come first; -f folds case and -n compares numbers', async () => {
  const b = await shell([put('/home/hero/mix.txt', file('banana\nApple\ncherry\n10 x\n9 y\n', { owner: 'hero' }))]);
  assert.equal((await run(b, 'sort mix.txt')).out, '10 x\n9 y\nApple\nbanana\ncherry\n');
  assert.equal((await run(b, 'sort -f mix.txt')).out, '10 x\n9 y\nApple\nbanana\ncherry\n');
  assert.equal((await run(b, 'sort -n mix.txt')).out, 'Apple\nbanana\ncherry\n9 y\n10 x\n');
  assert.equal((await run(b, 'sort nope')).err, 'sort: cannot read: nope: No such file or directory\n');
});
