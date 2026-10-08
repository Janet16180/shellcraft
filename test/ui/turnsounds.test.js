import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnSounds } from '../../src/ui/turnsounds.js';

const leaf = { type: 'file', content: '', children: {} };
const dir = children => ({ type: 'dir', children });
const obs = { cwd: '/home/hero', home: '/home/hero', tree: dir({ home: dir({ hero: dir({ '.map': leaf, plain: dir({ a: leaf }) }) }) }) };
const sounds = (effects, output = []) => turnSounds({ result: { output }, effects, obs });

test('a quiet line makes no sound', () => {
  assert.deepEqual(sounds([]), []);
});

test('an error and a move each make their sound', () => {
  assert.deepEqual(sounds([{ kind: 'travel', from: '/', to: '/home' }], [{ stream: 'err' }]), ['err', 'step']);
});

test('ls -a makes the discover sound only where something is hidden', () => {
  assert.deepEqual(sounds([{ kind: 'reveal', path: '/home/hero' }]), ['discover']);
  assert.deepEqual(sounds([{ kind: 'reveal', path: '/home/hero/plain' }]), []);
});

test('a boss room\'s hidden thing found by ls is a discovery, not a creation', () => {
  assert.deepEqual(sounds([{ kind: 'created', path: '/home/hero/x', found: true }]), ['discover']);
  assert.deepEqual(sounds([{ kind: 'created', path: '/home/hero/x' }]), ['create']);
});

test('removing and creating in one line make both sounds, each once', () => {
  const effects = [{ kind: 'removed', path: '/a' }, { kind: 'removed', path: '/b' }, { kind: 'created', path: '/c' }];
  assert.deepEqual(sounds(effects), ['create', 'remove']);
});
