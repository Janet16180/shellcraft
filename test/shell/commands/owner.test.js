import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, guild } from '../helpers.js';
import { put, dir, file, login, symlink } from '../../../src/backend/spec.js';

const outcome = r => [r.out, r.err, r.status];
const mine = { owner: 'hero' };
const ownerOf = async (b, path) => (await run(b, `ls -ld ${path}`)).out.split(/ +/).slice(2, 4).join(':');

const hall = () => shell([...guild(), put('/home/hero/hall', dir({
  'f': file('f\n', mine),
  'theirs': file('t\n', { owner: 'mira', group: 'smiths' }),
  'd': dir({ e: dir({ z: file('', mine) }, mine) }, mine),
  'nr': dir({ in: file('', mine) }, { owner: 'hero', mode: 0o300 }),
  'nx': dir({ in: file('', mine) }, { owner: 'hero', mode: 0o600 }),
}, mine))]);

test('chgrp to a group you belong to, on a file you own', async () => {
  const b = await hall();
  assert.deepEqual(outcome(await run(b, 'chgrp scribes hall/f')), ['', '', 0]);
  assert.equal(await ownerOf(b, 'hall/f'), 'hero:scribes');
  assert.deepEqual(outcome(await run(b, 'chgrp 1000 hall/f')), ['', '', 0]);
  assert.equal(await ownerOf(b, 'hall/f'), 'hero:hero');
});

test('chgrp refuses a group you are not in, or a file you do not own', async () => {
  const b = await hall();
  assert.deepEqual(outcome(await run(b, 'chgrp smiths hall/f')), ['', "chgrp: changing group of 'hall/f': Operation not permitted\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chgrp scribes hall/theirs')), ['', "chgrp: changing group of 'hall/theirs': Operation not permitted\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chgrp 9999 hall/f')), ['', "chgrp: changing group of 'hall/f': Operation not permitted\n", 1]);
  assert.equal(await ownerOf(b, 'hall/f'), 'hero:hero');
});

test('chgrp names an unknown group, a missing file and missing operands', async () => {
  const b = await hall();
  assert.deepEqual(outcome(await run(b, 'chgrp nosuch hall/f')), ['', 'chgrp: invalid group: \u2018nosuch\u2019\n', 1]);
  assert.deepEqual(outcome(await run(b, 'chgrp scribes nofile')), ['', "chgrp: cannot access 'nofile': No such file or directory\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chgrp')), ['', "chgrp: missing operand\nTry 'chgrp --help' for more information.\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chgrp scribes')), ['', "chgrp: missing operand after \u2018scribes\u2019\nTry 'chgrp --help' for more information.\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chgrp -x a f')), ['', "chgrp: invalid option -- 'x'\nTry 'chgrp --help' for more information.\n", 1]);
});

test('chown can only give a file you own to yourself, with a group of yours', async () => {
  const b = await hall();
  assert.deepEqual(outcome(await run(b, 'chown hero:scribes hall/f')), ['', '', 0]);
  assert.deepEqual(outcome(await run(b, 'chown :hero hall/f; chown hero hall/f; chown 1000 hall/f; chown : hall/f')), ['', '', 0]);
  assert.equal(await ownerOf(b, 'hall/f'), 'hero:hero');
  assert.deepEqual(outcome(await run(b, 'chown 1000:1002 hall/f')), ['', '', 0]);
  assert.deepEqual(outcome(await run(b, 'chown hero: hall/f')), ['', '', 0]);
  assert.equal(await ownerOf(b, 'hall/f'), 'hero:hero');
  assert.deepEqual(outcome(await run(b, 'chown mira hall/f')), ['', "chown: changing ownership of 'hall/f': Operation not permitted\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chown hero hall/theirs')), ['', "chown: changing ownership of 'hall/theirs': Operation not permitted\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chown :scribes hall/theirs')), ['', "chown: changing group of 'hall/theirs': Operation not permitted\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chown hero:9999 hall/f')), ['', "chown: changing ownership of 'hall/f': Operation not permitted\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chown : hall/theirs')), ['', '', 0]);
});

test('chown names a bad user, group or spec', async () => {
  const b = await hall();
  assert.equal((await run(b, 'chown nosuch hall/f')).err, 'chown: invalid user: \u2018nosuch\u2019\n');
  assert.equal((await run(b, 'chown nosuch:hero hall/f')).err, 'chown: invalid user: \u2018nosuch:hero\u2019\n');
  assert.equal((await run(b, 'chown hero:nosuch hall/f')).err, 'chown: invalid group: \u2018hero:nosuch\u2019\n');
  assert.equal((await run(b, 'chown :nosuch hall/f')).err, 'chown: invalid group: \u2018:nosuch\u2019\n');
  assert.equal((await run(b, 'chown nosuch: hall/f')).err, 'chown: invalid spec: \u2018nosuch:\u2019\n');
  assert.deepEqual(outcome(await run(b, 'chown -R')), ['', "chown: missing operand\nTry 'chown --help' for more information.\n", 1]);
  assert.deepEqual(outcome(await run(b, 'chown hero')), ['', "chown: missing operand after \u2018hero\u2019\nTry 'chown --help' for more information.\n", 1]);
});

test('chown warns about a dot instead of a colon, and still does it', async () => {
  const b = await hall();
  assert.deepEqual(outcome(await run(b, 'chown hero.scribes hall/f')), ['', "chown: warning: '.' should be ':': \u2018hero.scribes\u2019\n", 0]);
  assert.equal(await ownerOf(b, 'hall/f'), 'hero:scribes');
});

test('-v and -c describe each change the way coreutils does', async () => {
  const b = await hall();
  assert.equal((await run(b, 'chown -v hero:scribes hall/f')).out, "changed ownership of 'hall/f' from hero:hero to hero:scribes\n");
  assert.equal((await run(b, 'chown -c :hero hall/f')).out, "changed ownership of 'hall/f' from hero:scribes to :hero\n");
  assert.equal((await run(b, 'chown -v hero hall/f')).out, "ownership of 'hall/f' retained as hero\n");
  assert.equal((await run(b, 'chown -v hero: hall/f')).out, "ownership of 'hall/f' retained as hero:hero\n");
  assert.equal((await run(b, 'chown -v : hall/f')).out, "ownership of 'hall/f' retained\n");
  assert.equal((await run(b, 'chown -c hero: hall/f')).out, '');
  assert.equal((await run(b, 'chown -v 1000:1002 hall/f')).out, "changed ownership of 'hall/f' from hero:hero to 1000:1002\n");
  assert.equal((await run(b, 'chgrp -v hero hall/f')).out, "changed group of 'hall/f' from scribes to hero\n");
  assert.equal((await run(b, 'chgrp -v hero hall/f')).out, "group of 'hall/f' retained as hero\n");
  assert.deepEqual(outcome(await run(b, 'chgrp -fv smiths hall/f')), ["failed to change group of 'hall/f' from hero to smiths\n", '', 1]);
  assert.deepEqual(outcome(await run(b, 'chown -v mira hall/f')), ["failed to change ownership of 'hall/f' from hero to mira\n",
    "chown: changing ownership of 'hall/f': Operation not permitted\n", 1]);
});

test('-R changes the contents first, then the directory', async () => {
  const b = await hall();
  assert.deepEqual(outcome(await run(b, 'chgrp -Rv scribes hall/d')), [
    "changed group of 'hall/d/e/z' from hero to scribes\nchanged group of 'hall/d/e' from hero to scribes\nchanged group of 'hall/d' from hero to scribes\n", '', 0]);
  assert.deepEqual(outcome(await run(b, 'chown -R mira hall/d')), ['', [
    "chown: changing ownership of 'hall/d/e/z': Operation not permitted",
    "chown: changing ownership of 'hall/d/e': Operation not permitted",
    "chown: changing ownership of 'hall/d': Operation not permitted\n"].join('\n'), 1]);
});

test('-R skips a directory it cannot read and fails on the contents of one it cannot enter', async () => {
  const b = await hall();
  assert.deepEqual(outcome(await run(b, 'chgrp -R scribes hall/nr hall/nx')), ['',
    "chgrp: cannot read directory 'hall/nr': Permission denied\nchgrp: changing group of 'hall/nx/in': Permission denied\n", 1]);
  assert.equal(await ownerOf(b, 'hall/nr'), 'hero:hero');
  assert.equal(await ownerOf(b, 'hall/nx'), 'hero:scribes');
});

test('new files take the primary group from /etc/passwd', async () => {
  const b = await shell([...guild(), put('/etc/passwd', file('hero:x:1000:1002::/home/hero:/bin/bash\n')), login()]);
  await run(b, 'touch t; mkdir m; echo x > r; cp t c');
  assert.equal((await run(b, 'ls -ld t m r c')).out.split('\n').filter(Boolean).map(l => l.split(/ +/).slice(2, 4).join(':')).join(' '),
    'hero:scribes hero:scribes hero:scribes hero:scribes');
});

test('in a setgid directory new files take its group, and new directories stay setgid', async () => {
  const b = await shell([...guild(), put('/home/hero/sg', dir({}, { owner: 'hero', group: 'scribes', mode: 0o2775 }))]);
  await run(b, 'touch sg/t; mkdir sg/m; echo x > sg/r; cp readme.txt sg/c; cp -r forest sg/f');
  const rows = (await run(b, 'ls -l sg')).out.split('\n').slice(1, -1).map(l => `${l.split(/ +/)[0]} ${l.split(/ +/)[3]}`);
  assert.deepEqual(rows, ['-rw-r--r-- scribes', 'drwxr-sr-x scribes', 'drwxr-sr-x scribes', '-rw-r--r-- scribes', '-rw-r--r-- scribes']);
});

test('rm removes a write-protected file in a writable directory, and notes the question a terminal would ask', async () => {
  const b = await shell([put('/home/hero/locked.txt', file('x\n', { owner: 'hero', mode: 0o444 })), put('/home/hero/empty', file('', { owner: 'hero', mode: 0o444 }))]);
  const r = await run(b, 'rm locked.txt');
  assert.deepEqual(outcome(r), ['', '', 0]);
  assert.equal(r.note, 'In a real terminal, rm asks "rm: remove write-protected regular file \'locked.txt\'?" and waits for y or n. The game answers yes for you.');
  assert.match((await run(b, 'rm empty')).note, /write-protected regular empty file 'empty'/);
  assert.equal((await run(b, 'rm -f readme.txt')).note, '');
});

test('rm -f does not note anything about write-protected files', async () => {
  const b = await shell([put('/home/hero/locked.txt', file('x\n', { owner: 'hero', mode: 0o444 }))]);
  assert.equal((await run(b, 'rm -f locked.txt')).note, '');
});

test('chown and chgrp cannot follow a dangling link or a loop', async () => {
  const b = await shell([put('/home/hero/b', symlink('nowhere', { owner: 'hero' })), put('/home/hero/loop', symlink('loop', { owner: 'hero' }))]);
  assert.deepEqual(await run(b, 'chown hero b').then(r => [r.err, r.status]), ["chown: cannot dereference 'b': No such file or directory\n", 1]);
  assert.equal((await run(b, 'chgrp hero b')).err, "chgrp: cannot dereference 'b': No such file or directory\n");
  assert.equal((await run(b, 'chown hero loop')).err, "chown: cannot dereference 'loop': Too many levels of symbolic links\n");
});
