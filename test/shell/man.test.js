import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasManPage, manText } from '../../src/shell/man.js';

test('the full page has NAME, SYNOPSIS, DESCRIPTION and OPTIONS sections', () => {
  const page = manText('ls', false);
  for (const section of ['NAME', 'SYNOPSIS', 'DESCRIPTION', 'OPTIONS']) assert.match(page, new RegExp(`^${section}$`, 'm'));
  assert.match(page, /^LS\(1\)/);
});

test('the short form is a usage line plus options', () => {
  assert.match(manText('cat', true), /^Usage: cat \[OPTION\]\.\.\. \[FILE\]\.\.\.\n/);
});

test('only known commands have a page; asking for another raises', () => {
  assert.equal(hasManPage('ls'), true);
  assert.equal(hasManPage('toString'), false);
  assert.throws(() => manText('nope', false), /no manual page/);
});
