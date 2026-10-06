import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parse } from '../../src/shell/parse.js';

const env = { lookupVar: name => ({ HOME: '/home/hero', X: 'a b', '?': '0' })[name.replace(/[{}]/g, '')] ?? '', home: '/home/hero' };
const words = line => tokenize(line, env).tokens.map(t => t.op ?? t.v);

test('words split on blanks and operators stand alone', () => {
  assert.deepEqual(words('ls -l|wc -l;echo a&&echo b||echo c > f >> g < h'),
    ['ls', '-l', '|', 'wc', '-l', ';', 'echo', 'a', '&&', 'echo', 'b', '||', 'echo', 'c', '>', 'f', '>>', 'g', '<', 'h']);
});

test('quotes group words and are removed', () => {
  assert.deepEqual(words(`echo 'a  b' "c d" e\\ f`), ['echo', 'a  b', 'c d', 'e f']);
});

test('variables expand outside single quotes only', () => {
  assert.deepEqual(words(`echo $HOME "$X" '$HOME' \${HOME} $?`), ['echo', '/home/hero', 'a b', '$HOME', '/home/hero', '0']);
});

test('a leading tilde becomes the home', () => {
  assert.deepEqual(words('cd ~ ~/forest a~'), ['cd', '/home/hero', '/home/hero/forest', 'a~']);
});

test('unquoted wildcards mark a word for globbing', () => {
  const [, star, quoted] = tokenize("ls *.txt '*.txt'", env).tokens;
  assert.equal(star.glob, true);
  assert.equal(quoted.glob, false);
});

test('a comment ends the line', () => {
  assert.deepEqual(words('echo hi # not this'), ['echo', 'hi']);
});

test('an unclosed quote is reported as bash reports it', () => {
  assert.equal(tokenize("echo 'oops", env).error, "bash: unexpected EOF while looking for matching `''");
  assert.equal(tokenize('echo "oops', env).error, 'bash: unexpected EOF while looking for matching `"\'');
});

test('parse groups stages into pipelines joined by their operators', () => {
  const { seq, error } = parse(tokenize('cat a | sort > b; ls && pwd', env).tokens);
  assert.equal(error, null);
  assert.deepEqual(seq.map(s => [s.pipeline.length, s.next]), [[2, ';'], [1, '&&'], [1, null]]);
  assert.deepEqual(seq[0].pipeline[1].redir, [{ op: '>', target: 'b' }]);
});

test('misplaced operators are syntax errors', () => {
  const err = line => parse(tokenize(line, env).tokens).error;
  assert.equal(err('| ls'), "bash: syntax error near unexpected token `|'");
  assert.equal(err('ls >'), "bash: syntax error near unexpected token `newline'");
  assert.equal(err('ls |'), "bash: syntax error near unexpected token `newline'");
  assert.equal(err('; ls'), "bash: syntax error near unexpected token `;'");
});
