import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, pick, shuffle, token, TOKEN_ALPHABET } from '../../src/game/rng.js';

test('the same seed gives the same sequence', () => {
  const a = createRandom(42);
  const b = createRandom(42);
  const first = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], first);
});

test('different seeds give different sequences', () => {
  assert.notEqual(createRandom(1)(), createRandom(2)());
});

test('every value lies in [0, 1)', () => {
  const random = createRandom(7);
  for (let i = 0; i < 1000; i += 1) {
    const x = random();
    assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
  }
});

test('a seed that is not an integer raises', () => {
  assert.throws(() => createRandom(1.5), /integer/);
  assert.throws(() => createRandom('seed'), /integer/);
});

test('pick returns an element chosen by the random function', () => {
  const items = ['a', 'b', 'c'];
  assert.equal(pick(() => 0, items), 'a');
  assert.equal(pick(() => 0.999, items), 'c');
  assert.equal(pick(() => 0.5, items), 'b');
});

test('pick from an empty list raises', () => {
  assert.throws(() => pick(createRandom(1), []), /empty/);
});

test('shuffle returns a permutation and leaves the input untouched', () => {
  const items = [1, 2, 3, 4, 5, 6];
  const shuffled = shuffle(createRandom(3), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...shuffled].sort(), items);
});

test('shuffle is reproducible from a seed', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(shuffle(createRandom(9), items), shuffle(createRandom(9), items));
});

test('token has the requested length and uses only unambiguous characters', () => {
  const random = createRandom(11);
  for (let i = 0; i < 200; i += 1) {
    const t = token(random, 6);
    assert.equal(t.length, 6);
    assert.match(t, /^[acdefhjkmnprtuvwxy34679]+$/);
  }
});

test('the token alphabet avoids characters a pixel font confuses', () => {
  for (const c of '0O1lI2Z5S8B') assert.ok(!TOKEN_ALPHABET.includes(c), c);
});

test('a token length below 1 raises', () => {
  assert.throws(() => token(createRandom(1), 0), /length/);
});
