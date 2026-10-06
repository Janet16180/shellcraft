import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, NOW } from '../helpers.js';
import { put, dir, file } from '../../../src/backend/spec.js';
import { humanSize } from '../../../src/shell/commands/ls.js';

const mine = { owner: 'hero' };
const names = () => shell([put('/home/hero/names', dir({
  '10.txt': file('', mine), '9.txt': file('', mine), B: dir({}, mine), 'Banana.txt': file('', mine), Zebra: dir({}, mine),
  _under: file('', mine), 'a$b': file('', mine), 'apple.txt': file('', mine), cherry: file('', mine), "it's": file('', mine),
  'my notes.txt': file('', mine), 'run.sh': file('', { owner: 'hero', mode: 0o755 }), '.hidden': file('', mine), 'tab\tx': file('', mine),
}, mine))]);

test('names sort in C.UTF-8 byte order and fill terminal columns', async () => {
  const r = await run(await names(), 'ls names');
  assert.equal(r.out, " 10.txt   Banana.txt  'a$b'\t  \"it's\"\t  'tab'$'\\t''x'\n 9.txt\t  Zebra        apple.txt  'my notes.txt'\n B\t  _under       cherry\t   run.sh\n");
});

test('COLUMNS sets the width of the column layout', async () => {
  const b = await names();
  await run(b, 'COLUMNS=40');
  assert.equal((await run(b, 'ls names')).out, " 10.txt       _under\t 'my notes.txt'\n 9.txt\t     'a$b'\t  run.sh\n B\t      apple.txt  'tab'$'\\t''x'\n Banana.txt   cherry\n Zebra\t     \"it's\"\n");
});

test('into a pipe or with -1, ls prints one name per line; quotes only on the terminal', async () => {
  const b = await names();
  assert.equal((await run(b, 'ls names | cat')).out, "10.txt\n9.txt\nB\nBanana.txt\nZebra\n_under\na$b\napple.txt\ncherry\nit's\nmy notes.txt\nrun.sh\ntab\tx\n");
  assert.equal((await run(b, 'ls -1 names')).out, "10.txt\n9.txt\nB\nBanana.txt\nZebra\n_under\n'a$b'\napple.txt\ncherry\n\"it's\"\n'my notes.txt'\nrun.sh\n'tab'$'\\t''x'\n");
});

test('-a adds . and .. and hidden names, -A only hidden names, -r reverses', async () => {
  const b = await shell();
  assert.equal((await run(b, 'ls -a')).out, '.  ..  .secret_map  forest  readme.txt\n');
  assert.equal((await run(b, 'ls -A')).out, '.secret_map  forest  readme.txt\n');
  assert.equal((await run(b, 'ls -r')).out, 'readme.txt  forest\n');
});

test('-F marks directories with / and executables with *', async () => {
  assert.equal((await run(await names(), 'ls -F names | head -n 3')).out, '10.txt\n9.txt\nB/\n');
});

test('-l prints mode, links, owner, group, size and time with aligned columns', async () => {
  const r = await run(await shell(), 'ls -l');
  assert.equal(r.out, 'total 8\ndrwxr-xr-x 3 hero hero 4096 Oct  6 10:00 forest\n-rw-r--r-- 1 hero hero   26 Oct  6 10:00 readme.txt\n');
});

test('-l pads unquoted names when another name needs quotes', async () => {
  const lines = (await run(await names(), 'ls -l names')).out.split('\n');
  assert.ok(lines.includes('-rw-r--r-- 1 hero hero    0 Oct  6 10:00  cherry'));
  assert.ok(lines.includes('-rw-r--r-- 1 hero hero    0 Oct  6 10:00 "it\'s"'));
  assert.ok(lines.includes("-rw-r--r-- 1 hero hero    0 Oct  6 10:00 'my notes.txt'"));
  assert.ok(lines.includes('drwxr-xr-x 2 hero hero 4096 Oct  6 10:00  B'));
});

test('-la counts 1K blocks in its total, including . and ..', async () => {
  const r = await run(await shell(), 'ls -la');
  assert.equal(r.out.split('\n')[0], 'total 20');
  assert.match(r.out, /^drwxr-x--- 3 hero hero 4096 Oct {2}6 10:00 \.$/m);
  assert.match(r.out, /^drwxr-xr-x 3 root root 4096 Oct {2}6 10:00 \.\.$/m);
});

test('-h prints sizes like 4.0K and the total like 8.0K', async () => {
  const b = await shell([put('/home/hero/big.txt', file('x'.repeat(10241), mine))]);
  const r = await run(b, 'ls -lh');
  assert.equal(r.out.split('\n')[0], 'total 20K');
  assert.match(r.out, / 11K Oct {2}6 10:00 big\.txt$/m);
  assert.match(r.out, / 4\.0K Oct {2}6 10:00 forest$/m);
  assert.equal(humanSize(73), '73');
  assert.equal(humanSize(1025), '1.1K');
  assert.equal(humanSize(8192), '8.0K');
  assert.equal(humanSize(10240), '10K');
  assert.equal(humanSize(5 * 1024 * 1024), '5.0M');
});

test('files older than six months show the year instead of the time', async () => {
  let clock = Date.UTC(2025, 8, 25, 10);
  const b = await shell([], { now: () => clock });
  await b.load([put('/home/hero/old.txt', file('', mine))]);
  clock = NOW;
  await b.load([put('/home/hero/new.txt', file('', mine))]);
  const r = await run(b, 'ls -l old.txt new.txt');
  assert.equal(r.out, '-rw-r--r-- 1 hero hero 0 Oct  6 10:00 new.txt\n-rw-r--r-- 1 hero hero 0 Sep 25  2025 old.txt\n');
});

test('the sticky bit shows as t and setuid as s', async () => {
  const b = await shell([put('/srv', dir({ s: file('', { mode: 0o4755 }) }))]);
  assert.match((await run(b, 'ls -ld /tmp')).out, /^drwxrwxrwt /);
  assert.match((await run(b, 'ls -l /srv')).out, /^-rwsr-xr-x /m);
});

test('/dev/null is a character device', async () => {
  assert.match((await run(await shell(), 'ls -l /dev/null')).out, /^crw-rw-rw- 1 root root 1, 3 Oct {2}6 10:00 \/dev\/null\n$/);
});

test('operands: files first, then each directory under a header, errors quoted', async () => {
  const r = await run(await shell(), 'ls nope forest readme.txt');
  assert.equal(r.err, "ls: cannot access 'nope': No such file or directory\n");
  assert.equal(r.status, 2);
  assert.equal(r.out, 'readme.txt\n\nforest:\ncave  mushroom.txt\n');
});

test('-d lists directories themselves', async () => {
  assert.equal((await run(await shell(), 'ls -d forest /tmp')).out, '/tmp  forest\n');
});

test('long options work like their letters; unknown ones are rejected', async () => {
  const b = await shell();
  assert.equal((await run(b, 'ls --all')).out, (await run(b, 'ls -a')).out);
  const bad = await run(b, 'ls --nope');
  assert.deepEqual([bad.err, bad.status], ["ls: unrecognized option '--nope'\nTry 'ls --help' for more information.\n", 2]);
  assert.equal((await run(b, 'ls -z')).err, "ls: invalid option -- 'z'\nTry 'ls --help' for more information.\n");
});

test('an unreadable directory, or a path through one, is refused', async () => {
  const b = await shell();
  assert.equal((await run(b, 'ls /root')).err, "ls: cannot open directory '/root': Permission denied\n");
  assert.equal((await run(b, 'ls /root/secret.txt')).err, "ls: cannot access '/root/secret.txt': Permission denied\n");
});

test('dir lists in columns even into a pipe, escaping spaces with a backslash', async () => {
  const r = await run(await shell([put('/home/hero/my notes.txt', file('', mine))]), 'dir | cat');
  assert.equal(r.out, 'forest\tmy\\ notes.txt  readme.txt\n');
});

test('ls output carries coloured markup for directories and executables', async () => {
  const r = await (await names()).run('ls -1 names');
  assert.match(r.output[0].html, /<span class="c-dir">B<\/span>/);
  assert.match(r.output[0].html, /<span class="c-exe">run\.sh<\/span>/);
});
