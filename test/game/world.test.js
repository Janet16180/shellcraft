import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePatch } from '../../src/backend/spec.js';
import { baseWorld, restore, HOME_NAMES } from '../../src/game/world.js';

const PLAYER = { home: '/home/hero', user: 'hero' };

function nodeIn(patch, path) {
  const top = patch.find(op => op.op === 'put' && (path === op.path || path.startsWith(`${op.path}/`)));
  if (!top) return undefined;
  const rest = path.slice(top.path.length).split('/').filter(Boolean);
  return rest.reduce((node, name) => node?.children?.[name], top.node);
}

function walk(node, path, visit) {
  visit(node, path);
  for (const [name, child] of Object.entries(node.children ?? {})) walk(child, `${path}/${name}`, visit);
}

test('the base world is a well-formed patch that ends with the player at home', () => {
  const patch = baseWorld(PLAYER);
  assert.equal(validatePatch(patch), patch);
  assert.deepEqual(patch.at(-1), { op: 'cd', path: '/home/hero' });
});

test('the base world leaves /usr and /dev to the backend', () => {
  const paths = baseWorld(PLAYER).filter(op => op.op === 'put').map(op => op.path);
  assert.deepEqual(paths.sort(), ['/etc', '/home', '/root', '/tmp', '/var']);
});

test('the home starts with the cottage files and every overworld area', () => {
  const home = nodeIn(baseWorld(PLAYER), '/home/hero');
  assert.deepEqual(Object.keys(home.children).sort(), [...HOME_NAMES].sort());
  for (const name of ['readme.txt', '.secret_map', '.bashrc', 'forest', 'junk', 'library', 'tower', 'market', 'gate']) {
    assert.ok(HOME_NAMES.includes(name), name);
  }
  assert.equal(nodeIn(baseWorld(PLAYER), '/home/hero/forest/cave/deep/ancient_key.txt').type, 'file');
});

test('everything in the home belongs to the player, and the home itself is private to them', () => {
  const home = nodeIn(baseWorld(PLAYER), '/home/hero');
  assert.equal(home.mode, 0o750);
  walk(home, '/home/hero', (node, path) => {
    assert.equal(node.owner, 'hero', path);
    assert.equal(node.group, 'hero', path);
  });
});

test('nothing outside the home belongs to the player', () => {
  for (const op of baseWorld(PLAYER).filter(o => o.op === 'put')) {
    walk(op.node, op.path, (node, path) => {
      if (path === '/home/hero' || path.startsWith('/home/hero/')) return;
      assert.notEqual(node.owner, 'hero', path);
    });
  }
});

test('the dungeon has the owners and modes of Ubuntu 24.04', () => {
  const patch = baseWorld(PLAYER);
  const expect = {
    '/home': ['root', 'root', 0o755],
    '/root': ['root', 'root', 0o700],
    '/tmp': ['root', 'root', 0o1777],
    '/etc/passwd': ['root', 'root', 0o644],
    '/var/log': ['root', 'syslog', 0o775],
    '/var/log/syslog': ['syslog', 'adm', 0o640],
    '/var/log/auth.log': ['syslog', 'adm', 0o640],
    '/var/log/dpkg.log': ['root', 'root', 0o644],
  };
  for (const [path, [owner, group, mode]] of Object.entries(expect)) {
    const node = nodeIn(patch, path);
    assert.deepEqual([node.owner, node.group, node.mode], [owner, group, mode], path);
  }
});

test('the system files name the player, their home and the host', () => {
  const patch = baseWorld(PLAYER);
  assert.match(nodeIn(patch, '/etc/passwd').content, /^hero:x:1000:1000:Hero,,,:\/home\/hero:\/bin\/bash$/m);
  assert.match(nodeIn(patch, '/etc/group').content, /^hero:x:1000:$/m);
  assert.equal(nodeIn(patch, '/etc/hostname').content, 'kernelia\n');
  assert.match(nodeIn(patch, '/home/hero/readme.txt').content, /-- The Guardian of Root\n$/);
});

test('every line of the syslog has the rsyslog timestamp, the host and a tag', () => {
  const lines = nodeIn(baseWorld(PLAYER), '/var/log/syslog').content.trimEnd().split('\n');
  for (const line of lines) assert.match(line, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}\+00:00 kernelia [\w-]+(\[\d+\])?: /, line);
});

test('a home that is not /home/USER is a bug and raises', () => {
  assert.throws(() => baseWorld({ home: '/root', user: 'hero' }), /home/);
  assert.throws(() => restore('forest', { home: '/home/other', user: 'hero' }), /home/);
});

test('restoring an area puts it back exactly as the base world has it', () => {
  const [op] = restore('forest', PLAYER);
  assert.deepEqual(op, { op: 'put', path: '/home/hero/forest', node: nodeIn(baseWorld(PLAYER), '/home/hero/forest') });
  assert.equal(validatePatch(restore('readme.txt', PLAYER)).length, 1);
});

test('restoring a name the home never had raises', () => {
  assert.throws(() => restore('camp', PLAYER), /unknown/);
});

test('another player gets their own name and home in every owned node', () => {
  const player = { home: '/home/ada', user: 'ada' };
  const home = nodeIn(baseWorld(player), '/home/ada');
  walk(home, '/home/ada', (node, path) => assert.equal(node.owner, 'ada', path));
  assert.match(nodeIn(baseWorld(player), '/home/ada/forest/river/fish.txt').content, /\/home\/ada\/forest\/river/);
});
