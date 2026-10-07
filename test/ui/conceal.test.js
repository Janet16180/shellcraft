import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conceal, concealEffects } from '../../src/ui/conceal.js';

const leaf = content => ({ type: 'file', content, children: {} });
const obs = {
  cwd: '/home/hero',
  home: '/home/hero',
  tree: { type: 'dir', children: { home: { type: 'dir', children: { hero: { type: 'dir', children: { 'a.txt': leaf('a'), note_k7m: leaf('n') } } } } } },
};

test('conceal drops the paths from a copy of the tree and leaves the original alone', () => {
  const hidden = conceal(obs, ['/home/hero/note_k7m']);
  assert.deepEqual(Object.keys(hidden.tree.children.home.children.hero.children), ['a.txt']);
  assert.deepEqual(Object.keys(obs.tree.children.home.children.hero.children), ['a.txt', 'note_k7m']);
  assert.equal(hidden.cwd, obs.cwd);
});

test('conceal with nothing to hide, or a path that is not there, returns the same observation', () => {
  assert.equal(conceal(obs, []), obs);
  assert.deepEqual(conceal(obs, ['/home/hero/gone', '/nowhere/x']), obs);
});

test('concealEffects drops the effects on hidden paths', () => {
  const effects = [{ kind: 'created', path: '/home/hero/note_k7m' }, { kind: 'travel', from: '/', to: '/home/hero' }, { kind: 'created', path: '/home/hero/b' }];
  assert.deepEqual(concealEffects(effects, ['/home/hero/note_k7m']), effects.slice(1));
});
