/**
 * Every chapter, in the order the player meets them. A chapter not written yet
 * can be listed as `{ id, act, title, soon: true }` so the chapter list shows
 * what is coming.
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
import descent from './descent.js';
import gate from './gate.js';
import well from './well.js';
import daemon from './daemon.js';
import forge from './forge.js';


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
  descent,
  gate,
  well,
  daemon,
  forge,
];
