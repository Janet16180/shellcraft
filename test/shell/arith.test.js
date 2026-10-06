import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../src/shell/arith.js';

const vars = { X: '7', EMPTY: '', WORD: 'abc' };
const calc = expr => evaluate(expr, name => vars[name] ?? '');

test('integer arithmetic follows the usual precedence', () => {
  assert.deepEqual(calc('1+2*3'), { value: 7n, error: null });
  assert.equal(calc('(1+2)*3').value, 9n);
  assert.equal(calc('7/2').value, 3n);
  assert.equal(calc('-7/2').value, -3n);
  assert.equal(calc('7%3').value, 1n);
  assert.equal(calc(' 2 - -1 ').value, 3n);
});

test('comparisons and logic give 1 or 0', () => {
  assert.equal(calc('3>2').value, 1n);
  assert.equal(calc('3<=2').value, 0n);
  assert.equal(calc('1==1 && 2!=2').value, 0n);
  assert.equal(calc('0 || 5').value, 1n);
  assert.equal(calc('!0').value, 1n);
});

test('names stand for their values; unset or empty ones are 0', () => {
  assert.equal(calc('X*2').value, 14n);
  assert.equal(calc('NOPE+1').value, 1n);
  assert.equal(calc('EMPTY+1').value, 1n);
});

test('division by zero and bad syntax are errors in bash words', () => {
  assert.equal(calc('1/0').error, '1/0: division by 0 (error token is "0")');
  assert.equal(calc('1+').error, '1+: syntax error: operand expected (error token is "+")');
});

const withVars = table => expr => evaluate(expr, name => table[name] ?? '');

test('a variable holding an expression is evaluated in turn, as bash does', () => {
  const calcIn = withVars({ a: 'b', b: 'c', c: '7', sum: '3 + 4', word: 'abc' });
  assert.equal(calcIn('a + 1').value, 8n);
  assert.equal(calcIn('sum * 2').value, 14n);
  assert.equal(calcIn('word + 1').value, 1n);
  assert.equal(withVars({ x: 'hello world' })('x').error, 'hello world: syntax error in expression (error token is "world")');
});

test('a variable that refers back to itself exceeds the recursion level', () => {
  assert.equal(withVars({ a: 'a' })('a').error, 'a: expression recursion level exceeded (error token is "a")');
  assert.equal(withVars({ a: 'a+1' })('a').error, 'a+1: expression recursion level exceeded (error token is "a+1")');
  assert.equal(withVars({ a: 'b', b: 'a' })('a + 1').error, 'b: expression recursion level exceeded (error token is "b")');
});

test('nesting deeper than 1024 levels is refused instead of overflowing the stack', () => {
  assert.equal(calc(`${'('.repeat(1024)}1${')'.repeat(1024)}`).value, 1n);
  assert.equal(calc(`${'-'.repeat(1024)}1`).value, 1n);
  for (const deep of [`${'('.repeat(20000)}1${')'.repeat(20000)}`, `${'-'.repeat(20000)}1`, `${'!'.repeat(20000)}1`]) {
    assert.match(calc(deep).error, /: expression recursion level exceeded \(error token is "/);
  }
});

test('arithmetic is 64-bit and wraps like bash', () => {
  assert.equal(calc('99999999999999999999999 * 9').value, 1803387784686206967n);
  assert.equal(calc('9223372036854775807 + 1').value, -9223372036854775808n);
  assert.equal(calc('-9223372036854775808 / -1').value, -9223372036854775808n);
  assert.equal(calc('-9223372036854775808 % -1').value, 0n);
  assert.equal(calc('-7 % 3').value, -1n);
  assert.equal(calc('99999999999999999999').value, 7766279631452241919n);
  assert.equal(calc('1000000 * 1000000 * 1000000 * 1000000').value, 2003764205206896640n);
  assert.equal(calc(`${'9'.repeat(5000)} + 0`).value, BigInt.asIntN(64, BigInt('9'.repeat(5000))));
  assert.equal(withVars({ x: '99999999999999999999' })('x + 1').value, 7766279631452241920n);
});
