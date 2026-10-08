import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeCreatures, creatureKind, procName, vanished, hover, SLOTS, MAX_CREATURES } from '../../src/map/creatures.js';

const proc = (pid, cmd, key) => ({ pid, ppid: 1, user: 'hero', tty: '?', stat: 'S', cpu: 0.1, mem: 0.2, cmd, key });

test('only processes with a key other than the shell become creatures', () => {
  const procs = [proc(1, 'init', undefined), proc(100, '-bash', 'shell'), proc(412, 'imp', 'imp'), proc(500, 'ps aux', undefined)];
  assert.deepEqual(placeCreatures(procs).map(c => c.pid), [412]);
});

test('the name is the base name of the first word of the command', () => {
  assert.equal(procName('./shadow_daemon --haunt'), 'shadow_daemon');
  assert.equal(procName('/usr/bin/greedy_imp'), 'greedy_imp');
  assert.equal(procName('imp'), 'imp');
  assert.equal(procName('  sleep 100'), 'sleep');
  assert.equal(procName(''), '?');
});

test('the daemon key with the shadow_daemon command is the Shadow Daemon', () => {
  assert.equal(creatureKind(proc(1, './shadow_daemon', 'daemon')), 'daemon');
  assert.equal(creatureKind(proc(1, '/home/hero/tower/shadow_daemon -x', 'daemon')), 'daemon');
});

test('a daemon under another name is disguised as an ordinary imp', () => {
  const [creature] = placeCreatures([proc(533, 'nibbler --quiet', 'daemon')]);
  assert.equal(creature.kind, 'imp');
  assert.equal(creature.key, 'daemon');
  assert.equal(creature.label, '533 nibbler');
});

test('stubborn keys are armoured imps and any other key is an imp', () => {
  assert.equal(creatureKind(proc(1, 'stubborn_imp', 'stubborn')), 'armoured');
  assert.equal(creatureKind(proc(1, 'stubborn_imp', 'stubborn2')), 'armoured');
  assert.equal(creatureKind(proc(1, 'imp', 'imp')), 'imp');
  assert.equal(creatureKind(proc(1, 'greedy_imp', 'greedy')), 'imp');
  assert.equal(creatureKind(proc(1, 'shadow_daemon', 'imp')), 'imp');
});

test('each creature is labelled with its PID and name', () => {
  const labels = placeCreatures([proc(412, './greedy_imp', 'greedy'), proc(4242, './shadow_daemon', 'daemon')]).map(c => c.label);
  assert.deepEqual(labels, ['412 greedy_imp', '4242 shadow_daemon']);
});

test('a very long name is cut so the label stays short', () => {
  const [creature] = placeCreatures([proc(7, 'a_very_long_process_name_indeed', 'imp')]);
  assert.ok([...creature.label].length <= 20, creature.label);
  assert.match(creature.label, /^7 a_very.*…$/);
});

test('creatures take distinct slots in order, at most six', () => {
  const procs = Array.from({ length: 9 }, (_, i) => proc(400 + i, 'imp', `imp${i}`));
  const placed = placeCreatures(procs);
  assert.equal(placed.length, MAX_CREATURES);
  assert.deepEqual(placed.map(c => c.slot), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(placed.map(c => c.pid), [400, 401, 402, 403, 404, 405]);
  assert.deepEqual(placed.map(c => [c.cx, c.cy]), SLOTS.map(s => [s.cx, s.cy]));
});

test('the daemon is always on show, even in a crowd', () => {
  const procs = [...Array.from({ length: 8 }, (_, i) => proc(400 + i, 'imp', `imp${i}`)), proc(900, 'nibbler', 'daemon')];
  const placed = placeCreatures(procs);
  assert.equal(placed.length, MAX_CREATURES);
  assert.ok(placed.some(c => c.key === 'daemon'));
});

test('a creature keeps its slot when another one leaves, and a newcomer takes the free slot', () => {
  const first = placeCreatures([proc(1, 'imp', 'a'), proc(2, 'imp', 'b'), proc(3, 'imp', 'c')]);
  const second = placeCreatures([proc(1, 'imp', 'a'), proc(3, 'imp', 'c')], first);
  assert.deepEqual(second.map(c => [c.pid, c.slot]), [[1, 0], [3, 2]]);
  const third = placeCreatures([proc(1, 'imp', 'a'), proc(3, 'imp', 'c'), proc(4, 'imp', 'd')], second);
  assert.deepEqual(third.map(c => [c.pid, c.slot]), [[1, 0], [3, 2], [4, 1]]);
});

test('vanished lists the creatures that are gone', () => {
  const before = placeCreatures([proc(1, 'imp', 'a'), proc(2, 'stubborn_imp', 'stubborn')]);
  const after = placeCreatures([proc(1, 'imp', 'a')], before);
  assert.deepEqual(vanished(before, after).map(c => c.pid), [2]);
  assert.deepEqual(vanished(after, after), []);
  assert.deepEqual(vanished([], after), []);
});

test('slots keep creatures and their labels apart', () => {
  for (const [i, a] of SLOTS.entries()) {
    for (const b of SLOTS.slice(i + 1)) {
      const apart = Math.abs(a.cx - b.cx) >= 200 || Math.abs(a.cy - b.cy) >= 40;
      assert.ok(apart, `${JSON.stringify(a)} and ${JSON.stringify(b)}`);
    }
  }
});

test('hovering moves gently and every creature bobs in step, so labels never collide', () => {
  const [a, b] = placeCreatures([proc(1, 'imp', 'a'), proc(2, 'imp', 'b')]);
  assert.deepEqual(hover(a, 0), { x: a.cx, y: a.cy });
  for (const t of [0, 300, 1234, 9999]) {
    const pa = hover(a, t);
    const pb = hover(b, t);
    assert.equal(pa.y - a.cy, pb.y - b.cy);
    assert.ok(Math.abs(pa.x - a.cx) <= 8 && Math.abs(pa.y - a.cy) <= 4);
  }
});
