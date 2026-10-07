/**
 * Every chapter, in the order the player meets them. Chapters not written yet
 * are listed as `soon` so the chapter list can show what is coming.
 */
import awakening from './awakening.js';
import forest from './forest.js';
import unseen from './unseen.js';
import camp from './camp.js';
import junkyard from './junkyard.js';
import mirrors from './mirrors.js';
import library from './library.js';
import tower from './tower.js';
import market from './market.js';

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
  junkyard,
  mirrors,
  library,
  tower,
  market,
  soon('descent', 2, 'The Descent'),
  soon('gate', 2, 'The Sealed Gate'),
  soon('well', 2, 'Well of Echoes'),
  soon('daemon', 2, 'The Shadow Daemon'),
  soon('forge', 2, 'Forge Your Own Spell'),
];
