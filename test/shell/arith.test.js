import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../src/shell/arith.js';

const vars = { X: '7', EMPTY: '', WORD: 'abc' };
const calc = expr => evaluate(expr, name => vars[name] ?? '');

test('integer arithmetic follows the usual precedence', () => {
  assert.deepEqual(calc('1+2*3'), { value: 7, error: null });
  assert.equal(calc('(1+2)*3').value, 9);
  assert.equal(calc('7/2').value, 3);
  assert.equal(calc('-7/2').value, -3);
  assert.equal(calc('7%3').value, 1);
  assert.equal(calc(' 2 - -1 ').value, 3);
});

test('comparisons and logic give 1 or 0', () => {
  assert.equal(calc('3>2').value, 1);
  assert.equal(calc('3<=2').value, 0);
  assert.equal(calc('1==1 && 2!=2').value, 0);
  assert.equal(calc('0 || 5').value, 1);
  assert.equal(calc('!0').value, 1);
});

test('names stand for their values; unset or empty ones are 0', () => {
  assert.equal(calc('X*2').value, 14);
  assert.equal(calc('NOPE+1').value, 1);
  assert.equal(calc('EMPTY+1').value, 1);
});

test('division by zero and bad syntax are errors in bash words', () => {
  assert.equal(calc('1/0').error, '1/0: division by 0 (error token is "0")');
  assert.equal(calc('1+').error, '1+: syntax error: operand expected (error token is "+")');
});
