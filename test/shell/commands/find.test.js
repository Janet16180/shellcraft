import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { put, file, dir } from '../../../src/backend/spec.js';

const mine = { owner: 'hero' };
const withTree = () => shell([put('/home/hero/t', dir({ 'a.txt': file('x', mine), 'B.md': file('', mine), sub: dir({ 'c.txt': file('', mine) }, mine), empty: dir({}, mine) }, mine))]);

test('find lists the start and everything below it, in name order', async () => {
  assert.equal((await run(await withTree(), 'find t')).out, 't\nt/B.md\nt/a.txt\nt/empty\nt/sub\nt/sub/c.txt\n');
});

test('-name, -iname and -type select entries; tests combine with and', async () => {
  const b = await withTree();
  assert.equal((await run(b, "find t -name '*.txt'")).out, 't/a.txt\nt/sub/c.txt\n');
  assert.equal((await run(b, "find t -iname 'b*'")).out, 't/B.md\n');
  assert.equal((await run(b, 'find t -type d')).out, 't\nt/empty\nt/sub\n');
  assert.equal((await run(b, "find t -type f -name 'c*'")).out, 't/sub/c.txt\n');
});

test('! -o and parentheses build expressions; -empty finds empty files and directories', async () => {
  const b = await withTree();
  assert.equal((await run(b, 'find t ! -type d')).out, 't/B.md\nt/a.txt\nt/sub/c.txt\n');
  assert.equal((await run(b, 'find t -name a.txt -o -name c.txt')).out, 't/a.txt\nt/sub/c.txt\n');
  assert.equal((await run(b, 'find t -empty')).out, 't/B.md\nt/empty\nt/sub/c.txt\n');
});

test('-maxdepth and -mindepth limit the depth', async () => {
  assert.equal((await run(await withTree(), 'find t -mindepth 1 -maxdepth 1')).out, 't/B.md\nt/a.txt\nt/empty\nt/sub\n');
});

test('errors use the GNU messages; an unreadable directory is reported and skipped', async () => {
  const b = await withTree();
  assert.deepEqual(await run(b, 'find nope').then(r => [r.err, r.status]), ['find: ‘nope’: No such file or directory\n', 1]);
  assert.equal((await run(b, 'find t -name')).err, "find: missing argument to `-name'\n");
  assert.equal((await run(b, 'find t -type x')).err, 'find: Unknown argument to -type: x\n');
  assert.equal((await run(b, 'find t -foo')).err, "find: unknown predicate `-foo'\n");
  const root = await run(b, 'find /root');
  assert.deepEqual([root.out, root.err, root.status], ['/root\n', 'find: ‘/root’: Permission denied\n', 1]);
});
