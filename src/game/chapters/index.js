/**
 * Every chapter, in the order the player meets them. Chapters not written yet
 * are listed as `soon` so the chapter list can show what is coming.
 */
import awakening from './awakening.js';
import forest from './forest.js';
import unseen from './unseen.js';
import camp from './camp.js';

const soon = (id, act, title) => ({ id, act, title, soon: true });

/**
 * The ordered chapter list.
 *
 * @type {object[]}
 */
export default [
  awakening,
  forest,
  unseen,
  camp,
  soon('junkyard', 1, 'The Cursed Junkyard'),
  soon('mirrors', 1, 'Hall of Mirrors'),
  soon('library', 1, 'The Great Library'),
  soon('tower', 1, 'The Tower of Echoes'),
  soon('market', 1, 'The Market of Pipes'),
  soon('descent', 2, 'The Descent'),
  soon('gate', 2, 'The Sealed Gate'),
  soon('well', 2, 'Well of Echoes'),
  soon('daemon', 2, 'The Shadow Daemon'),
  soon('forge', 2, 'Forge Your Own Spell'),
];
