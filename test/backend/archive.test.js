import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packTar, unpackTar, gzip, gunzip, isGzip, archiveMembers, byteLength } from '../../src/backend/archive.js';

const T = Date.UTC(2026, 9, 8, 14, 47, 0);
const meta = { mode: 0o664, owner: 'hero', group: 'hero', mtime: T };
const members = () => [
  { path: 'd/', type: 'dir', ...meta, mode: 0o775 },
  { path: 'd/a.txt', type: 'file', ...meta, content: 'hello\n' },
  { path: 'd/link', type: 'symlink', ...meta, mode: 0o777, target: 'a.txt' },
  { path: 'd/sub/', type: 'dir', ...meta, mode: 0o775 },
  { path: 'd/sub/café.txt', type: 'file', ...meta, content: 'naïve — ünïcode\n' },
];

test('a tar packs and unpacks every member with its path, type, mode, owner, time, content and link target', () => {
  assert.deepEqual(unpackTar(packTar(members())), members());
});

test('a tar is as long as GNU tar makes it: 512 bytes per header and per started block of content, in records of 10240', () => {
  assert.equal(byteLength(packTar(members())), 10240);
  assert.equal(byteLength(packTar([])), 10240);
  const big = [{ path: 'big.txt', type: 'file', ...meta, content: 'x'.repeat(20000) }];
  assert.equal(byteLength(packTar(big)), 30720);
  const nineteen = Array.from({ length: 10 }, (_, i) => ({ path: `f${i}`, type: 'file', ...meta, content: 'y'.repeat(512) }));
  assert.equal(byteLength(packTar(nineteen)), 20480);
});

test('a tar does not show its members\' names or text to someone who cats it', () => {
  const text = packTar(members());
  assert.equal(text.includes('a.txt'), false);
  assert.equal(text.includes('hello'), false);
  assert.equal(text.includes('\u001b'), false);
});

test('an empty tar of only end blocks has no members, and other text is not a tar', () => {
  assert.deepEqual(unpackTar('\0'.repeat(10240)), []);
  assert.equal(unpackTar('hello\n'), null);
  assert.equal(unpackTar(''), null);
  assert.equal(unpackTar(packTar(members()).slice(0, 700)), null);
});

test('gzip and gunzip give back the same text, with the name and time gzip stored', () => {
  for (const text of ['', 'hello\n', 'naïve — ünïcode 𝄞\n', packTar(members()), 'abcabcabcabc'.repeat(500), '\u007fDEL\u0000NUL\n']) {
    const packed = gzip(text, { name: 'a.txt', mtime: T });
    assert.equal(isGzip(packed), true);
    const back = gunzip(packed);
    assert.equal(back.text, text);
    assert.equal(back.name, 'a.txt');
    assert.equal(back.mtime, T);
  }
  assert.equal(gunzip(gzip('x')).name, null);
});

test('gzip shrinks repetitive text a lot and a tar of small files to a few hundred bytes, but adds to a tiny file', () => {
  const lines = Array.from({ length: 500 }, (_, i) => `${i + 1}`).join('\n');
  assert.ok(byteLength(gzip(lines)) < byteLength(lines) * 0.75);
  assert.ok(byteLength(gzip(packTar(members()))) < 400);
  assert.ok(byteLength(gzip('hello\n', { name: 'a.txt' })) > 6);
});

test('gzip output is opaque and safe for the terminal: no original words, no escape character', () => {
  const packed = gzip('The dragon sleeps under the mountain.\n'.repeat(3), { name: 'dragon.txt' });
  assert.equal(packed.includes('sleeps'), false);
  assert.equal(packed.includes('\u001b'), false);
});

test('gunzip tells text that is not gzip from gzip data that was damaged', () => {
  assert.deepEqual(gunzip('hello\n'), { error: 'format' });
  const packed = gzip('hello there, hello there\n');
  const damaged = packed.slice(0, 12) + (packed[12] === 'a' ? 'b' : 'a') + packed.slice(13);
  assert.ok(['corrupt', 'crc', 'eof'].includes(gunzip(damaged).error));
  assert.deepEqual(gunzip(packed.slice(0, 15)), { error: 'eof' });
  assert.deepEqual(gunzip(packed.slice(0, -8) + '\0'.repeat(8)), { error: 'crc' });
});

test('gunzip reports the sizes gzip -l lists: compressed, uncompressed and the header and trailer bytes', () => {
  const packed = gzip('hello\n', { name: 'a.txt' });
  const back = gunzip(packed);
  assert.equal(back.size, 6);
  assert.ok(back.overhead >= 24);
});

test('archiveMembers reads a tar, compressed or not, and gives null for anything else', () => {
  assert.deepEqual(archiveMembers(packTar(members())), members());
  assert.deepEqual(archiveMembers(gzip(packTar(members()))), members());
  assert.equal(archiveMembers(gzip('hello\n')), null);
  assert.equal(archiveMembers('hello\n'), null);
});
