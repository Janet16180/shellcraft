import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/shell/lexer.js';
import { parse, parseNext } from '../../src/shell/parse.js';

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
  assert.equal(parsed('| ls').error, "syntax error near unexpected token `|'");
  assert.equal(parsed('; ls').error, "syntax error near unexpected token `;'");
  assert.equal(parsed('ls && && pwd').error, "syntax error near unexpected token `&&'");
  assert.equal(parsed('ls | | wc').error, "syntax error near unexpected token `|'");
});

test('a redirection without a target is a syntax error naming what follows', () => {
  assert.equal(parsed('ls >').error, "syntax error near unexpected token `newline'");
  assert.equal(parsed('ls > | wc').error, "syntax error near unexpected token `|'");
});

test('a line that ends after | && or || is incomplete', () => {
  for (const line of ['ls |', 'echo a &&', 'false ||']) {
    const r = parsed(line);
    assert.equal(r.error, 'syntax error: unexpected end of file', line);
    assert.equal(r.incomplete, true);
  }
});

test('a trailing ; or & ends the line normally', () => {
  assert.equal(parsed('ls;').error, null);
  assert.deepEqual(parsed('ls ;').list.map(p => p.next), [';']);
});

test('parentheses are not supported and read as syntax errors', () => {
  assert.equal(parsed('(ls)').error, "syntax error near unexpected token `('");
});

const first = text => parseNext(tokenize(text).tokens, 0);

function firstError(text) {
  const { tokens } = tokenize(text);
  let next = { end: 0, list: [] };
  while (next.list) next = parseNext(tokens, next.end);
  return next;
}

test('parseNext reads one line at a time, a compound command across lines', () => {
  const tokens = tokenize('\necho a; ls\nfor x in a b\ndo\n  echo $x\ndone > out\n').tokens;
  const one = parseNext(tokens, 0);
  assert.deepEqual(one.list.map(i => [raws(i.pipeline[0]), i.next]), [[['echo', 'a'], ';'], [['ls'], null]]);
  const two = parseNext(tokens, one.end);
  const loop = two.list[0].pipeline[0];
  assert.deepEqual([loop.type, loop.name, loop.words.map(w => w.raw), loop.line, loop.endLine], ['for', 'x', ['a', 'b'], 3, 6]);
  assert.deepEqual(loop.body.map(i => raws(i.pipeline[0])), [['echo', '$x']]);
  assert.deepEqual(loop.redirs.map(r => r.target.raw), ['out']);
  assert.equal(parseNext(tokens, two.end).list, null);
});

test('a simple command knows the line it ends on', () => {
  assert.equal(first('nosuch \\\n  arg').list[0].pipeline[0].line, 2);
});

test('for without in loops over the arguments, and reserved words count only first', () => {
  const loop = first('for x; do echo do done; done').list[0].pipeline[0];
  assert.equal(loop.words, null);
  assert.deepEqual(raws(loop.body[0].pipeline[0]), ['echo', 'do', 'done']);
  assert.deepEqual(raws(first("'for' x").list[0].pipeline[0]), ["'for'", 'x']);
});

test('if has branches with conditions, and an else', () => {
  const cmd = first('if a; then b; elif c; then d; else e; fi').list[0].pipeline[0];
  assert.equal(cmd.type, 'if');
  assert.deepEqual(cmd.branches.map(b => [raws(b.cond[0].pipeline[0]), raws(b.body[0].pipeline[0])]), [[['a'], ['b']], [['c'], ['d']]]);
  assert.deepEqual(raws(cmd.otherwise[0].pipeline[0]), ['e']);
  assert.equal(first('if a; then b; fi').list[0].pipeline[0].otherwise, null);
});

test('! negates a pipeline', () => {
  assert.deepEqual(first('! true | false; ls').list.map(i => i.negate), [true, false]);
});

test('a misplaced word is a syntax error near it, with its line', () => {
  for (const [text, near, line] of [['for f in a b; echo $f; done', 'echo', 1], ['for f in a b do echo; done', 'done', 1],
    ['if true; echo y; fi', 'fi', 1], ['done', 'done', 1], ['echo a\nfi', 'fi', 2], ['if; then :; fi', ';', 1],
    ['for x in a; do; echo; done', ';', 1], ['for x in a\n  echo $x\ndone', 'echo', 2], ['for x in a; do echo; done echo', 'echo', 1],
    ['echo >\n', 'newline', 1], ['echo >', 'newline', 1]]) {
    const r = firstError(text);
    assert.deepEqual([r.error?.message, r.error?.line, r.error?.echo], [`syntax error near unexpected token \`${near}'`, line, true], text);
  }
});

test('text that ends inside a compound command is an unexpected end of file', () => {
  for (const text of ['for x in a; do echo', 'if true; then', 'for x', 'ls |']) {
    const r = first(text);
    assert.deepEqual([r.error?.message, r.error?.line, r.error?.incomplete], ['syntax error: unexpected end of file', null, true], text);
  }
});
