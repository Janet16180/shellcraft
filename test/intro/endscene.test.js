import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawEndScene, DESCENT_MS } from '../../src/intro/endscene.js';

// A canvas whose 2D context accepts every drawing call and records nothing.
function fakeCanvas() {
  const ctx = new Proxy({}, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'createPattern') return () => ({});
      return () => {};
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
  return { width: 320, height: 200, getContext: () => ctx };
}

test('every scene of the ending paints, at rest, moving, and long after its walk is over', t => {
  globalThis.document = { createElement: fakeCanvas };
  t.after(() => delete globalThis.document);
  const ctx = fakeCanvas().getContext('2d');
  for (const scene of ['camp', 'descent', 'kernel']) {
    for (const ms of [0, 333, DESCENT_MS, DESCENT_MS * 7]) {
      for (const still of [false, true]) assert.doesNotThrow(() => drawEndScene(ctx, scene, ms, still), `${scene} at ${ms}`);
    }
  }
});

test('an unknown scene raises', () => {
  assert.throws(() => drawEndScene(fakeCanvas().getContext('2d'), 'beach', 0, false), /unknown ending scene/);
});
