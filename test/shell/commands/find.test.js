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

test('find -help and -version act wherever they appear, as GNU find does', async () => {
  const b = await shell();
  const help = await run(b, 'find -help');
  assert.match(help.out, /^Usage: find \[-H\] \[-L\] \[-P\] \[-Olevel\] \[-D debugopts\] \[path\.\.\.\] \[expression\]\n/);
  assert.equal(help.out.split('\n').length, 46);
  assert.equal(help.status, 0);
  for (const line of ['find --help', 'find . -name x -help']) assert.equal((await run(b, line)).out, help.out, line);
  for (const line of ['find -version', 'find . -version', 'find --version']) assert.match((await run(b, line)).out, /^find \(GNU findutils\) 4\.9\.0\n/, line);
  assert.equal((await run(b, 'find -bogus -help')).err, "find: unknown predicate `-bogus'\n");
});

test('long chains of operators and negations work without deep recursion', async () => {
  const b = await shell();
  assert.deepEqual(await run(b, `find / -maxdepth 0 ${'! '.repeat(20000)}-false`).then(r => [r.out, r.status]), ['', 0]);
  assert.equal((await run(b, `find / -maxdepth 0 ${'! '.repeat(20001)}-false`)).out, '/\n');
  assert.equal((await run(b, `find / -maxdepth 0 ${'-true '.repeat(20000)}`)).out, '/\n');
  assert.equal((await run(b, `find / -maxdepth 0 -false ${'-o -false '.repeat(20000)}-o -true`)).out, '/\n');
  assert.equal((await run(b, `find / -maxdepth 0 ${'\\( '.repeat(256)}-true ${'\\) '.repeat(256)}`)).out, '/\n');
});

test('parentheses nested past 256 levels stop with a note instead of crashing', async () => {
  const r = await run(await shell(), `find / -maxdepth 0 ${'\\( '.repeat(20000)}-true ${'\\) '.repeat(20000)}`);
  assert.deepEqual([r.out, r.err, r.status], ['', '', 1]);
  assert.equal(r.note, 'Real find accepts deeper nesting, but the game stops at 256 levels of parentheses.');
});

test('a word where a predicate should be means a path came too late, often an unquoted pattern', async () => {
  const b = await withTree();
  const glob = await run(b, 'cd t; find . -name *');
  assert.deepEqual([glob.out, glob.err, glob.status], ['', "find: paths must precede expression: `a.txt'\nfind: possible unquoted pattern after predicate `-name'?\n", 1]);
  const two = await run(b, 'find . -name a.txt B.md');
  assert.deepEqual([two.out, two.err, two.status], ['', "find: paths must precede expression: `B.md'\nfind: possible unquoted pattern after predicate `-name'?\n", 1]);
  assert.equal((await run(b, 'find . -type f foo')).err, "find: paths must precede expression: `foo'\n");
  assert.equal((await run(b, 'find . ! -name x a.txt')).err, "find: paths must precede expression: `a.txt'\nfind: possible unquoted pattern after predicate `-name'?\n");
});
