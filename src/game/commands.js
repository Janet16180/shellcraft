/**
 * What the game prints in the terminal for its own commands (`hint`,
 * `quest`), and the one rule for terminal text: no backticks.
 */
import { HINT_LEVELS } from './progress.js';

/**
 * Text for the terminal. Backticks mark typed names for the page; in bash
 * they would run a command, so the terminal never shows them.
 *
 * @param {string} text Text that may mark names with backticks.
 * @returns {string} The text without backticks.
 */
export const terminalText = text => text.replaceAll('`', '');

/**
 * The note for a typed `hint`.
 *
 * @param {{level: number, text: string, cost: number}|null} shown The hint just
 *   shown, or null when there is nothing to hint at.
 * @param {{level: number, cost: number}|null} following The next hint and its
 *   price, or null after the last one.
 * @returns {string} One or two lines.
 */
export function hintNote(shown, following) {
  let text = 'This chapter is cleared: there is nothing left to hint at.';
  if (shown) {
    const cost = shown.cost > 0 ? ` (cost ${shown.cost} XP)` : '';
    text = `Hint ${shown.level} of ${HINT_LEVELS}${cost}: ${shown.text}`;
  }
  if (following) {
    const price = following.cost > 0 ? `costs ${following.cost} XP` : 'free';
    text += `\nType hint again for hint ${following.level} (${price}).`;
  }
  return text;
}

/**
 * The note for a typed `quest`: the chapter and its tasks with their state.
 *
 * @param {{number: number, total: number, title: string, phase: string, tasks: {goal: string, done: boolean}[], boss: {title: string}}} chapter
 *   The chapter as the View shows it.
 * @returns {string} One line per task, after a title line.
 */
export function questNote({ number, total, title, phase, tasks, boss }) {
  const lines = [`${title} (chapter ${number} of ${total})`, ...tasks.map(task => `[${task.done ? 'x' : ' '}] ${task.goal}`)];
  if (phase === 'boss') lines.push(`Boss: ${boss.title}. Its briefing is in the Quest panel.`);
  if (phase === 'done') lines.push('Chapter cleared.');
  return lines.join('\n');
}
