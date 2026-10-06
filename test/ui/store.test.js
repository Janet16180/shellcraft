import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/ui/store.js';

function fakeStorage() {
  const items = new Map();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, text) => { items.set(key, String(text)); },
  };
}

function refusing(name) {
  const fail = () => { throw new DOMException('denied', name); };
  return { getItem: fail, setItem: fail };
}

test('the store reads and writes through to browser storage', () => {
  const storage = fakeStorage();
  const store = createStore(() => storage);
  store.setItem('k', '{"xp":1}');
  assert.equal(storage.getItem('k'), '{"xp":1}');
  assert.equal(store.getItem('k'), '{"xp":1}');
});

test('a missing key reads as null', () => {
  assert.equal(createStore(() => fakeStorage()).getItem('nothing'), null);
});

test('when storage is refused, as in a private window, the save lives in memory for this visit', () => {
  const store = createStore(() => { throw new DOMException('denied', 'SecurityError'); });
  assert.equal(store.getItem('k'), null);
  store.setItem('k', 'v');
  assert.equal(store.getItem('k'), 'v');
});

test('when storage is full the newest save is kept in memory and read back', () => {
  const storage = fakeStorage();
  storage.setItem('k', 'old');
  const store = createStore(() => ({ getItem: storage.getItem, setItem: refusing('QuotaExceededError').setItem }));
  store.setItem('k', 'new');
  assert.equal(store.getItem('k'), 'new');
});

test('errors that are not storage refusals still raise', () => {
  const store = createStore(() => { throw new TypeError('bug'); });
  assert.throws(() => store.getItem('k'), TypeError);
});
