/**
 * Progress rules (DESIGN section 5): XP, hint costs, ranks, hearts, which
 * chapters are open, and replays. Pure functions over plain values.
 */

/** XP paid for a task, a boss and the bonus for clearing a chapter. */
export const XP = Object.freeze({ task: 10, boss: 30, clear: 20 });

export const MAX_HEARTS = 3;

/** XP each hint level takes off the payout: the nudge is free. */
const HINT_COSTS = [0, 3, 5];

/** How many hints each task and boss has: one per cost. */
export const HINT_LEVELS = HINT_COSTS.length;
const MIN_PAYOUT = 2;
const STARTABLE = new Set(['playing', 'open', 'cleared']);

const RANKS = [
  [0, 'Novice'],
  [150, 'Apprentice'],
  [400, 'Adept'],
  [750, 'Shell Mage'],
  [1100, 'Root Wizard'],
];

/**
 * XP a task or boss pays after the hints the player used.
 *
 * @param {number} base XP.task or XP.boss.
 * @param {number} hintsUsed How many hint levels were shown (0 to 3).
 * @param {boolean} replay Whether the chapter was cleared before.
 * @returns {number} The XP to award.
 * @throws {Error} If hintsUsed is outside 0 to 3.
 */
export function payout(base, hintsUsed, replay) {
  if (!Number.isInteger(hintsUsed) || hintsUsed < 0 || hintsUsed > HINT_LEVELS) {
    throw new Error(`hints used must be 0 to ${HINT_LEVELS}, got ${hintsUsed}`);
  }

  const cost = HINT_COSTS.slice(0, hintsUsed).reduce((sum, c) => sum + c, 0);
  return replay ? 0 : Math.max(MIN_PAYOUT, base - cost);
}

/**
 * The hint the player would see next and the XP it takes off the payout.
 *
 * @param {number} base XP.task or XP.boss.
 * @param {number} hintsUsed How many hint levels were shown already.
 * @param {boolean} replay Whether the chapter was cleared before.
 * @returns {{level: number, cost: number}|null} Null when all three were shown.
 */
export function nextHint(base, hintsUsed, replay) {
  let hint = null;
  if (hintsUsed < HINT_LEVELS) {
    const cost = payout(base, hintsUsed, replay) - payout(base, hintsUsed + 1, replay);
    hint = { level: hintsUsed + 1, cost };
  }
  return hint;
}

/**
 * The rank for an XP total.
 *
 * @param {number} xp Total XP.
 * @returns {{title: string, floor: number, next: number|null}} The rank's title,
 *   the XP where it starts, and where the next one starts (null at the top).
 * @throws {Error} If xp is negative.
 */
export function rankFor(xp) {
  if (xp < 0) throw new Error(`xp cannot be negative, got ${xp}`);

  const index = RANKS.findLastIndex(([floor]) => xp >= floor);
  const [floor, title] = RANKS[index];
  const next = RANKS[index + 1]?.[0] ?? null;
  return { title, floor, next };
}

/**
 * Take one heart. At zero the Guardian restores the player with full hearts.
 *
 * @param {number} hearts Hearts before the loss (1 to MAX_HEARTS).
 * @returns {{hearts: number, restored: boolean}} Hearts after, and whether they were refilled.
 * @throws {Error} If hearts is outside 1 to MAX_HEARTS.
 */
export function loseHeart(hearts) {
  if (hearts < 1 || hearts > MAX_HEARTS) throw new Error(`hearts must be 1 to ${MAX_HEARTS}, got ${hearts}`);

  const left = hearts - 1;
  return left === 0 ? { hearts: MAX_HEARTS, restored: true } : { hearts: left, restored: false };
}

/**
 * The status of every chapter in the list. A chapter opens when the one before
 * it is cleared; placeholders are 'soon'; the current chapter is 'playing'
 * until it is cleared, and 'cleared' from then on, even during a replay.
 *
 * @param {{id: string, soon?: boolean}[]} chapters The chapter list in order.
 * @param {{current: string|null, cleared: string[]}} progress The chapter being played and the cleared ids.
 * @returns {('playing'|'open'|'cleared'|'locked'|'soon')[]} One status per chapter.
 */
export function chapterStatuses(chapters, { current, cleared }) {
  const done = new Set(cleared);
  return chapters.map((chapter, i) => {
    let status = 'locked';
    if (chapter.soon) status = 'soon';
    else if (done.has(chapter.id)) status = 'cleared';
    else if (chapter.id === current) status = 'playing';
    else if (i === 0 || done.has(chapters[i - 1].id)) status = 'open';
    return status;
  });
}

/**
 * Whether a chapter with this status may be started.
 *
 * @param {string} status A status from chapterStatuses.
 * @returns {boolean} True for playing, open and cleared.
 */
export const canStart = status => STARTABLE.has(status);

/**
 * The chapter to start when the game boots: the saved one if it can start,
 * else the first open one, else the last one that can start.
 *
 * @param {{id: string, soon?: boolean}[]} chapters The chapter list in order.
 * @param {{saved: string|null, cleared: string[]}} progress The saved chapter id and the cleared ids.
 * @returns {string} A chapter id.
 * @throws {Error} If no chapter in the list can start.
 */
export function resumeChapter(chapters, { saved, cleared }) {
  const statuses = chapterStatuses(chapters, { current: null, cleared });
  const startable = chapters.filter((_, i) => canStart(statuses[i]));
  if (startable.length === 0) throw new Error('no chapter in the list can start');

  const savedChapter = startable.find(c => c.id === saved);
  const firstOpen = chapters.find((_, i) => statuses[i] === 'open');
  return (savedChapter ?? firstOpen ?? startable.at(-1)).id;
}
