import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoom, pickAt, fitLabel, findEntry, ART, HERO_REST } from '../../src/map/layout.js';
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

test('no item, item label or marker reaches where the hero rests, however crowded the room', () => {
  const clear = (a, b) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
  const counts = Array.from({ length: 21 }, (_, i) => i);
  const cases = [false, true].flatMap(narrow => counts.flatMap(dirs => counts.map(files => ({ narrow, dirs, files }))));
  for (const { narrow, dirs, files } of cases) {
    const layout = layoutRoom(roomWith(dirs, files), { narrow });
    const areas = [...layout.items.map(item => item.hit), layout.moreItems?.area].filter(Boolean);
    for (const area of areas) assert.ok(clear(area, HERO_REST), `${dirs} doors, ${files} items, narrow ${narrow}: ${JSON.stringify(area)}`);
  }
});

test('the hero rests clear of the doors and their labels', () => {
  const layout = layoutRoom(roomWith(20, 0), { narrow: true });
  for (const door of layout.doors) assert.ok(door.hit.y + door.hit.h <= HERO_REST.y);
});

test('an item area holds a label even on the smallest screens', () => {
  const item = layoutRoom(roomWith(0, 1)).items[0];
  assert.ok(item.hit.y + item.hit.h - (item.y + item.h) >= 18);
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
  assert.equal(pickAt(layout, door.cx, door.y - 12).name, door.name);
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

test('a label is cut between characters, never inside one beyond the basic plane', () => {
  const name = '\u{1F600}'.repeat(12);
  const label = fitLabel(name, 6);
  assert.equal(label, `${'\u{1F600}'.repeat(5)}\u2026`);
  assert.equal(fitLabel('\u{1F600}'.repeat(3), 3), '\u{1F600}'.repeat(3));
});

test('a label with no room for one character and the ellipsis is a bug', () => {
  assert.throws(() => fitLabel('forest', 1), /room/);
});

test('an entry on show is found by its name, and .. names the exit', () => {
  const layout = layoutRoom(readRoom(observe('/home/hero/forest'), none));
  assert.equal(findEntry(layout, 'river').path, '/home/hero/forest/river');
  assert.equal(findEntry(layout, '..'), layout.exit);
  assert.equal(findEntry(layout, 'desert'), null);
  assert.equal(findEntry(layoutRoom(readRoom(observe('/'), none)), '..'), null);
});

const scrolls = names => {
  const tree = sampleTree();
  tree.children.tmp = { type: 'dir', mode: 0o755, owner: 'hero', group: 'hero', children: Object.fromEntries(names.map(n => [n, { type: 'file', content: '', mode: 0o644, owner: 'hero', group: 'hero' }])) };
  return readRoom(observe('/tmp', { tree }), none);
};

test('long item names get fewer items per row, so each label fits whole', () => {
  const names = ['scroll_ad7.txt', 'scroll_fy3.txt', 'scroll_hu6.txt', 'scroll_k4m.txt', 'scroll_wp9.txt'];
  const charPx = 6.5;
  const layout = layoutRoom(scrolls(names), { narrow: true, charPx });
  assert.equal(layout.items.length, 5);
  assert.equal(layout.moreItems, null);
  for (const item of layout.items) assert.ok(item.slot >= (item.name.length + 1) * charPx, `${item.name}: ${item.slot}`);
  assert.ok(layout.items[3].y > layout.items[0].y);
});

test('short names, or no font measure, keep the usual columns', () => {
  const short = layoutRoom(scrolls(['a', 'b', 'c', 'd']), { narrow: true, charPx: 6.5 });
  assert.equal(new Set(short.items.map(i => i.y)).size, 1);
  const unmeasured = layoutRoom(scrolls(['scroll_ad7.txt', 'scroll_fy3.txt', 'scroll_hu6.txt', 'scroll_k4m.txt']), { narrow: true });
  assert.equal(new Set(unmeasured.items.map(i => i.y)).size, 1);
});

test('however long the names, a row keeps at least three items on a narrow map and four on a wide one', () => {
  const names = Array.from({ length: 8 }, (_, i) => `${'a_very_long_name_indeed'.repeat(2)}${i}`);
  const rowOf = layout => layout.items.filter(i => i.y === layout.items[0].y).length;
  assert.equal(rowOf(layoutRoom(scrolls(names), { narrow: true, charPx: 6.5 })), 3);
  assert.equal(rowOf(layoutRoom(scrolls(names), { charPx: 4 })), 4);
});
