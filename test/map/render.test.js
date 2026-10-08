import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStage, settle } from '../../src/map/stage.js';
import { paintFrame } from '../../src/map/render.js';
import { symlink } from '../../src/backend/spec.js';
import { observe, sampleTree } from './fixtures.js';

// A canvas whose 2D context accepts every drawing call and records nothing.
function fakeCanvas() {
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({}, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'createPattern') return () => ({});
      if (key === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'measureText') return text => ({ width: String(text).length * 6 });
      return () => {};
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
  return { width: 320, height: 200, clientWidth: 640, clientHeight: 400, getContext: () => ctx, setAttribute: () => {}, style: {} };
}

test('rooms holding symbolic links paint in the overworld and the dungeon', t => {
  globalThis.document = { createElement: fakeCanvas };
  t.after(() => delete globalThis.document);
  const tree = sampleTree();
  Object.assign(tree.children.home.children.hero.children, {
    portal: symlink('/home/hero/forest/cave/deep', { owner: 'hero' }),
    broken: symlink('nowhere', { owner: 'hero' }),
  });
  tree.children.tmp.children.out = symlink('/home/hero', { owner: 'hero' });
  for (const cwd of ['/home/hero', '/home/hero/portal', '/tmp']) {
    const stage = createStage(fakeCanvas(), true);
    settle(stage, observe(cwd, { tree }));
    assert.doesNotThrow(() => paintFrame(stage, 0), cwd);
  }
});
