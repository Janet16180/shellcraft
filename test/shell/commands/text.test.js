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

test('find walks the tree with -name, -type and -maxdepth', async () => {
  const b = await withScroll();
  assert.equal((await run(b, 'find forest')).out, 'forest\nforest/cave\nforest/cave/bat.txt\nforest/mushroom.txt\n');
  assert.equal((await run(b, 'find . -name "*.txt" -maxdepth 1')).out, './inv.txt\n./readme.txt\n./scroll.txt\n');
  assert.equal((await run(b, 'find forest -type d')).out, 'forest\nforest/cave\n');
  assert.equal((await run(b, 'find nope')).err, 'find: \u2018nope\u2019: No such file or directory\n');
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
