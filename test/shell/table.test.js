import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameTable } from '../../src/shell/table.js';

test('a name table inherits nothing', () => {
  const table = nameTable({ ls: 1 });
  for (const name of Object.getOwnPropertyNames(Object.prototype)) assert.equal(table[name], undefined, name);
  assert.equal(table.ls, 1);
});

test('__proto__ is an ordinary key, copied and assigned like any other', () => {
  const table = nameTable(Object.fromEntries([['__proto__', 1], ['a', 2]]));
  assert.deepEqual(Object.keys(table), ['__proto__', 'a']);
  assert.equal(table.__proto__, 1);
  table.__proto__ = 3;
  assert.equal(table.__proto__, 3);
  assert.equal(Object.getPrototypeOf(table), null);
});

test('in and delete see only the names put in the table', () => {
  const table = nameTable();
  assert.equal('constructor' in table, false);
  table.constructor = 'x';
  assert.equal('constructor' in table, true);
  delete table.constructor;
  assert.deepEqual(Object.keys(table), []);
});
