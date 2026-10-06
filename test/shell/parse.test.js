import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/shell/lexer.js';
import { parse } from '../../src/shell/parse.js';

const parsed = line => parse(tokenize(line).tokens);
const raws = cmd => cmd.words.map(w => w.raw);

test('pipelines are split by ; && || and & and keep the operator that follows', () => {
  const { list, error } = parsed('cat a | sort; ls && pwd || echo no &');
  assert.equal(error, null);
  assert.deepEqual(list.map(p => [p.pipeline.length, p.next]), [[2, ';'], [1, '&&'], [1, '||'], [1, '&']]);
  assert.deepEqual(raws(list[0].pipeline[1]), ['sort']);
});

test('redirections attach to their command with the target word', () => {
  const { list } = parsed('sort < in > out 2>&1');
  const cmd = list[0].pipeline[0];
  assert.deepEqual(raws(cmd), ['sort']);
  assert.deepEqual(cmd.redirs.map(r => [r.fd, r.op, r.target.raw]), [[null, '<', 'in'], [null, '>', 'out'], [2, '>&', '1']]);
});

test('a line of only redirections is a command with no words', () => {
  const { list } = parsed('> empty.txt');
  assert.deepEqual(list[0].pipeline[0].words, []);
  assert.equal(list[0].pipeline[0].redirs.length, 1);
});

test('an operator with no command before it is a syntax error naming it', () => {
  assert.equal(parsed('| ls').error, "bash: syntax error near unexpected token `|'");
  assert.equal(parsed('; ls').error, "bash: syntax error near unexpected token `;'");
  assert.equal(parsed('ls && && pwd').error, "bash: syntax error near unexpected token `&&'");
  assert.equal(parsed('ls | | wc').error, "bash: syntax error near unexpected token `|'");
});

test('a redirection without a target is a syntax error naming what follows', () => {
  assert.equal(parsed('ls >').error, "bash: syntax error near unexpected token `newline'");
  assert.equal(parsed('ls > | wc').error, "bash: syntax error near unexpected token `|'");
});

test('a line that ends after | && or || is incomplete', () => {
  for (const line of ['ls |', 'echo a &&', 'false ||']) {
    const r = parsed(line);
    assert.equal(r.error, 'bash: syntax error: unexpected end of file', line);
    assert.equal(r.incomplete, true);
  }
});

test('a trailing ; or & ends the line normally', () => {
  assert.equal(parsed('ls;').error, null);
  assert.deepEqual(parsed('ls ;').list.map(p => p.next), [';']);
});

test('parentheses are not supported and read as syntax errors', () => {
  assert.equal(parsed('(ls)').error, "bash: syntax error near unexpected token `('");
});
