/**
 * Words for the three hint levels. What a hint costs is decided by the
 * session; these functions only say it before the player spends it.
 */

const LEVELS = { 1: 'a nudge', 2: 'the technique', 3: 'the exact command' };

function levelName(level) {
  if (!(level in LEVELS)) throw new Error(`unknown hint level: ${level}`);
  return LEVELS[level];
}

function costText(cost) {
  return cost ? `-${cost} XP` : 'free';
}

/**
 * The label of the button that reveals the next hint.
 *
 * @param {{level: number, cost: number} | null} next The next hint, or null when all are revealed.
 * @returns {string} The label, with the cost.
 * @throws {Error} On a level outside 1 to 3.
 */
export function hintLabel(next) {
  if (!next) return 'No more hints for this step';
  return `Hint ${next.level} of 3: ${levelName(next.level)} (${costText(next.cost)})`;
}

/**
 * The heading of a revealed hint.
 *
 * @param {number} level 1, 2 or 3.
 * @returns {string} The heading.
 * @throws {Error} On a level outside 1 to 3.
 */
export function hintTitle(level) {
  const name = levelName(level);
  return name[0].toUpperCase() + name.slice(1);
}

/**
 * The line printed after a hint typed in the terminal, so the next cost is
 * known before the player types hint again.
 *
 * @param {{level: number, cost: number} | null} next The next hint, or null.
 * @returns {string} One sentence.
 * @throws {Error} On a level outside 1 to 3.
 */
export function typedHintFollowUp(next) {
  if (!next) return 'That was the last hint for this step.';
  const cost = next.cost ? `costs ${next.cost} XP` : 'free';
  return `Type hint again for ${levelName(next.level)} (${cost}).`;
}
