import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { put, dir, file, symlink } from '../../../src/backend/spec.js';

const mine = { owner: 'hero' };
const outcome = r => [r.out, r.err, r.status];

test('du counts 4.0K blocks: one per directory, whole blocks per file, nothing for a link', async () => {
  const b = await shell([put('/home/hero/d', dir({
    'a.txt': file('hello\n', mine),
    'big': file('x'.repeat(5000), mine),
    'ln': symlink('a.txt', mine),
    'empty': file('', mine),
    sub: dir({ 'b.txt': file('b\n', mine) }, mine),
  }, mine))]);
  assert.deepEqual(outcome(await run(b, 'du d')), ['8\td/sub\n24\td\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'du -s d')), ['24\td\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'du -sh d')), ['24K\td\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'du -h d')), ['8.0K\td/sub\n24K\td\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'du -a d')), ['4\td/a.txt\n8\td/big\n0\td/empty\n0\td/ln\n4\td/sub/b.txt\n8\td/sub\n24\td\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'du -sh d/a.txt d/sub')), ['4.0K\td/a.txt\n8.0K\td/sub\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'du -c d/sub d/big')), ['8\td/sub\n8\td/big\n16\ttotal\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'du --max-depth=0 d')), ['24\td\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'du -d 1 -h d')), ['8.0K\td/sub\n24K\td\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'cd d; du')), ['8\t./sub\n24\t.\n', '', 0]);
});

test('du reports what it cannot read or find', async () => {
  const b = await shell();
  assert.deepEqual(outcome(await run(b, 'du nosuch')), ['', "du: cannot access 'nosuch': No such file or directory\n", 1]);
  assert.deepEqual(outcome(await run(b, 'du -sh /root')), ['4.0K\t/root\n', "du: cannot read directory '/root': Permission denied\n", 1]);
  assert.deepEqual(outcome(await run(b, 'du -d x')), ['', "du: invalid maximum depth \u2018x\u2019\nTry 'du --help' for more information.\n", 1]);
});

test('df -h prints a fixed table of the machine\'s filesystems; df PATH the one it is on', async () => {
  const b = await shell();
  const all = await run(b, 'df');
  assert.equal(all.status, 0);
  assert.match(all.out, /^Filesystem {5}1K-blocks +Used Available Use% Mounted on\n/);
  assert.match(all.out, /\n\/dev\/sda2 +\d+ +\d+ +\d+ +\d+% \/\n/);
  const human = await run(b, 'df -h');
  assert.match(human.out, /^Filesystem +Size +Used Avail Use% Mounted on\n/);
  assert.match(human.out, /\n\/dev\/sda2 +\d+G +\d+(\.\d)?G +\d+G +\d+% \/\n/);
  const here = await run(b, 'df -h .');
  assert.equal(here.out.split('\n').length, 3);
  assert.match(here.out, / \/\n$/);
  assert.deepEqual(outcome(await run(b, 'df nosuch')), ['', 'df: nosuch: No such file or directory\n', 1]);
  assert.match((await run(b, 'df -T /tmp')).out, /^Filesystem {5}Type 1K-blocks +Used Available Use% Mounted on\n\/dev\/sda2 {6}ext4 +\d+/);
});
