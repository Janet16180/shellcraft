import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStage, settle } from '../../src/map/stage.js';
import { paintFrame } from '../../src/map/render.js';
import { dir, file, symlink } from '../../src/backend/spec.js';
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

test('the crown chapter\'s throne room and every guild service room paint, at rest and moving', t => {
  globalThis.document = { createElement: fakeCanvas };
  t.after(() => delete globalThis.document);
  const tree = sampleTree();
  tree.children.home.children.hero.children.crown = dir({ 'sword.txt': file('', { owner: 'hero' }), 'order.txt': file('', { owner: 'hero' }) }, { owner: 'hero' });
  tree.children.srv = dir(Object.fromEntries(['mill', 'bakery', 'stables', 'lighthouse', 'granary'].map(name => [name, dir({ 'config.txt': file('', { mode: 0o600 }) })])));
  for (const cwd of ['/home/hero/crown', '/srv/mill', '/srv/bakery', '/srv/stables', '/srv/lighthouse', '/srv/granary']) {
    const stage = createStage(fakeCanvas(), false);
    settle(stage, observe(cwd, { tree }));
    for (const ms of [0, 1234, 98765]) assert.doesNotThrow(() => paintFrame(stage, ms), `${cwd} at ${ms}`);
  }
});

test('the hall of portals with its hard-linked names, the maze and the study paint, at rest and moving', t => {
  globalThis.document = { createElement: fakeCanvas };
  t.after(() => delete globalThis.document);
  const tree = sampleTree();
  const mine = { owner: 'hero' };
  const twin = { ...file('A map.\n', mine), ino: 1847, links: 2 };
  Object.assign(tree.children.home.children.hero.children, {
    portals: dir({ 'scroll.txt': twin, 'copy.txt': { ...twin }, old_portal: symlink('/home/hero/portals/gone.txt', mine) }, mine),
    maze: dir({ gate_k4m: symlink('/home/hero/maze/vaults/vault_x', mine), vaults: dir({}, { owner: 'hero', mode: 0o311 }) }, mine),
    memory: dir({ 'request.txt': file('', mine) }, mine),
  });
  for (const cwd of ['/home/hero/portals', '/home/hero/maze', '/home/hero/maze/vaults', '/home/hero/memory']) {
    const stage = createStage(fakeCanvas(), false);
    settle(stage, observe(cwd, { tree }));
    for (const ms of [0, 1234, 98765]) assert.doesNotThrow(() => paintFrame(stage, ms), `${cwd} at ${ms}`);
  }
});

test('the player\'s jobs paint in a room and on the stairs, working, asleep, and with more than fit', t => {
  globalThis.document = { createElement: fakeCanvas };
  t.after(() => delete globalThis.document);
  const jobs = [1, 2, 3, 4, 5].map(id => ({ id, pid: 4000 + id, cmd: `sleep ${id}00`, state: id % 2 ? 'running' : 'stopped', mark: ' ' }));
  for (const cwd of ['/home/hero', '/etc']) {
    const stage = createStage(fakeCanvas(), false);
    settle(stage, observe(cwd, { jobs }));
    assert.equal(stage.state.jobs.badges.length, 3);
    for (const ms of [0, 333, 1234, 98765]) assert.doesNotThrow(() => paintFrame(stage, ms), `${cwd} at ${ms}`);
    stage.state.trip = { direction: 'descend', progress: 0.5 };
    assert.doesNotThrow(() => paintFrame(stage, 500), `${cwd} on the stairs`);
  }
});

test('a job that ended bursts where its worker stood; one that only stopped does not', t => {
  globalThis.document = { createElement: fakeCanvas };
  t.after(() => delete globalThis.document);
  const job = (state, pid = 4001) => ({ id: 1, pid, cmd: 'sleep 100', state, mark: '+' });
  const stage = createStage(fakeCanvas(), false);
  settle(stage, observe('/home/hero', { jobs: [job('running')] }));
  settle(stage, observe('/home/hero', { jobs: [job('stopped')] }));
  assert.equal(stage.motion.particles.length, 0);
  settle(stage, observe('/home/hero', { jobs: [job('done')] }));
  assert.ok(stage.motion.particles.length > 0);
  assert.deepEqual(stage.state.jobs.badges, []);
});
