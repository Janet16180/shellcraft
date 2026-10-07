import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/shell/lexer.js';

const shape = line => tokenize(line).tokens.map(t => {
  if (t.type === 'op') return t.op;
  if (t.type === 'redir') return `${t.fd ?? ''}${t.op}`;
  return t.parts.map(p => {
    if ('lit' in p) return p.q ? `[${p.lit}]` : p.lit;
    if ('var' in p) return p.q ? `["$${p.var}"]` : `$${p.var}`;
    if ('cmd' in p) return `$(${p.cmd})`;
    if ('arith' in p) return `$((${p.arith}))`;
    return `~${p.tilde}`;
  }).join('');
});

test('blanks separate words and operators stand alone', () => {
  assert.deepEqual(shape('ls -l|wc -l;echo a&&echo b||echo c&'), ['ls', '-l', '|', 'wc', '-l', ';', 'echo', 'a', '&&', 'echo', 'b', '||', 'echo', 'c', '&']);
});

test('redirections keep their file descriptor when digits touch them', () => {
  assert.deepEqual(shape('cmd >f >>g <h 2>e 2>>e2 2>&1 &>all a2>x'), ['cmd', '>', 'f', '>>', 'g', '<', 'h', '2>', 'e', '2>>', 'e2', '2>&', '1', '&>', 'all', 'a2', '>', 'x']);
});

test('single quotes, double quotes and backslashes mark text as quoted', () => {
  assert.deepEqual(shape(`echo 'a  b' "c d" e\\ f`), ['echo', '[a  b]', '[c d]', 'e[ ]f']);
});

test('inside double quotes a backslash escapes only $ ` " and backslash', () => {
  assert.deepEqual(shape('echo "a\\$b\\n"'), ['echo', '[a$b\\n]']);
});

test('variables are kept for later expansion, quoted or not', () => {
  assert.deepEqual(shape(`echo $HOME "$X" '$Y' \${Z}x $? $$ $`), ['echo', '$HOME', '["$X"]', '[$Y]', '$Zx', '$?', '$$', '$']);
});

test('a tilde at the start of a word is kept for later expansion', () => {
  assert.deepEqual(shape('cd ~ ~/forest ~root a~ "~"'), ['cd', '~', '~/forest', '~root', 'a~', '[~]']);
});

test('command substitution keeps the inner line', () => {
  assert.deepEqual(shape('echo $(pwd) "$(ls -1 | wc -l)" `whoami`'), ['echo', '$(pwd)', '$(ls -1 | wc -l)', '$(whoami)']);
});

test('a comment at the start of a word ends the line', () => {
  assert.deepEqual(shape('echo hi # not this'), ['echo', 'hi']);
  assert.deepEqual(shape('echo a#b'), ['echo', 'a#b']);
});

test('each word keeps the text as typed', () => {
  assert.deepEqual(tokenize(`cat "my file" ~/x`).tokens.map(t => t.raw), ['cat', '"my file"', '~/x']);
});

test('an unclosed quote is reported as bash reports it at the end of input', () => {
  assert.equal(tokenize("echo 'oops").error, "unexpected EOF while looking for matching `''");
  assert.equal(tokenize('echo "oops').error, 'unexpected EOF while looking for matching `"\'');
  assert.equal(tokenize('echo $(oops').error, "unexpected EOF while looking for matching `)'");
});

test('an unclosed quote keeps the tokens before its word and the line it started on', () => {
  const r = tokenize('echo a\necho "b\nc\n');
  assert.deepEqual(r.tokens.map(t => t.raw ?? t.op), ['echo', 'a', '\n', 'echo']);
  assert.equal(r.errorLine, 2);
});

test('a newline is an operator, and every token knows its line', () => {
  const r = tokenize('echo a\n\nls |\n wc');
  assert.deepEqual(shape('echo a\n\nls |\n wc'), ['echo', 'a', '\n', '\n', 'ls', '|', '\n', 'wc']);
  assert.deepEqual(r.tokens.map(t => t.line), [1, 1, 1, 2, 3, 3, 3, 4]);
});

test('a comment runs to the end of its line only', () => {
  assert.deepEqual(shape('echo hi # no ; echo\n# all\necho "a # b"'), ['echo', 'hi', '\n', '\n', 'echo', '[a # b]']);
});

test('a backslash before a newline joins the lines, also inside double quotes', () => {
  assert.deepEqual(shape('echo a \\\n b"c\\\nd"'), ['echo', 'a', 'b[cd]']);
  assert.deepEqual(tokenize('ls \\\n -l').tokens.map(t => t.line), [1, 2]);
});

test('arithmetic expansion keeps the expression', () => {
  assert.deepEqual(shape('echo $((1+(2*3)))'), ['echo', '$((1+(2*3)))']);
});
