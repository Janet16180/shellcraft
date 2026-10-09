import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRoom } from '../../src/map/describe.js';
import { dir, file, symlink } from '../../src/backend/spec.js';
import { observe, sampleTree, crowded } from './fixtures.js';
import { packTar, gzip } from '../../src/backend/archive.js';

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

test('a door with x but without r says you may enter but not see inside', () => {
  const tree = sampleTree();
  tree.children.tmp = dir({ blind: dir({}, { mode: 0o711 }) });
  assert.match(describeRoom(observe('/tmp', { tree })), /blind\/ \(dark: you may enter but not list it\)/);
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

test('it names the creatures the map shows, by PID and name', () => {
  const proc = (pid, cmd, key) => ({ pid, ppid: 1, user: 'hero', tty: '?', stat: 'S', cpu: 0, mem: 0, cmd, key });
  const procs = [proc(100, '-bash', 'shell'), proc(412, 'greedy_imp', 'greedy'), proc(431, 'stubborn_imp', 'stubborn'), proc(4242, './shadow_daemon', 'daemon')];
  const text = describeRoom(observe('/home/hero', { procs }));
  assert.match(text, /Creatures here: 412 greedy_imp, 431 stubborn_imp, 4242 shadow_daemon\./);
  assert.doesNotMatch(text, /bash/);
  assert.doesNotMatch(describeRoom(observe('/home/hero')), /Creatures/);
});

test('links say where they lead, a dangling one that it leads nowhere, and a linked room is named for its real place', () => {
  const tree = sampleTree();
  Object.assign(tree.children.home.children.hero.children, {
    portal: symlink('/home/hero/forest/cave/deep', { owner: 'hero' }),
    broken: symlink('nowhere', { owner: 'hero' }),
  });
  const home = describeRoom(observe('/home/hero', { tree }));
  assert.match(home, /portal -> \/home\/hero\/forest\/cave\/deep \(a link\)/);
  assert.match(home, /broken -> nowhere \(a broken link: it leads nowhere\)/);
  assert.match(describeRoom(observe('/home/hero/portal', { tree })), /\/home\/hero\/portal, Dark Cave/);
});

test('the player\'s jobs are described in every room, after what is in it', () => {
  const jobs = [{ id: 1, pid: 4242, cmd: 'sleep 30', state: 'running', mark: '-' }, { id: 2, pid: 4243, cmd: 'sleep 100', state: 'stopped', mark: '+' }];
  for (const cwd of ['/home/hero/forest', '/etc']) {
    assert.match(describeRoom(observe(cwd, { jobs })), /\. Your jobs: %1 sleep 30 \(running\), %2 sleep 100 \(stopped\)\.$/, cwd);
  }
  assert.doesNotMatch(describeRoom(observe('/etc')), /jobs/);
});

test('archives say what they are packed as, as file would', () => {
  const mine = { owner: 'hero' };
  const tar = packTar([{ path: 'camp/', type: 'dir', mode: 0o755, owner: 'hero', group: 'hero', mtime: 0 }]);
  const tree = sampleTree();
  tree.children.home.children.hero.children.travel = dir({
    'camp.tar': file(tar, mine), 'camp.tgz': file(gzip(tar), mine), 'notes.gz': file(gzip('x\n'), mine),
  }, mine);
  const text = describeRoom(observe('/home/hero/travel', { tree }));
  assert.match(text, /camp\.tar \(a tar archive, drawn as a chest\)/);
  assert.match(text, /camp\.tgz \(a compressed tar archive, drawn as a strapped chest\)/);
  assert.match(text, /notes\.gz \(gzip data, drawn as a tied bundle\)/);
});
