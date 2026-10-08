/**
 * Processes as creatures: which processes the map shows, what each looks
 * like, its label and where it hovers. Pure: the stage keeps the list and the
 * painter draws it.
 */

import { fitLabel } from './layout.js';

/** The most creatures on show at once. */
export const MAX_CREATURES = 6;

/** Where creatures hover (centre, art pixels): two columns at the sides, three rows, in order of use. */
export const SLOTS = [
  { cx: 274, cy: 82 }, { cx: 46, cy: 82 },
  { cx: 274, cy: 124 }, { cx: 46, cy: 124 },
  { cx: 274, cy: 166 }, { cx: 46, cy: 166 },
];

const DAEMON_KEY = 'daemon';
const DAEMON_NAME = 'shadow_daemon';
const NAME_CHARS = 14;

/**
 * @typedef {{pid: number, ppid: number, user: string, tty: string, stat: string, cpu: number, mem: number,
 *   cmd: string, key?: string}} ProcRecord
 */

/**
 * @typedef {object} Creature
 * @property {number} pid Its process id.
 * @property {string} key The game's key for the process ('daemon', 'stubborn', ...).
 * @property {'daemon'|'armoured'|'imp'} kind What it looks like.
 * @property {string} name Base name of its command.
 * @property {string} label "PID name", as shown on the map.
 * @property {number} slot Index into SLOTS.
 * @property {number} cx Centre x of its slot.
 * @property {number} cy Centre y of its slot.
 */

/**
 * The name of a process as ps would show it: the base name of the first word of its command.
 *
 * @param {string} cmd The command line.
 * @returns {string} The name, or '?' for an empty command.
 */
export function procName(cmd) {
  const first = cmd.trim().split(/\s+/)[0];
  return first.split('/').pop() || '?';
}

/**
 * What a process looks like. The daemon shows as itself only under its own
 * name; under any other name it is disguised as an ordinary imp.
 *
 * @param {ProcRecord} proc The process.
 * @returns {'daemon'|'armoured'|'imp'} Its kind.
 */
export function creatureKind({ key, cmd }) {
  let kind = 'imp';
  if (key === DAEMON_KEY && procName(cmd) === DAEMON_NAME) kind = 'daemon';
  else if (key.startsWith('stubborn')) kind = 'armoured';
  return kind;
}

function chosen(procs) {
  const all = procs.filter(p => p.key !== undefined && p.key !== 'shell');
  const daemons = all.filter(p => p.key === DAEMON_KEY).slice(0, MAX_CREATURES);
  const others = all.filter(p => p.key !== DAEMON_KEY).slice(0, MAX_CREATURES - daemons.length);
  return all.filter(p => daemons.includes(p) || others.includes(p));
}

/**
 * The creatures for a process list. A creature already on show keeps its
 * slot; a new one takes the first free slot.
 *
 * @param {ProcRecord[]} procs The observation's processes.
 * @param {Creature[]} [previous] The creatures on show before.
 * @returns {Creature[]} At most MAX_CREATURES creatures, in the order of procs.
 */
export function placeCreatures(procs, previous = []) {
  const shown = chosen(procs);
  const kept = new Map(previous.filter(c => shown.some(p => p.pid === c.pid)).map(c => [c.pid, c.slot]));
  const taken = new Set(kept.values());
  return shown.map(proc => {
    let slot = kept.get(proc.pid);
    if (slot === undefined) {
      slot = SLOTS.findIndex((_, i) => !taken.has(i));
      taken.add(slot);
    }
    const name = procName(proc.cmd);
    return {
      pid: proc.pid,
      key: proc.key,
      kind: creatureKind(proc),
      name,
      label: `${proc.pid} ${fitLabel(name, NAME_CHARS)}`,
      slot,
      cx: SLOTS[slot].cx,
      cy: SLOTS[slot].cy,
    };
  });
}

/**
 * The creatures that were on show before and are gone now.
 *
 * @param {Creature[]} previous Before.
 * @param {Creature[]} current Now.
 * @returns {Creature[]} The ones from previous whose process is not in current.
 */
export function vanished(previous, current) {
  return previous.filter(c => !current.some(n => n.pid === c.pid));
}

/**
 * Where a creature is at a moment: a sway of its own and a bob shared by all,
 * so that the gaps between rows (and their labels) never change.
 *
 * @param {Creature} creature The creature.
 * @param {number} t Animation clock in ms.
 * @returns {{x: number, y: number}} Its centre.
 */
export function hover({ cx, cy, slot }, t) {
  return {
    x: cx + Math.round(Math.sin(t / 700 + slot * 1.3) * 6),
    y: cy + Math.round(Math.sin(t / 500) * 3),
  };
}
