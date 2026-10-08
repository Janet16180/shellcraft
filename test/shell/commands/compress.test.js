import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll, NOW } from '../helpers.js';
import { put, dir, file, symlink, link } from '../../../src/backend/spec.js';
import { gunzip, isGzip } from '../../../src/backend/archive.js';

const mine = { owner: 'hero' };
const home = async b => (await b.observe()).tree.children.home.children.hero.children;
const notes = 'The dragon sleeps under the mountain.\n'.repeat(20);
const world = () => shell([
  put('/home/hero/notes.txt', file(notes, { owner: 'hero', mode: 0o640 })),
  put('/home/hero/hi.txt', file('hi\n', mine)),
  put('/home/hero/ln', symlink('hi.txt', mine)),
  put('/home/hero/box', dir({ 'a.txt': file('a\n', mine), inner: dir({ 'b.txt': file('b\n', mine) }, mine) }, mine)),
]);
const outcome = r => [r.out, r.err, r.status];

test('gzip FILE replaces it with FILE.gz, keeping its mode and time, and gunzip brings it back', async () => {
  const b = await world();
  assert.deepEqual(outcome(await run(b, 'gzip notes.txt')), ['', '', 0]);
  let h = await home(b);
  assert.equal('notes.txt' in h, false);
  const gz = h['notes.txt.gz'];
  assert.equal(isGzip(gz.content), true);
  assert.equal(gunzip(gz.content).text, notes);
  assert.equal(gunzip(gz.content).name, 'notes.txt');
  assert.deepEqual([gz.mode, gz.owner, gz.mtime], [0o640, 'hero', NOW]);
  assert.ok(gz.size < notes.length / 4, `compressed to ${gz.size}`);
  assert.deepEqual(outcome(await run(b, 'gunzip notes.txt.gz')), ['', '', 0]);
  h = await home(b);
  assert.equal('notes.txt.gz' in h, false);
  assert.deepEqual([h['notes.txt'].content, h['notes.txt'].mode], [notes, 0o640]);
});

test('gzip -k keeps the original, and will not overwrite an existing .gz without -f', async () => {
  const b = await world();
  await run(b, 'gzip -k hi.txt');
  assert.deepEqual(Object.keys(await home(b)).filter(n => n.startsWith('hi')), ['hi.txt', 'hi.txt.gz']);
  const again = await run(b, 'gzip -k hi.txt');
  assert.deepEqual(outcome(again), ['', 'gzip: hi.txt.gz already exists;\tnot overwritten\n', 2]);
  assert.match(again.note, /asks/);
  assert.deepEqual(outcome(await run(b, 'gzip -kf hi.txt')), ['', '', 0]);
  assert.deepEqual(outcome(await run(b, 'gunzip --keep hi.txt.gz')), ['', 'gzip: hi.txt already exists;\tnot overwritten\n', 2]);
});

test('gzip refuses what it cannot compress with the real messages', async () => {
  const b = await world();
  await run(b, 'gzip -k hi.txt');
  assert.deepEqual(outcome(await run(b, 'gzip nosuch')), ['', 'gzip: nosuch: No such file or directory\n', 1]);
  assert.deepEqual(outcome(await run(b, 'gzip box')), ['', 'gzip: box is a directory -- ignored\n', 2]);
  assert.deepEqual(outcome(await run(b, 'gzip hi.txt.gz')), ['', 'gzip: hi.txt.gz already has .gz suffix -- unchanged\n', 2]);
  assert.deepEqual(outcome(await run(b, 'gzip ln')), ['', 'gzip: ln: Too many levels of symbolic links\n', 1]);
  assert.deepEqual(outcome(await run(b, 'gzip /etc/shadow')), ['', 'gzip: /etc/shadow: Permission denied\n', 1]);
  assert.deepEqual(outcome(await run(b, 'gzip /etc/hostname')), ['', 'gzip: /etc/hostname.gz: Permission denied\n', 1]);
  assert.deepEqual(outcome(await run(b, 'gzip nosuch box')), ['', 'gzip: nosuch: No such file or directory\ngzip: box is a directory -- ignored\n', 1]);
});

test('gzip will not compress a file with other hard links', async () => {
  const b = await shell([put('/home/hero/a', file('a\n', mine)), put('/home/hero/b', link('/home/hero/a'))]);
  assert.deepEqual(outcome(await run(b, 'gzip a')), ['', 'gzip: a has 1 other link -- file ignored\n', 2]);
});

test('gzip -v and gunzip -v report the ratio and what they did', async () => {
  const b = await world();
  const r = await run(b, 'gzip -v notes.txt');
  assert.match(r.err, /^notes\.txt:\t {1,2}\d+\.\d% -- replaced with notes\.txt\.gz\n$/);
  assert.match((await run(b, 'gunzip -kv notes.txt.gz')).err, /^notes\.txt\.gz:\t {1,2}\d+\.\d% -- created notes\.txt\n$/);
  assert.match((await run(b, 'gzip -v hi.txt')).err, /^hi\.txt:\t-\d+\.\d% -- replaced with hi\.txt\.gz\n$/);
});

test('gunzip finds FILE.gz for a bare name, maps .tgz to .tar, and refuses other suffixes and non-gzip data', async () => {
  const b = await world();
  await run(b, 'gzip hi.txt');
  assert.deepEqual(outcome(await run(b, 'gunzip hi.txt')), ['', '', 0]);
  assert.equal((await home(b))['hi.txt'].content, 'hi\n');
  assert.deepEqual(outcome(await run(b, 'gunzip hi.txt')), ['', 'gzip: hi.txt: unknown suffix -- ignored\n', 2]);
  assert.deepEqual(outcome(await run(b, 'gunzip nosuch')), ['', 'gzip: nosuch.gz: No such file or directory\n', 1]);
  await runAll(b, ['gzip hi.txt', 'mv hi.txt.gz hi.tgz', 'gunzip hi.tgz']);
  assert.equal((await home(b))['hi.tar'].content, 'hi\n');
  await run(b, 'cp hi.tar fake.gz');
  assert.deepEqual(outcome(await run(b, 'gunzip fake.gz')), ['', 'gzip: fake.gz: not in gzip format\n', 1]);
  assert.deepEqual(outcome(await run(b, 'gzip -d fake.gz')), ['', 'gzip: fake.gz: not in gzip format\n', 1]);
});

test('gunzip reports a cut-short file as the end of the data', async () => {
  const b = await world();
  await run(b, 'gzip notes.txt');
  await run(b, 'head -c 30 notes.txt.gz > cut.gz');
  assert.deepEqual(outcome(await run(b, 'gunzip cut.gz')), ['', 'gzip: cut.gz: unexpected end of file\n', 1]);
});

test('zcat prints the original text and leaves the file alone', async () => {
  const b = await world();
  await runAll(b, ['gzip hi.txt', 'gzip -k notes.txt']);
  assert.deepEqual(outcome(await run(b, 'zcat hi.txt.gz hi.txt')), ['hi\nhi\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'zcat notes.txt')), ['', 'gzip: notes.txt: not in gzip format\n', 1]);
  assert.equal((await run(b, 'gunzip -c notes.txt.gz | wc -l')).out, '20\n');
  assert.equal('hi.txt.gz' in await home(b), true);
});

test('gzip -c writes to a pipe or file but not to the terminal', async () => {
  const b = await world();
  assert.deepEqual(outcome(await run(b, 'gzip -c hi.txt')), ['', 'gzip: compressed data not written to a terminal. Use -f to force compression.\nFor help, type: gzip -h\n', 1]);
  await run(b, 'gzip -c hi.txt > copy.gz');
  const h = await home(b);
  assert.equal(gunzip(h['copy.gz'].content).text, 'hi\n');
  assert.equal(h['hi.txt'].content, 'hi\n');
  assert.equal((await run(b, 'cat hi.txt | gzip | zcat')).out, 'hi\n');
});

test('gzip -l lists compressed and original sizes, the ratio and the name', async () => {
  const b = await world();
  await runAll(b, ['gzip hi.txt', 'gzip notes.txt']);
  const r = await run(b, 'gzip -l hi.txt.gz notes.txt.gz');
  const [head, one, two, total] = r.out.split('\n');
  assert.equal(head, '         compressed        uncompressed  ratio uncompressed_name');
  assert.match(one, /^ {16,17}\d{2,3} {19}3 -\d+\.\d% hi\.txt$/);
  assert.match(two, /^ +\d+ +760 +\d+\.\d% notes\.txt$/);
  assert.match(total, /^ +\d+ +763 +\d+\.\d% \(totals\)$/);
});

test('gzip -r compresses every file below a directory, and gunzip -r undoes it', async () => {
  const b = await world();
  await run(b, 'gzip -r box');
  let h = await home(b);
  assert.deepEqual(Object.keys(h.box.children).sort(), ['a.txt.gz', 'inner']);
  assert.deepEqual(Object.keys(h.box.children.inner.children), ['b.txt.gz']);
  await run(b, 'gunzip -r box');
  h = await home(b);
  assert.deepEqual(Object.keys(h.box.children.inner.children), ['b.txt']);
});

test('ls -l and wc -c show the compressed size', async () => {
  const b = await world();
  await run(b, 'gzip notes.txt');
  const size = (await home(b))['notes.txt.gz'].size;
  assert.equal((await run(b, 'wc -c notes.txt.gz')).out, `${size} notes.txt.gz\n`);
  assert.match((await run(b, 'ls -l notes.txt.gz')).out, new RegExp(` ${size} `));
});
