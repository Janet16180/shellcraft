import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll, NOW } from '../helpers.js';
import { put, dir, file, symlink } from '../../../src/backend/spec.js';
import { archiveMembers, isGzip } from '../../../src/backend/archive.js';

const mine = { owner: 'hero' };
const home = async b => (await b.observe()).tree.children.home.children.hero.children;
const world = () => shell([
  put('/home/hero/box', dir({
    'a.txt': file('apple\n', mine),
    'run.sh': file('echo run\n', { owner: 'hero', mode: 0o755 }),
    inner: dir({ 'b.txt': file('bread\n', mine) }, mine),
    ln: symlink('a.txt', mine),
  }, mine)),
  put('/home/hero/secret.txt', file('mine only\n', { owner: 'hero', mode: 0o600 })),
  put('/srv', dir({ 'open.txt': file('anyone\n', { mode: 0o666 }) })),
]);
const outcome = r => [r.out, r.err, r.status];
const BOX = 'box/\nbox/a.txt\nbox/inner/\nbox/inner/b.txt\nbox/ln\nbox/run.sh\n';
const EXITING = 'tar: Exiting with failure status due to previous errors\n';
const FATAL = 'tar: Error is not recoverable: exiting now\n';
const TRY = "Try 'tar --help' or 'tar --usage' for more information.\n";

test('tar -cf makes an archive of a directory, recursively, and -tf lists its members in order', async () => {
  const b = await world();
  assert.deepEqual(outcome(await run(b, 'tar -cf box.tar box')), ['', '', 0]);
  const tar = (await home(b))['box.tar'];
  assert.deepEqual([tar.size, tar.owner, tar.mode], [10240, 'hero', 0o644]);
  assert.deepEqual(archiveMembers(tar.content).map(m => [m.path, m.type]), [
    ['box/', 'dir'], ['box/a.txt', 'file'], ['box/inner/', 'dir'], ['box/inner/b.txt', 'file'], ['box/ln', 'symlink'], ['box/run.sh', 'file'],
  ]);
  assert.deepEqual(outcome(await run(b, 'tar -tf box.tar')), [BOX, '', 0]);
});

test('every way of writing the options a beginner meets means the same', async () => {
  const b = await world();
  for (const line of ['tar czf b1.tgz box', 'tar -czf b2.tgz box', 'tar -c -z -f b3.tgz box', 'tar --create --gzip --file=b4.tgz box', 'tar --create --gzip --file b5.tgz box', 'tar -zcf b6.tgz box', 'tar -cf b7.tgz box -z']) {
    assert.deepEqual(outcome(await run(b, line)), ['', '', 0], line);
  }
  for (const name of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']) assert.equal(isGzip((await home(b))[`${name}.tgz`].content), true, name);
  for (const line of ['tar -tzf b1.tgz', 'tar tzf b2.tgz', 'tar -tf b3.tgz', 'tar --list --file=b4.tgz', 'tar --list -z --file b5.tgz', 'tar -t -f b6.tgz']) {
    assert.deepEqual(outcome(await run(b, line)), [BOX, '', 0], line);
  }
});

test('a compressed archive is far smaller than the plain one and looks like gzip data', async () => {
  const b = await world();
  await runAll(b, ['tar -cf box.tar box', 'tar -czf box.tar.gz box']);
  const h = await home(b);
  assert.ok(h['box.tar.gz'].size > 100 && h['box.tar.gz'].size < 400, `size ${h['box.tar.gz'].size}`);
  const cat = (await run(b, 'cat box.tar.gz')).out;
  assert.equal(cat.includes('apple'), false);
  assert.equal(cat.startsWith('\u001f\u008b'), true);
});

test('tar -tv prints the long listing: mode, owner/group, size, date, name, and a link\'s target', async () => {
  const b = await world();
  await run(b, 'tar -cf box.tar box');
  assert.equal((await run(b, 'tar -tvf box.tar')).out, [
    'drwxr-xr-x hero/hero         0 2026-10-06 10:00 box/',
    '-rw-r--r-- hero/hero         6 2026-10-06 10:00 box/a.txt',
    'drwxr-xr-x hero/hero         0 2026-10-06 10:00 box/inner/',
    '-rw-r--r-- hero/hero         6 2026-10-06 10:00 box/inner/b.txt',
    'lrwxrwxrwx hero/hero         0 2026-10-06 10:00 box/ln -> a.txt',
    '-rwxr-xr-x hero/hero         9 2026-10-06 10:00 box/run.sh',
  ].join('\n') + '\n');
});

test('tar -cv and -xv name each member as they go', async () => {
  const b = await world();
  assert.deepEqual(outcome(await run(b, 'tar -cvf box.tar box')), [BOX, '', 0]);
  await run(b, 'rm -r box');
  assert.deepEqual(outcome(await run(b, 'tar -xvf box.tar')), [BOX, '', 0]);
});

test('tar -x recreates files, directories and links with their stored modes, times and contents', async () => {
  const b = await world();
  await runAll(b, ['tar -czf box.tgz box', 'rm -r box', 'mkdir out']);
  assert.deepEqual(outcome(await run(b, 'tar -xzf box.tgz -C out')), ['', '', 0]);
  const box = (await home(b)).out.children.box;
  assert.equal(box.children['a.txt'].content, 'apple\n');
  assert.deepEqual([box.children['run.sh'].mode, box.children['run.sh'].mtime], [0o755, NOW]);
  assert.equal(box.children.inner.children['b.txt'].content, 'bread\n');
  assert.deepEqual([box.children.ln.type, box.children.ln.target], ['symlink', 'a.txt']);
  assert.equal((await run(b, 'cat out/box/ln')).out, 'apple\n');
});

test('tar -x overwrites existing files, even read-only ones in a directory you may write', async () => {
  const b = await world();
  await runAll(b, ['tar -cf box.tar box', 'echo changed > box/a.txt', 'chmod 444 box/a.txt']);
  assert.deepEqual(outcome(await run(b, 'tar -xf box.tar')), ['', '', 0]);
  const a = (await home(b)).box.children['a.txt'];
  assert.deepEqual([a.content, a.mode], ['apple\n', 0o644]);
});

test('tar -c strips a leading slash with the real message; -x as a player makes the files yours, masked by the umask', async () => {
  const b = await world();
  const r = await run(b, 'tar -cf etc.tar /etc/hostname');
  assert.deepEqual(outcome(r), ['', "tar: Removing leading `/' from member names\n", 0]);
  assert.equal((await run(b, 'tar -tf etc.tar')).out, 'etc/hostname\n');
  assert.match((await run(b, 'tar -tvf etc.tar')).out, /^-rw-r--r-- root\/root /);
  await run(b, 'tar -xf etc.tar');
  const host = (await home(b)).etc.children.hostname;
  assert.deepEqual([host.owner, host.group, host.mode, host.content], ['hero', 'hero', 0o644, 'kernelia\n']);
  await runAll(b, ['tar -cf open.tar -C /srv open.txt', 'tar -xf open.tar']);
  const open = (await home(b))['open.txt'];
  assert.deepEqual([open.owner, open.mode], ['hero', 0o644]);
});

test('a missing file is reported, the rest is archived, and tar exits 2', async () => {
  const b = await world();
  const r = await run(b, 'tar -cf x.tar nosuch box/a.txt');
  assert.deepEqual(outcome(r), ['', `tar: nosuch: Cannot stat: No such file or directory\n${EXITING}`, 2]);
  assert.equal((await run(b, 'tar -tf x.tar')).out, 'box/a.txt\n');
});

test('files and directories you may not read are left out with Permission denied', async () => {
  const b = await world();
  await run(b, 'mkdir locked && chmod 000 locked');
  const r = await run(b, 'tar -cf x.tar /etc/shadow locked box/a.txt');
  assert.equal(r.err, `tar: Removing leading \`/' from member names\ntar: /etc/shadow: Cannot open: Permission denied\ntar: locked: Cannot open: Permission denied\n${EXITING}`);
  assert.equal(r.status, 2);
  assert.equal((await run(b, 'tar -tf x.tar')).out, 'box/a.txt\n');
});

test('tar refuses to write an archive to the terminal or read one from it', async () => {
  const b = await world();
  const refusing = "tar: Refusing to write archive contents to terminal (missing -f option?)\n";
  assert.deepEqual(outcome(await run(b, 'tar -c box')), ['', refusing + FATAL, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -cz box')), ['', refusing + FATAL, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -cf - box')), ['', refusing + FATAL, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -t')), ['', `tar: Refusing to read archive contents from terminal (missing -f option?)\n${FATAL}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -xz')), ['', `tar: Refusing to read archive contents from terminal (missing -f option?)\n${FATAL}`, 2]);
});

test('an archive can go through a pipe or a redirection, and -v then writes to standard error', async () => {
  const b = await world();
  assert.deepEqual(outcome(await run(b, 'tar -c box | tar -t')), [BOX, '', 0]);
  assert.deepEqual(outcome(await run(b, 'tar -czf - box | tar -tzf -')), [BOX, '', 0]);
  const r = await run(b, 'tar -cv box > box.tar');
  assert.deepEqual(outcome(r), ['', BOX, 0]);
  assert.equal((await home(b))['box.tar'].size, 10240);
  assert.equal((await run(b, 'tar -t < box.tar')).out, BOX);
});

test('reading what is not a tar archive, or not gzip data with -z, fails like GNU tar', async () => {
  const b = await world();
  assert.deepEqual(outcome(await run(b, 'tar -tf box/a.txt')), ['', `tar: This does not look like a tar archive\n${EXITING}`, 2]);
  await run(b, 'tar -cf box.tar box');
  assert.deepEqual(outcome(await run(b, 'tar -tzf box.tar')), ['', `gzip: stdin: not in gzip format\ntar: Child returned status 1\n${FATAL}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -tf nosuch.tar')), ['', `tar: nosuch.tar: Cannot open: No such file or directory\n${FATAL}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -tf box')), ['', `tar: box: Cannot read: Is a directory\ntar: At beginning of tape, quitting now\n${FATAL}`, 2]);
  await run(b, 'chmod 000 box.tar');
  assert.deepEqual(outcome(await run(b, 'tar -tf box.tar')), ['', `tar: box.tar: Cannot open: Permission denied\n${FATAL}`, 2]);
});

test('writing the archive where it cannot go stops tar at once', async () => {
  const b = await world();
  assert.deepEqual(outcome(await run(b, 'tar -cf /etc/x.tar box')), ['', `tar: /etc/x.tar: Cannot open: Permission denied\n${FATAL}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -cf nodir/x.tar box')), ['', `tar: nodir/x.tar: Cannot open: No such file or directory\n${FATAL}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -cf box box/a.txt')), ['', `tar: box: Cannot open: Is a directory\n${FATAL}`, 2]);
});

test('extracting where you may not write reports each member', async () => {
  const b = await world();
  await run(b, 'tar -cf ~/a.tar -C box a.txt');
  await run(b, 'cd /etc');
  assert.deepEqual(outcome(await run(b, 'tar -xf ~/a.tar')), ['', `tar: a.txt: Cannot open: Permission denied\n${EXITING}`, 2]);
});

test('-C changes directory for the files after it when creating, and for extracting', async () => {
  const b = await world();
  await run(b, 'tar -cf in.tar -C box inner a.txt');
  assert.equal((await run(b, 'tar -tf in.tar')).out, 'inner/\ninner/b.txt\na.txt\n');
  await runAll(b, ['mkdir dest', 'tar -xf in.tar --directory=dest']);
  assert.equal((await home(b)).dest.children.inner.children['b.txt'].content, 'bread\n');
  assert.deepEqual(outcome(await run(b, 'tar -xf in.tar -C nowhere')), ['', `tar: nowhere: Cannot open: No such file or directory\n${FATAL}`, 2]);
});

test('naming members lists or extracts only those, and a missing one is an error', async () => {
  const b = await world();
  await run(b, 'tar -cf box.tar box');
  assert.equal((await run(b, 'tar -tf box.tar box/inner')).out, 'box/inner/\nbox/inner/b.txt\n');
  assert.deepEqual(outcome(await run(b, 'tar -tf box.tar box/a.txt nosuch')), ['box/a.txt\n', `tar: nosuch: Not found in archive\n${EXITING}`, 2]);
  await runAll(b, ['mkdir one', 'tar -xf box.tar -C one box/a.txt']);
  assert.deepEqual(Object.keys((await home(b)).one.children.box.children), ['a.txt']);
});

test('--exclude leaves out matching names at any depth', async () => {
  const b = await world();
  await run(b, "tar -cf x.tar --exclude='*.txt' --exclude=inner box");
  assert.equal((await run(b, 'tar -tf x.tar')).out, 'box/\nbox/ln\nbox/run.sh\n');
});

test('the archive is not put inside itself', async () => {
  const b = await world();
  const r = await run(b, 'tar -cf box/self.tar box');
  assert.deepEqual(outcome(r), ['', 'tar: box/self.tar: archive cannot contain itself; not dumped\n', 0]);
  assert.equal((await run(b, 'tar -tf box/self.tar')).out, BOX);
});

test('option mistakes get GNU tar\'s messages and statuses', async () => {
  const b = await world();
  assert.deepEqual(outcome(await run(b, 'tar')), ['', `tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\n${TRY}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -f x.tar')), ['', `tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\n${TRY}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -cxf x.tar box')), ['', `tar: You may not specify more than one '-Acdtrux', '--delete' or  '--test-label' option\n${TRY}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -cf x.tar')), ['', `tar: Cowardly refusing to create an empty archive\n${TRY}`, 2]);
  assert.deepEqual(outcome(await run(b, 'tar -cf')), ['', `tar: option requires an argument -- 'f'\n${TRY}`, 64]);
  assert.deepEqual(outcome(await run(b, 'tar -cqf x.tar box')), ['', `tar: invalid option -- 'q'\n${TRY}`, 64]);
  assert.deepEqual(outcome(await run(b, 'tar --bogus')), ['', `tar: unrecognized option '--bogus'\n${TRY}`, 64]);
  assert.deepEqual(outcome(await run(b, 'tar --li -f x.tar')), ['', `tar: option '--li' is ambiguous; possibilities: '--list' '--listed-incremental'\n${TRY}`, 64]);
  assert.deepEqual(outcome(await run(b, 'tar --cre --file=y.tar box')), ['', '', 0]);
  assert.match((await run(b, 'tar -cjf x.tar box')).note, /tar -j is a real option/);
});

test('the archive file is opaque: cat shows none of the stored names or text', async () => {
  const b = await world();
  await run(b, 'tar -cf box.tar box');
  const shown = (await run(b, 'cat box.tar')).out;
  assert.equal(shown.length, 10240);
  assert.equal(/apple|bread|a\.txt/.test(shown), false);
});
