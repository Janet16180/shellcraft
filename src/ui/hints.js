/**
 * Words for the hint levels. How many levels there are and what a hint costs
 * are decided by the session (View.hintLevels and View.hint); these functions
 * only say it before the player spends it.
 */

/**
 * Whether a hint level is the last one, the exact line to type.
 *
 * @param {number} level The hint's level, from 1.
 * @param {number} levels How many levels the game has, from View.hintLevels.
 * @returns {boolean} True for the last level.
 */
export function isExactCommand(level, levels) {
  return level === levels;
}

function levelName(level, levels) {
  if (!Number.isInteger(level) || level < 1 || level > levels) throw new Error(`hint level must be 1 to ${levels}, got ${level}`);

  let name = 'the technique';
  if (isExactCommand(level, levels)) name = 'the exact command';
  else if (level === 1) name = 'a nudge';
  return name;
}

function costText(cost) {
  return cost ? `-${cost} XP` : 'free';
}

/**
 * The label of the button that reveals the next hint.
 *
 * @param {{level: number, cost: number} | null} next The next hint, or null when all are revealed.
 * @param {number} levels How many levels the game has, from View.hintLevels.
 * @returns {string} The label, with the cost.
 * @throws {Error} On a level outside 1 to levels.
 */
export function hintLabel(next, levels) {
  if (!next) return 'No more hints for this step';
  return `Hint ${next.level} of ${levels}: ${levelName(next.level, levels)} (${costText(next.cost)})`;
}

/**
 * The heading of a revealed hint.
 *
 * @param {number} level The hint's level, from 1.
 * @param {number} levels How many levels the game has, from View.hintLevels.
 * @returns {string} The heading.
 * @throws {Error} On a level outside 1 to levels.
 */
export function hintTitle(level, levels) {
  const name = levelName(level, levels);
  return name[0].toUpperCase() + name.slice(1);
}
