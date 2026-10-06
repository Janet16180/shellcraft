/**
 * What the game tells the player in the terminal about the save and the hearts.
 */

const BOOT = {
  new: null,
  resumed: null,
  migrated: 'Your progress from the first Shellcraft was carried over.',
  damaged: 'Your saved game could not be read, so a new game started.',
};

const RESTORED = {
  quest: 'The Guardian set this chapter up again and refilled your hearts. Finished tasks stay finished, and your XP is safe.',
  boss: 'The Guardian built a new boss room and refilled your hearts. Your hints and XP are safe.',
  done: 'The Guardian refilled your hearts: your hearts are full again.',
};

/**
 * The note for how the save was loaded.
 *
 * @param {'new'|'resumed'|'migrated'|'damaged'} status From View.boot.
 * @returns {string|null} The note, or null when there is nothing to say.
 * @throws {Error} On an unknown status.
 */
export function bootText(status) {
  if (!(status in BOOT)) throw new Error(`unknown boot status: ${status}`);
  return BOOT[status];
}

/**
 * The note after the hearts ran out and the Guardian restored the player.
 *
 * @param {'quest'|'boss'|'done'} phase The phase the chapter is in.
 * @returns {string} The note.
 * @throws {Error} On an unknown phase.
 */
export function restoredText(phase) {
  if (!(phase in RESTORED)) throw new Error(`unknown phase: ${phase}`);
  return `You ran out of hearts. ${RESTORED[phase]}`;
}
