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

test('the short help starts with the usage line the real --help prints', () => {
  const first = name => manText(name, true).split('\n').slice(0, 3).join('\n');
  assert.match(first('man'), /^Usage: man \[OPTION\.\.\.\] \[SECTION\] PAGE\.\.\.\n/);
  assert.match(first('apropos'), /^Usage: apropos \[OPTION\.\.\.\] KEYWORD\.\.\.\n/);
  assert.match(first('cp'), /^Usage: cp \[OPTION\]\.\.\. \[-T\] SOURCE DEST\n/);
  assert.match(first('ps'), /^\nUsage:\n ps \[options\]$/);
  assert.match(first('tree'), /^usage: tree \[-acdfghilnpqrstuvxACDFJQNSUX\] \[-L level \[-R\]\] \[-H {2}baseHREF\]\n\t\[-T title\]/);
  assert.match(manText('man', false), /^SYNOPSIS\n {7}man \[man options\] \[\[section\] page \.\.\.\] \.\.\.$/m);
});
