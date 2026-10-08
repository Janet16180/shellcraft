import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from '../helpers.js';
import { put, dir, file, symlink } from '../../../src/backend/spec.js';

const mine = { owner: 'hero' };
const world = () => shell([
  put('/home/hero/kinds', dir({
    'plain.txt': file('hello\n', mine),
    'one': file('a', mine),
    'empty': file('', mine),
    'noeol': file('hello', mine),
    'crlf': file('line\r\n', mine),
    'cafe.txt': file('café\n', mine),
    'long': file(`${'x'.repeat(301)}\n`, mine),
    'esc': file('a\u001b[1mb\n', mine),
    'ctl': file('abc\u0001\n', mine),
    'run.sh': file('#!/bin/bash\necho hi\n', { owner: 'hero', mode: 0o755 }),
    'sh.sh': file('#!/bin/sh\necho\n', mine),
    'env.sh': file('#!/usr/bin/env bash\necho\n', mine),
    'py': file('#!/usr/bin/python3\nprint()\n', mine),
    'locked': file('x\n', { owner: 'root', mode: 0o600 }),
    'sub': dir({}, mine),
    'ln': symlink('plain.txt', mine),
    'dang': symlink('nowhere', mine),
  }, mine)),
]);
const outcome = r => [r.out, r.err, r.status];

test('file names what each file holds, aligned after the names, and exits 0 even for a missing one', async () => {
  const b = await world();
  await run(b, 'cd kinds');
  const r = await run(b, 'file plain.txt one empty noeol crlf cafe.txt long esc ctl sub ln dang nosuch');
  assert.deepEqual(outcome(r), [[
    'plain.txt: ASCII text',
    'one:       very short file (no magic)',
    'empty:     empty',
    'noeol:     ASCII text, with no line terminators',
    'crlf:      ASCII text, with CRLF line terminators',
    'cafe.txt:  Unicode text, UTF-8 text',
    'long:      ASCII text, with very long lines (301)',
    'esc:       ASCII text, with escape sequences',
    'ctl:       data',
    'sub:       directory',
    'ln:        symbolic link to plain.txt',
    'dang:      broken symbolic link to nowhere',
    "nosuch:    cannot open `nosuch' (No such file or directory)",
  ].join('\n') + '\n', '', 0]);
});

test('file knows scripts by their #! line', async () => {
  const b = await world();
  await run(b, 'cd kinds');
  assert.equal((await run(b, 'file run.sh sh.sh env.sh py')).out, [
    'run.sh: Bourne-Again shell script, ASCII text executable',
    'sh.sh:  POSIX shell script, ASCII text executable',
    'env.sh: Bourne-Again shell script, ASCII text executable',
    'py:     Python script, ASCII text executable',
  ].join('\n') + '\n');
});

test('file recognizes gzip data and tar archives', async () => {
  const b = await world();
  await runAll(b, ['cd kinds', 'gzip -k plain.txt', 'tar -cf k.tar plain.txt', 'tar -czf k.tgz plain.txt']);
  assert.equal((await run(b, 'file plain.txt.gz')).out, 'plain.txt.gz: gzip compressed data, was "plain.txt", last modified: Tue Oct  6 10:00:00 2026, from Unix, original size modulo 2^32 6\n');
  assert.equal((await run(b, 'file k.tar k.tgz')).out, 'k.tar: POSIX tar archive (GNU)\nk.tgz: gzip compressed data, from Unix, original size modulo 2^32 10240\n');
});

test('file -b leaves out the name, -L follows links, and special files have their own words', async () => {
  const b = await world();
  await run(b, 'cd kinds');
  assert.equal((await run(b, 'file -b plain.txt sub')).out, 'ASCII text\ndirectory\n');
  assert.equal((await run(b, 'file -L ln dang')).out, "ln:   ASCII text\ndang: cannot open `dang' (No such file or directory)\n");
  assert.equal((await run(b, 'file /tmp /dev/null locked')).out, '/tmp:      sticky, directory\n/dev/null: character special (1/3)\nlocked:    regular file, no read permission\n');
  assert.match((await run(b, 'file /usr/bin/ls')).out, /^\/usr\/bin\/ls: ELF 64-bit LSB pie executable, x86-64, .*, stripped\n$/);
  assert.match((await run(b, 'file /usr/bin/sudo')).out, /^\/usr\/bin\/sudo: setuid ELF 64-bit/);
});

test('file with no name prints its usage and exits 1', async () => {
  const r = await run(await world(), 'file');
  assert.equal(r.status, 1);
  assert.match(r.err, /^Usage: file \[-bcCdEhikLlNnprsSvzZ0\]/);
});
