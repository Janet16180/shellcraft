import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRoom } from '../../src/map/describe.js';
import { dir, file } from '../../src/backend/spec.js';
import { observe, sampleTree, crowded } from './fixtures.js';

test('it says where you are, in which realm, and what the doors and items are', () => {
  const text = describeRoom(observe('/home/hero/forest/river'));
  assert.match(text, /\/home\/hero\/forest\/river/);
  assert.match(text, /River/);
  assert.match(text, /inside your home/i);
  assert.match(text, /fish\.txt/);
  assert.match(text, /No doors/);
  assert.match(text, /\.\. leads to \/home\/hero\/forest/);
});

test('doors carry a trailing slash like ls -F', () => {
  assert.match(describeRoom(observe('/home/hero/forest')), /cave\/, clearing\/, river\//);
});

test('outside home it says you are in the dungeon', () => {
  assert.match(describeRoom(observe('/etc')), /dungeon/i);
});

test('locked doors and items say why', () => {
  assert.match(describeRoom(observe('/')), /root\/ \(padlocked: you may not enter\)/);
  assert.match(describeRoom(observe('/etc')), /shadow \(chained: you may not read it\)/);
});

test('runnable items say so', () => {
  assert.match(describeRoom(observe('/usr/bin')), /cat \(you may run it\)/);
});

test('the root says its .. leads back to itself', () => {
  assert.match(describeRoom(observe('/')), /\.\. leads back to \/ itself/);
});

test('hidden files are listed only once revealed', () => {
  const obs = observe('/home/hero');
  assert.doesNotMatch(describeRoom(obs), /secret_map/);
  assert.match(describeRoom(obs, { revealed: new Set(['/home/hero']) }), /\.secret_map/);
});

test('a dark room and a vanished room say what happened', () => {
  const tree = sampleTree();
  tree.children.tmp = dir({ loot: file('') }, { mode: 0o711 });
  const dark = describeRoom(observe('/tmp', { tree }));
  assert.match(dark, /no read permission/);
  assert.doesNotMatch(dark, /loot/);
  delete tree.children.tmp;
  assert.match(describeRoom(observe('/tmp', { tree })), /no longer exists/);
});

test('a crowded room names the first entries and counts the rest', () => {
  const tree = sampleTree();
  tree.children.tmp = crowded(0, 30);
  const text = describeRoom(observe('/tmp', { tree }));
  assert.match(text, /f19\.txt/);
  assert.doesNotMatch(text, /f20\.txt/);
  assert.match(text, /and 10 more/);
});
