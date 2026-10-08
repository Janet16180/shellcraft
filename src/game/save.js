/**
 * The save file: progress that survives a reload. The world itself is not
 * saved; a chapter rebuilds it when it starts.
 *
 * Stored text is external input, so it is parsed and validated here once.
 * Damaged data never stops the game: the player starts fresh and the UI is
 * told why.
 *
 * @typedef {object} Save
 * @property {string|null} chapter The chapter to resume, or null for the default.
 * @property {string[]} cleared Ids of the chapters cleared at least once, without duplicates.
 * @property {number} xp Total XP, a non-negative integer.
 * @property {boolean} sound Whether sound is on.
 * @property {boolean} introSeen Whether the intro was watched or skipped.
 * @property {string[]} explainersSeen Ids of the chapter explainers watched or skipped, without duplicates.
 * @property {'stacked'|'side'} layout How the page is laid out: 'stacked' puts the map and the
 *   quest panel side by side above a full-width terminal; 'side' puts the terminal on the right.
 * @property {Object<string, number[]>} paid Per chapter id, the indices of the tasks that already
 *   paid their XP, so restarting or replaying a chapter does not pay them again.
 * @property {Progress|null} progress Where the player is inside the chapter they
 *   are playing; null between chapters.
 *
 * @typedef {object} Progress
 * @property {string} chapter The chapter it belongs to.
 * @property {'quest'|'boss'} phase
 * @property {boolean[]} tasks Which tasks are done, by index.
 * @property {number[]} hints Hint levels shown per task (0 to 3), as long as tasks.
 * @property {number} bossHints Hint levels shown for the boss (0 to 3).
 */

import { HINT_LEVELS } from './progress.js';

export const SAVE_KEY = 'shellcraft-save-v2';
export const V1_SAVE_KEY = 'shellcraft-save-v1';

/** Shellcraft 1 stored the chapter as an index into this order. */
const V1_IDS = ['awakening', 'forest', 'unseen', 'camp', 'junkyard', 'library', 'tower', 'market', 'gate', 'daemon'];

/** The page layouts a save can choose, the default first. */
export const LAYOUTS = Object.freeze(['stacked', 'side']);

const isRecord = x => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCount = x => Number.isInteger(x) && x >= 0;
const isV1Index = x => Number.isInteger(x) && x >= 0 && x < V1_IDS.length;
const isHintCount = x => Number.isInteger(x) && x >= 0 && x <= HINT_LEVELS;
const isIdList = x => Array.isArray(x) && x.every(id => typeof id === 'string');
const isPaid = x => isRecord(x) && Object.values(x).every(list => Array.isArray(list) && list.every(isCount));

/**
 * Progress for a new player.
 *
 * @returns {Save} No chapter chosen, nothing cleared, no XP, sound off, intro and explainers not seen,
 *   the default layout, no task paid.
 */
export function freshSave() {
  return { chapter: null, cleared: [], xp: 0, sound: false, introSeen: false, explainersSeen: [], layout: LAYOUTS[0], paid: {}, progress: null };
}

function parseJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return data;
}

function isProgress(p) {
  return isRecord(p)
    && typeof p.chapter === 'string'
    && (p.phase === 'quest' || p.phase === 'boss')
    && Array.isArray(p.tasks) && p.tasks.every(done => typeof done === 'boolean')
    && Array.isArray(p.hints) && p.hints.length === p.tasks.length && p.hints.every(isHintCount)
    && isHintCount(p.bossHints);
}

function fromV2(data) {
  const valid = isRecord(data)
    && data.version === 2
    && (data.chapter === null || typeof data.chapter === 'string')
    && isIdList(data.cleared)
    && isCount(data.xp)
    && typeof data.sound === 'boolean'
    && typeof data.introSeen === 'boolean'
    && (data.progress == null || isProgress(data.progress));
  return valid ? readV2(data) : null;
}

// Saves from before the layout choice, the paid record or the explainers lack them; a broken one is not
// worth losing progress over.
function readV2({ chapter, cleared, xp, sound, introSeen, explainersSeen, layout, paid, progress = null }) {
  const kept = progress && { chapter: progress.chapter, phase: progress.phase, tasks: progress.tasks, hints: progress.hints, bossHints: progress.bossHints };
  const shape = LAYOUTS.includes(layout) ? layout : LAYOUTS[0];
  const tasks = isPaid(paid) ? Object.fromEntries(Object.entries(paid).map(([id, list]) => [id, [...new Set(list)]])) : {};
  const seen = isIdList(explainersSeen) ? [...new Set(explainersSeen)] : [];
  return { chapter, cleared: [...new Set(cleared)], xp, sound, introSeen, explainersSeen: seen, layout: shape, paid: tasks, progress: kept };
}

function fromV1(data) {
  const valid = isRecord(data)
    && isV1Index(data.chapter)
    && isV1Index(data.maxChapter)
    && isCount(data.xp)
    && typeof data.sound === 'boolean';
  // v1 counted every chapter below maxChapter as cleared.
  return valid
    ? { ...freshSave(), chapter: V1_IDS[data.chapter], cleared: V1_IDS.slice(0, data.maxChapter), xp: data.xp, sound: data.sound }
    : null;
}

/**
 * Read the stored save. A v2 save wins; a v1 save is migrated only when no v2
 * save exists.
 *
 * @param {{v2: string|null, v1: string|null}} stored The raw text under SAVE_KEY and V1_SAVE_KEY.
 * @returns {{save: Save, status: 'new'|'resumed'|'migrated'|'damaged'}} The save to
 *   play with and how it was obtained. 'damaged' comes with a fresh save.
 */
export function parseSave({ v2, v1 }) {
  let result = { save: freshSave(), status: 'new' };
  if (v2 != null) {
    const save = fromV2(parseJSON(v2));
    result = save ? { save, status: 'resumed' } : { save: freshSave(), status: 'damaged' };
  } else if (v1 != null) {
    const save = fromV1(parseJSON(v1));
    result = save ? { save, status: 'migrated' } : { save: freshSave(), status: 'damaged' };
  }
  return result;
}

/**
 * Write a save as the text stored under SAVE_KEY.
 *
 * @param {Save} save The progress to store.
 * @returns {string} JSON text with the format version.
 */
export function serializeSave({ chapter, cleared, xp, sound, introSeen, explainersSeen, layout, paid, progress }) {
  return JSON.stringify({ version: 2, chapter, cleared, xp, sound, introSeen, explainersSeen, layout, paid, progress });
}
