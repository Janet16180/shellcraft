import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepCopy, saveState, restoreState, createTape } from '../../src/shell/snapshot.js';
import { nameTable } from '../../src/shell/table.js';

test('a deep copy keeps shared objects shared, null prototypes, maps, sets and functions', () => {
  const node = { content: 'x' };
  const fn = () => 1;
  const table = nameTable({ a: node, b: node });
  const copy = deepCopy({ table, map: new Map([['k', node]]), set: new Set([node]), fn });
  assert.notEqual(copy.table.a, node);
  assert.equal(copy.table.a, copy.table.b);
  assert.equal(copy.map.get('k'), copy.table.a);
  assert.ok(copy.set.has(copy.table.a));
  assert.equal(Object.getPrototypeOf(copy.table), null);
  assert.equal(copy.fn, fn);
});

test('restoring puts the state back, keeps the live clock, and can be done twice', () => {
  const now = () => 5;
  const sys = { now, random: Math.random, files: { a: 1 }, history: ['ls'] };
  const saved = saveState(sys);
  sys.files.a = 2;
  sys.history.push('pwd');
  sys.extra = true;
  restoreState(sys, saved);
  assert.deepEqual([sys.files, sys.history, 'extra' in sys, sys.now], [{ a: 1 }, ['ls'], false, now]);
  sys.files.a = 3;
  restoreState(sys, saved);
  assert.equal(sys.files.a, 1);
});

test('a tape gives a replay the same clock and random values, then the live ones', () => {
  let t = 0;
  const sys = { now: () => ++t, random: () => t / 10 };
  const tape = createTape(sys);
  const first = tape.play(() => [sys.now(), sys.random(), sys.now()]);
  const again = tape.play(() => [sys.now(), sys.random(), sys.now(), sys.now()]);
  assert.deepEqual(first, [1, 0.1, 2]);
  assert.deepEqual(again, [1, 0.1, 2, 3]);
  assert.equal(sys.now(), 4);
});
