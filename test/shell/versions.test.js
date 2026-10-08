import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionText } from '../../src/shell/versions.js';

test('coreutils programs print the 9.4 block with their own authors', () => {
  assert.equal(versionText('whoami'), 'whoami (GNU coreutils) 9.4\nCopyright (C) 2023 Free Software Foundation, Inc.\nLicense GPLv3+: GNU GPL version 3 or later <https://gnu.org/licenses/gpl.html>.\nThis is free software: you are free to change and redistribute it.\nThere is NO WARRANTY, to the extent permitted by law.\n\nWritten by Richard Mlynarik.\n');
  assert.match(versionText('rm'), /Written by Paul Rubin, David MacKenzie, Richard M\. Stallman,\nand Jim Meyering\.\n$/);
  assert.match(versionText('who'), /^who \(GNU coreutils\) 9\.4\n[\s\S]*\nWritten by Joseph Arceneaux, David MacKenzie, and Michael Stone\.\n$/);
});

test('grep, find and tree print their own versions', () => {
  assert.match(versionText('grep'), /^grep \(GNU grep\) 3\.11\n/);
  assert.match(versionText('find'), /^find \(GNU findutils\) 4\.9\.0\n/);
  assert.equal(versionText('tree'), 'tree v2.1.1 © 1996 - 2023 by Steve Baker, Thomas Moore, Francesc Rocher, Florian Sesser, Kyosuke Tokoro\n');
});

test('programs without a known version text give null', () => {
  assert.equal(versionText('cd'), null);
  assert.equal(versionText('ps'), null);
});

test('hostname prints the net-tools version', () => {
  assert.equal(versionText('hostname'), 'hostname 3.23\n');
});

test('man, apropos and whatis print the man-db version', () => {
  for (const name of ['man', 'apropos', 'whatis']) assert.equal(versionText(name), `${name} 2.12.0\n`);
});

test('tar, gzip and its helpers, du, df and file print their own versions', () => {
  assert.equal(versionText('tar'), 'tar (GNU tar) 1.35\nCopyright (C) 2023 Free Software Foundation, Inc.\nLicense GPLv3+: GNU GPL version 3 or later <https://gnu.org/licenses/gpl.html>.\nThis is free software: you are free to change and redistribute it.\nThere is NO WARRANTY, to the extent permitted by law.\n\nWritten by John Gilmore and Jay Fenlason.\n');
  assert.match(versionText('gzip'), /^gzip 1\.12\nCopyright \(C\) 2018 Free Software Foundation, Inc\.\nCopyright \(C\) 1993 Jean-loup Gailly\.\n[\s\S]*\nWritten by Jean-loup Gailly\.\n$/);
  for (const name of ['gunzip', 'zcat']) assert.match(versionText(name), new RegExp(`^${name} \\(gzip\\) 1\\.12\\n[\\s\\S]*\\nWritten by Paul Eggert\\.\\n$`));
  assert.match(versionText('du'), /^du \(GNU coreutils\) 9\.4\n[\s\S]*\nWritten by Torbjörn Granlund, David MacKenzie, Paul Eggert,\nand Jim Meyering\.\n$/);
  assert.match(versionText('df'), /\nWritten by Torbjörn Granlund, David MacKenzie, and Paul Eggert\.\n$/);
  assert.equal(versionText('file'), 'file-5.45\nmagic file from /etc/magic:/usr/share/misc/magic\n');
});
