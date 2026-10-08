import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';
import { put, file, dir, symlink } from '../../../src/backend/spec.js';

const mine = { owner: 'hero' };
const market = () => shell([put('/home/hero/inv.txt', file('potion\nsword\napple\npotion\nShield\n10 arrows\na+b\n', mine))]);

test('a basic pattern treats + as a literal character, as the game teaches', async () => {
  const b = await market();
  assert.equal((await run(b, "grep 'a+' inv.txt")).out, 'a+b\n');
  assert.equal((await run(b, "grep -E 'o+n' inv.txt")).out, 'potion\npotion\n');
  assert.equal((await run(b, "grep 'o\\+n' inv.txt")).out, 'potion\npotion\n');
  assert.equal((await run(b, "grep -F 'a+' inv.txt")).out, 'a+b\n');
});

test('-i, -v, -n, -c, -w, -x and -o change the selection and the output', async () => {
  const b = await market();
  assert.equal((await run(b, 'grep -i shield inv.txt')).out, 'Shield\n');
  assert.equal((await run(b, 'grep -c potion inv.txt')).out, '2\n');
  assert.equal((await run(b, 'grep -n sword inv.txt')).out, '2:sword\n');
  assert.equal((await run(b, 'grep -vc o inv.txt')).out, '3\n');
  assert.equal((await run(b, 'grep -w pot inv.txt')).status, 1);
  assert.equal((await run(b, 'grep -x potion inv.txt')).out, 'potion\npotion\n');
  assert.equal((await run(b, "grep -o 'p[a-z]*' inv.txt")).out, 'potion\npple\npotion\n');
});

test('-e gives several patterns; -q prints nothing and only sets the status', async () => {
  const b = await market();
  assert.equal((await run(b, 'grep -e sword -e apple inv.txt')).out, 'sword\napple\n');
  const q = await run(b, 'grep -q sword inv.txt');
  assert.deepEqual([q.out, q.status], ['', 0]);
});

test('the status is 1 without a match and 2 on an error', async () => {
  const b = await market();
  assert.equal((await run(b, 'grep zzz inv.txt')).status, 1);
  const missing = await run(b, 'grep x nope');
  assert.deepEqual([missing.err, missing.status], ['grep: nope: No such file or directory\n', 2]);
  assert.deepEqual(await run(b, 'grep x forest').then(r => [r.err, r.status]), ['grep: forest: Is a directory\n', 2]);
});

test('a malformed pattern gives the GNU message and status 2', async () => {
  const b = await market();
  const r = await run(b, "grep -E '(' inv.txt");
  assert.deepEqual([r.err, r.status], ['grep: Unmatched ( or \\(\n', 2]);
});

test('several files, or -r, label each line with its file; -h drops the label', async () => {
  const b = await shell([put('/home/hero/d', dir({ 'a.txt': file('key\n', mine), sub: dir({ 'b.txt': file('a key\n', mine) }, mine) }, mine))]);
  assert.equal((await run(b, 'grep -r key d')).out, 'd/a.txt:key\nd/sub/b.txt:a key\n');
  assert.equal((await run(b, 'grep -rh key d')).out, 'key\na key\n');
  assert.equal((await run(b, 'grep -l key d/a.txt d/sub/b.txt readme.txt')).out, 'd/a.txt\nd/sub/b.txt\n');
  assert.equal((await run(b, 'cd d; grep -r key')).out, 'a.txt:key\nsub/b.txt:a key\n');
});

test('grep reads piped input and highlights matches in the markup', async () => {
  const b = await market();
  const r = await b.run('cat inv.txt | grep word');
  assert.equal(r.output[0].text, 'sword\n');
  assert.equal(r.output[0].html, 's<span class="g-match">word</span>\n');
});

test('highlighting escapes the text around each match, never inside it', async () => {
  const b = await shell([put('/home/hero/q.txt', file('say "quoted" <lt> & amp\n', { owner: 'hero' }))]);
  const html = async line => (await b.run(line)).output[0].html;
  const rest = '<span class="g-match">';
  assert.equal(await html('grep quot q.txt'), `say &quot;${rest}quot</span>ed&quot; &lt;lt&gt; &amp; amp\n`);
  assert.equal(await html('grep amp q.txt'), `say &quot;quoted&quot; &lt;lt&gt; &amp; ${rest}amp</span>\n`);
  assert.equal(await html('grep "<lt>" q.txt'), `say &quot;quoted&quot; ${rest}&lt;lt&gt;</span> &amp; amp\n`);
  assert.equal(await html('grep "&" q.txt'), `say &quot;quoted&quot; &lt;lt&gt; ${rest}&amp;</span> amp\n`);
  assert.equal(await html('grep -o \'"\' q.txt'), `${rest}&quot;</span>\n${rest}&quot;</span>\n`);
});

test('unknown options are rejected with the usage line', async () => {
  const r = await run(await market(), 'grep -k x inv.txt');
  assert.deepEqual([r.err, r.status], ["grep: invalid option -- 'k'\nUsage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n", 2]);
});

test('grep -e without a pattern reports the missing argument', async () => {
  const r = await run(await shell(), 'grep -e');
  assert.deepEqual([r.err, r.status], ["grep: option requires an argument -- 'e'\nUsage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n", 2]);
});

test('grep -r passes by links inside the directory, but follows one it is given', async () => {
  const b = await shell([put('/home/hero/t', dir({
    'a.txt': file('key\n', mine), sub: dir({ 'b.txt': file('key\n', mine) }, mine), portal: symlink('sub', mine), broken: symlink('nowhere', mine),
  }, mine))]);
  assert.deepEqual(await run(b, 'grep -r key t').then(r => [r.out, r.err, r.status]), ['t/a.txt:key\nt/sub/b.txt:key\n', '', 0]);
  assert.equal((await run(b, 'grep -r key t/portal')).out, 't/portal/b.txt:key\n');
});

test('grep -R follows links inside the directory, warns about a loop and names a dangling one', async () => {
  const b = await shell([put('/home/hero/t', dir({
    'a.txt': file('key\n', mine), sub: dir({ 'b.txt': file('key\n', mine), up: symlink('..', mine) }, mine), portal: symlink('sub', mine), broken: symlink('nowhere', mine),
  }, mine))]);
  const r = await run(b, 'grep -R key t');
  assert.equal(r.out, 't/a.txt:key\nt/portal/b.txt:key\nt/sub/b.txt:key\n');
  assert.equal(r.err, "grep: t/broken: No such file or directory\ngrep: warning: t/portal/up: recursive directory loop\ngrep: warning: t/sub/up: recursive directory loop\n");
});
