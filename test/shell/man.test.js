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

test('who has a page with its real synopsis and the options the game simulates', () => {
  const help = manText('who', true);
  assert.match(help, /^Usage: who \[OPTION\]\.\.\. \[ FILE \| ARG1 ARG2 \]\nPrint information about users who are currently logged in\.\n/);
  for (const option of ['-H', '-m', '-q', '-s']) assert.match(help, new RegExp(`^  ${option} `, 'm'));
});

test('the man page describes man, not the pager that shows it', () => {
  const page = manText('man', false);
  assert.match(page, /Find and display the manual page for each PAGE, usually the name of a program, utility or function\./);
  assert.doesNotMatch(page, /arrow|quit with q/);
});
