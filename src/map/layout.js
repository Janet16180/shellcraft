/**
 * Where everything in a room goes, in art pixels (the map paints a 320 x 200
 * picture and scales it up). Doors stand along the back wall, items lie on the
 * floor in rows, the exit is a stairway at the bottom. A room with more than
 * fits shows a "+N" marker in the last slot.
 */

/** Size of the picture in art pixels. */
export const ART = { width: 320, height: 200 };

const MARGIN = 12;
const USABLE = ART.width - 2 * MARGIN;
const DOOR = { w: 22, h: 34, top: 18 };
const DOOR_ROW = 52;
const ITEM_ROW = 44;
const WALL = 52;
const ITEM = 16;
const SPARSE_ITEM_STEP = 96;
const LABEL_ABOVE = 14;
const ITEM_HIT = { above: 4, below: 20 };
const EXIT = { x: 146, y: 186, w: 28, h: 14, label: 26 };
const CAPACITY = { wide: { doors: 7, cols: 6 }, narrow: { doors: 5, cols: 4 } };

/**
 * @typedef {import('./room.js').Entry & {kind: 'door'|'item', x: number, y: number, w: number, h: number,
 *   cx: number, slot: number, hit: {x: number, y: number, w: number, h: number}}} Placed
 *   An entry with its sprite box, its centre, the width its label may use (slot) and its click box.
 */

/**
 * @typedef {object} Layout
 * @property {string} path The room's path.
 * @property {'open'|'dark'|'gone'} status As in the room.
 * @property {number} wall Height of the back wall.
 * @property {Placed[]} doors
 * @property {Placed[]} items
 * @property {{count: number, cx: number, y: number, slot: number}|null} moreDoors Marker for doors that did not fit.
 * @property {{count: number, cx: number, y: number, slot: number}|null} moreItems Marker for items that did not fit.
 * @property {{path: string, x: number, y: number, w: number, h: number, hit: object}|null} exit
 */

function fit(list, capacity) {
  const overflow = list.length > capacity;
  const shown = overflow ? list.slice(0, capacity - 1) : list;
  return { shown, more: list.length - shown.length };
}

function doorSpots(count, perRow) {
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow);
    const slot = USABLE / Math.min(perRow, count - row * perRow);
    return { row, cx: Math.round(MARGIN + slot * ((i % perRow) + 0.5)), slot: Math.floor(slot) };
  });
}

function itemSpots(count, cols) {
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, count - row * cols);
    const slot = Math.max(USABLE / cols, Math.min(SPARSE_ITEM_STEP, USABLE / inRow));
    const left = MARGIN + (USABLE - inRow * slot) / 2;
    return { row, cx: Math.round(left + slot * ((i % cols) + 0.5)), slot: Math.floor(slot) };
  });
}

const box = (x, y, w, h) => ({ x, y, w, h });

function placeDoor(door, spot) {
  const y = DOOR.top + spot.row * DOOR_ROW;
  const hit = box(spot.cx - Math.floor(spot.slot / 2), y - LABEL_ABOVE, spot.slot, DOOR.h + LABEL_ABOVE);
  return { ...door, kind: 'door', x: spot.cx - DOOR.w / 2, y, w: DOOR.w, h: DOOR.h, cx: spot.cx, slot: spot.slot, hit };
}

function placeItem(item, spot, top) {
  const y = top + spot.row * ITEM_ROW;
  const hit = box(spot.cx - Math.floor(spot.slot / 2), y - ITEM_HIT.above, spot.slot, ITEM + ITEM_HIT.above + ITEM_HIT.below);
  return { ...item, kind: 'item', x: spot.cx - ITEM / 2, y, w: ITEM, h: ITEM, cx: spot.cx, slot: spot.slot, hit };
}

function marker(fitted, spots, y) {
  const spot = spots[spots.length - 1];
  return fitted.more ? { count: fitted.more, cx: spot.cx, y: y(spot), slot: spot.slot } : null;
}

/**
 * Place a room's doors, items and exit.
 *
 * @param {import('./room.js').Room} room The room, from readRoom.
 * @param {{narrow?: boolean}} [opts] Narrow maps (small screens) get fewer, wider slots so labels stay readable.
 * @returns {Layout} The layout.
 */
export function layoutRoom(room, { narrow = false } = {}) {
  const cap = narrow ? CAPACITY.narrow : CAPACITY.wide;
  const doorRows = room.doors.length > cap.doors && room.items.length <= cap.cols ? 2 : 1;
  const wall = WALL + DOOR_ROW * (doorRows - 1);
  const itemTop = wall + 12;
  const doors = fit(room.doors, cap.doors * doorRows);
  const items = fit(room.items, cap.cols * (3 - doorRows));
  const dSpots = doorSpots(doors.shown.length + (doors.more ? 1 : 0), cap.doors);
  const iSpots = itemSpots(items.shown.length + (items.more ? 1 : 0), cap.cols);
  const exit = room.exit && { path: room.exit, ...box(EXIT.x, EXIT.y, EXIT.w, EXIT.h), hit: box(EXIT.x - 4, EXIT.y - 4, EXIT.w + EXIT.label, ART.height - EXIT.y + 4) };

  return {
    path: room.path,
    status: room.status,
    wall,
    doors: doors.shown.map((door, i) => placeDoor(door, dSpots[i])),
    items: items.shown.map((item, i) => placeItem(item, iSpots[i], itemTop)),
    moreDoors: marker(doors, dSpots, spot => DOOR.top + spot.row * DOOR_ROW),
    moreItems: marker(items, iSpots, spot => itemTop + spot.row * ITEM_ROW),
    exit: exit || null,
  };
}

/**
 * What a point of the picture lands on.
 *
 * @param {Layout} layout The current layout.
 * @param {number} x Art x.
 * @param {number} y Art y.
 * @returns {{kind: 'door'|'item'|'exit', name: string, path: string}|null} The pick, or null on empty floor or wall.
 */
export function pickAt(layout, x, y) {
  const hits = b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
  const found = [...layout.doors, ...layout.items].find(entry => hits(entry.hit));

  let pick = null;
  if (found) pick = { kind: found.kind, name: found.name, path: found.path };
  else if (layout.exit && hits(layout.exit.hit)) pick = { kind: 'exit', name: '..', path: layout.exit.path };
  return pick;
}

/**
 * The door, item or exit on show with a given name.
 *
 * @param {Layout} layout The current layout.
 * @param {string} name An entry's name, or '..' for the exit.
 * @returns {Placed|{path: string, x: number, y: number, w: number, h: number}|null} The entry, or null if nothing by that name is on show.
 */
export function findEntry(layout, name) {
  const entry = [...layout.doors, ...layout.items].find(e => e.name === name) ?? null;
  return entry ?? (name === '..' ? layout.exit : null);
}

/**
 * Cut a label to a number of characters, marking the cut with an ellipsis.
 * The suffix (a door's slash) always survives.
 *
 * @param {string} text The full name.
 * @param {number} max Characters available, suffix included.
 * @param {string} [suffix] Appended after the (possibly cut) text.
 * @returns {string} The label.
 * @throws {Error} If max leaves no room for one character, the ellipsis and the suffix.
 */
export function fitLabel(text, max, suffix = '') {
  if (max < suffix.length + 2) throw new Error(`no room for a label in ${max} characters`);

  const room = max - suffix.length;
  const body = text.length <= room ? text : `${text.slice(0, room - 1)}…`;
  return body + suffix;
}
