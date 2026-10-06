import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineClocks, crossedMinute } from '../../difftest/clock.js';

const ran = (started, ended = started) => ({ started, ended });

test('a line that ran in the container keeps the clock it started at', () => {
  assert.deepEqual(lineClocks([ran(100), ran(103)], 0), [100, 103]);
});

test('a line kept out of the container takes the clock of the line before it', () => {
  assert.deepEqual(lineClocks([ran(100), null, ran(103), null], 0), [100, 100, 103, 103]);
});

test('lines before the first one that ran take its clock', () => {
  assert.deepEqual(lineClocks([null, ran(100, 101), ran(103)], 0), [100, 100, 103]);
});

test('a line whose markers went missing takes the clock of the line before it', () => {
  assert.deepEqual(lineClocks([ran(100), ran(null), ran(103)], 0), [100, 100, 103]);
});

test('without any line in the container every line takes the fallback clock', () => {
  assert.deepEqual(lineClocks([null, null], 42), [42, 42]);
});

test('a case that starts and ends in the same minute did not cross one', () => {
  assert.equal(crossedMinute([ran(120, 125), ran(125, 179)]), null);
});

test('a case that ends in a later minute reports when it started and ended', () => {
  assert.deepEqual(crossedMinute([ran(170, 175), ran(175, 181)]), { from: 170, to: 181 });
});

test('lines whose markers went missing do not count toward the span', () => {
  assert.equal(crossedMinute([ran(170, 175), ran(null, null)]), null);
});

test('a case with no clocked line did not cross a minute', () => {
  assert.equal(crossedMinute([]), null);
});
