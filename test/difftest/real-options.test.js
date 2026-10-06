import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionsIn } from '../../difftest/real-options.js';

test('options are read from the indented option lines of a --help text', () => {
  const help = [
    'Usage: who [OPTION]... [ FILE | ARG1 ARG2 ]',
    '  -a, --all         same as -b -d --login -p -r -t -T -u',
    '  -T, -w, --mesg    add user\'s message status as +, - or ?',
    '      --lookup      attempt to canonicalize hostnames via DNS',
    '  -k, --key=KEYDEF          sort via a key',
    '  -c, --bytes=[-]NUM       print the first NUM bytes',
  ].join('\n');
  assert.deepEqual(optionsIn(help), { short: 'Tackw', long: ['--all', '--bytes', '--key', '--lookup', '--mesg'] });
});

test('a bracketed group in a usage line adds its letters', () => {
  assert.equal(optionsIn('usage: tree [-acdF] [-L level]\n  -L level      Descend only level directories deep.').short, 'FLacd');
});
