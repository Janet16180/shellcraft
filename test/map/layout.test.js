import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoom, pickAt, fitLabel, ART } from '../../src/map/layout.js';
import { readRoom } from '../../src/map/room.js';
import { observe, sampleTree, crowded } from './fixtures.js';

const none = new Set();
const roomWith = (dirs, files) => {
  const tree = sampleTree();
  tree.children.tmp = crowded(dirs, files);
  return readRoom(observe('/tmp', { tree }), none);
};
const inside = (box, x, y) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;

test('a small room shows every door and item and the exit', () => {
  const layout = layoutRoom(roomWith(3, 4));
  assert.equal(layout.doors.length, 3);
  assert.equal(layout.items.length, 4);
  assert.equal(layout.moreDoors, null);
  assert.equal(layout.moreItems, null);
  assert.equal(layout.exit.path, '/');
});

test('the root has no exit', () => {
  assert.equal(layoutRoom(readRoom(observe('/'), none)).exit, null);
});

test('a single door stands in the middle of the wall', () => {
  const layout = layoutRoom(roomWith(1, 0));
  assert.equal(layout.doors[0].cx, ART.width / 2);
});

test('too many doors show a marker with the count of the rest', () => {
  const layout = layoutRoom(roomWith(10, 12));
  assert.equal(layout.doors.length, 6);
  assert.equal(layout.moreDoors.count, 4);
  assert.deepEqual(layout.doors.map(d => d.name), ['d00', 'd01', 'd02', 'd03', 'd04', 'd05']);
});

test('too many items show a marker with the count of the rest', () => {
  const layout = layoutRoom(roomWith(0, 15));
  assert.equal(layout.items.length, 11);
  assert.equal(layout.moreItems.count, 4);
});

test('a room with many doors and few items gets a second row of doors', () => {
  const layout = layoutRoom(roomWith(12, 3));
  assert.equal(layout.doors.length, 12);
  assert.equal(layout.moreDoors, null);
  assert.ok(layout.wall > 52);
  assert.ok(layout.items.every(item => item.y > layout.wall));
});

test('the second row of doors leaves room for its labels', () => {
  const layout = layoutRoom(roomWith(12, 3), { narrow: true });
  const [first, second] = [layout.doors[0], layout.doors.at(-1)];
  assert.ok(second.y - (first.y + first.h) >= 18);
});

test('items in a sparse row sit closer together and get wider label slots', () => {
  const lone = layoutRoom(roomWith(0, 1)).items[0];
  assert.ok(lone.slot >= 90, `${lone.slot}`);
  const full = layoutRoom(roomWith(0, 6)).items;
  assert.ok(full.every(item => item.slot < 60));
  const pair = layoutRoom(roomWith(0, 2)).items;
  assert.ok(pair[1].cx - pair[0].cx <= 100);
});

test('a narrow map shows fewer doors and items per row', () => {
  const layout = layoutRoom(roomWith(7, 9), { narrow: true });
  assert.equal(layout.doors.length, 4);
  assert.equal(layout.moreDoors.count, 3);
  assert.equal(layout.items.length, 7);
  assert.equal(layout.moreItems.count, 2);
});

test('nothing is placed outside the picture or on top of another entry', () => {
  for (const narrow of [false, true]) {
    for (const [dirs, files] of [[0, 0], [1, 1], [7, 12], [12, 3], [20, 20], [3, 30]]) {
      const layout = layoutRoom(roomWith(dirs, files), { narrow });
      const boxes = [...layout.doors, ...layout.items];
      for (const box of boxes) {
        assert.ok(box.x >= 0 && box.x + box.w <= ART.width && box.y >= 0 && box.y + box.h <= ART.height, `${box.name} at ${dirs}/${files}`);
      }
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => {
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        assert.ok(apart, `${a.name} overlaps ${b.name} at ${dirs}/${files}`);
      }));
    }
  }
});

test('every label slot is wide enough for a readable name', () => {
  for (const narrow of [false, true]) {
    const layout = layoutRoom(roomWith(20, 20), { narrow });
    for (const entry of [...layout.doors, ...layout.items]) assert.ok(entry.slot >= 40, `${entry.name}: ${entry.slot}`);
  }
});

test('picking on a door, an item or the exit names what is there', () => {
  const layout = layoutRoom(readRoom(observe('/home/hero/forest/river'), none));
  const forest = layoutRoom(readRoom(observe('/home/hero/forest'), none));
  const cave = forest.doors[0];
  assert.deepEqual(pickAt(forest, cave.cx, cave.y + 10), { kind: 'door', name: 'cave', path: '/home/hero/forest/cave' });
  const fish = layout.items[0];
  assert.deepEqual(pickAt(layout, fish.cx, fish.y + 8), { kind: 'item', name: 'fish.txt', path: '/home/hero/forest/river/fish.txt' });
  const { exit } = layout;
  assert.deepEqual(pickAt(layout, exit.x + 2, exit.y + 2), { kind: 'exit', name: '..', path: '/home/hero/forest' });
  assert.equal(pickAt(layout, 2, 120), null);
});

test('the label above a door picks the door too', () => {
  const layout = layoutRoom(readRoom(observe('/home/hero/forest'), none));
  const door = layout.doors[1];
  assert.equal(pickAt(layout, door.cx, door.y - 6).name, door.name);
});

test('every hit box lies inside the picture', () => {
  const layout = layoutRoom(roomWith(7, 12));
  for (const entry of [...layout.doors, ...layout.items]) assert.ok(inside({ x: 0, y: 0, w: ART.width, h: ART.height }, entry.hit.x, entry.hit.y));
});

test('a label that fits is kept whole and a long one is cut with an ellipsis', () => {
  assert.equal(fitLabel('forest', 10), 'forest');
  assert.equal(fitLabel('scroll_of_ages.txt', 10), 'scroll_of…');
  assert.equal(fitLabel('scroll_of_ages.txt', 10).length, 10);
});

test('a door label keeps its slash when the name is cut', () => {
  assert.equal(fitLabel('configuration', 8, '/'), 'config…/');
  assert.equal(fitLabel('etc', 8, '/'), 'etc/');
});

test('a label with no room for one character and the ellipsis is a bug', () => {
  assert.throws(() => fitLabel('forest', 1), /room/);
});
