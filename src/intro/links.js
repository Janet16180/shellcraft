/**
 * The "names are pointers" diagrams: names as signposts pointing at data on
 * the disk (hard links), a signpost pointing at another name (a symlink), the
 * hero stepping through one, and a recap table.
 */

import { esc } from '../ui/output.js';
import { SPRITES } from '../map/sprites.js';
import { spriteSVG } from './sprite.js';

const DOOR = {
  pal: 'ink',
  rows: ['.kkkkkkkk.', 'kbbbbbbbbk', 'kbrrrrrrbk', 'kbrbbbbrbk', 'kbrrrrrrbk', 'kbrrrrrybk', 'kbrrrrrrbk', 'kbrbbbbrbk', 'kbrrrrrrbk', 'kbbbbbbbbk'],
};

const delay = seconds => `--d:${seconds.toFixed(2)}s`;
const when = (timing, index) => (index === undefined ? 0 : timing.at(index));
// Break a path after each slash so a long one wraps on a phone.
const pathHTML = path => esc(path).replace(/(?<=.)\//g, '/<wbr>');

function signHTML(name, cls = '') {
  return `<span class="sign${cls ? ` ${cls}` : ''}"><span class="board"><code>${esc(name)}</code></span><span class="post"></span></span>`;
}

function signRowHTML(sign, row, timing) {
  let state = '';
  let at = 0;
  if (sign.added !== undefined) [state, at] = ['new', when(timing, sign.added)];
  if (sign.removed !== undefined) [state, at] = ['gone', when(timing, sign.removed)];
  const ghost = sign.removed === undefined ? '' : `<span class="ghost"><s>${esc(sign.name)}</s><small>removed</small></span>`;
  return `<div class="sign-row${state ? ` ${state}` : ''}" style="${delay(at)}; grid-row:${row + 1}">${signHTML(sign.name)}${ghost}<span class="arrow"></span></div>`;
}

function dataHTML({ inode, lines, added, alive, mark }, rows, timing) {
  const extra = added ? `<span class="added" style="${delay(when(timing, added.at))}">${esc(added.line)}</span>` : '';
  const tag = alive === undefined ? '' : `<span class="tag ok ex-pop" style="${delay(when(timing, alive))}">still here</span>`;
  return `<div class="block" style="grid-row:1 / span ${rows}"><span class="inode${mark === undefined ? '' : ' marked'}" style="${delay(when(timing, mark))}">inode ${inode}</span><span class="text">${lines.map(esc).join('<br>')}${extra}</span>${tag}</div>`;
}

function signsHTML({ signs, data }, timing) {
  const rows = signs.map((sign, i) => signRowHTML(sign, i, timing)).join('');
  return `<div class="ex-heads"><span>names</span><span>data on the disk</span></div>
    <div class="ex-signs">${rows}${dataHTML(data, signs.length, timing)}</div>`;
}

function doorHTML(dir, cls = '') {
  return `<span class="door${cls ? ` ${cls}` : ''}">${spriteSVG(DOOR, { scale: 5 })}<code>${esc(dir)}/</code></span>`;
}

function symlinkHTML({ link, target, dir, added, moved, broken, hard }, timing) {
  // A new link rises when it is made; a broken one turns red when it breaks.
  const linkAt = broken === undefined ? when(timing, added) : when(timing, broken);
  const nameNode = moved
    ? `<div class="node name-node moved" style="${delay(when(timing, moved.at))}"><span class="sign name ghostly"><span class="board"><code>${pathHTML(target)}</code></span><span class="post"></span></span><small>no such name now</small></div>`
    : `<div class="node name-node"><span class="sign name"><span class="board"><code>${pathHTML(target)}</code></span><span class="post"></span></span><small>a name: the path</small></div>`;
  const dirNode = moved ? '' : `<span class="arrow plain"></span><div class="node dir-node">${doorHTML(dir)}<small>the directory</small></div>`;
  const chain = `<div class="chain">
      <div class="node link-node${added === undefined ? '' : ' new'}" style="${delay(linkAt)}">${signHTML(link, 'soft')}<small>the soft link</small></div>
      <span class="arrow soft${broken === undefined ? '' : ' snaps'}" style="${delay(added === undefined ? when(timing, broken) : linkAt + 0.3)}"></span>
      ${nameNode}${dirNode}
    </div>`;
  const movedRow = moved
    ? `<div class="aside moved-to ex-pop" style="${delay(when(timing, moved.at) + 0.5)}">${signHTML(moved.to)}<span class="arrow plain"></span>${doorHTML(moved.to)}<small>the same directory, under a new name</small></div>`
    : '';
  const hardRow = hard
    ? `<div class="aside hard ex-pop" style="${delay(when(timing, broken) + 0.6)}">${signHTML(hard.name)}<span class="arrow plain"></span><span class="mini-block">inode ${hard.inode}</span><span class="tag ok">a hard link still works</span></div>`
    : '';
  const tag = broken === undefined ? '' : `<span class="tag bad ex-pop" style="${delay(when(timing, broken) + 0.3)}">broken link</span>`;
  return `${chain}${tag}${movedRow}${hardRow}`;
}

function teleportHTML({ link, from, to, item, at }, timing) {
  const t = when(timing, at);
  const hero = spriteSVG(SPRITES.player, { below: [SPRITES.legs[0].rows[0]], cls: 'frame-a' })
    + spriteSVG(SPRITES.player, { below: [SPRITES.legs[1].rows[0]], cls: 'frame-b' });
  const rune = spriteSVG(SPRITES.rune);
  const sparks = '<i></i><i></i><i></i><i></i>';
  return `<div class="ex-teleport" style="--t:${t.toFixed(2)}s">
      <div class="zone home"><span class="zone-name"><code>${esc(from)}</code></span></div>
      <div class="zone cave"><span class="zone-name"><code>${esc(to)}</code></span></div>
      <div class="portal in">${rune}<code>${esc(link)}</code><span class="sparks">${sparks}</span></div>
      <div class="portal out">${rune}<span class="sparks">${sparks}</span></div>
      <div class="loot">${spriteSVG(SPRITES.key)}<code>${esc(item)}</code></div>
      <div class="walker going">${hero}</div>
      <div class="walker arrived">${hero}</div>
      <div class="bubble">The cave!</div>
    </div>`;
}

function cellHTML(text) {
  return text === 'yes' || text === 'no' ? `<span class="chip ${text}">${text}</span>` : text;
}

function tableHTML({ head, rows }) {
  const body = rows.map(([label, ...cells], i) =>
    `<tr class="ex-pop" style="${delay(0.5 + i * 0.6)}"><th scope="row">${label}</th>${cells.map(c => `<td>${cellHTML(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="ex-table"><thead><tr><td></td>${head.map((h, i) => `<th scope="col" class="${i ? 'soft' : 'hard'}">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

const DRAW = { signs: signsHTML, symlink: symlinkHTML, teleport: teleportHTML, table: tableHTML };

/**
 * Draw one step of the links explainer.
 *
 * @param {object} diagram The step's diagram; `show` picks the drawing:
 *   - signs: `signs` [{name, added?, removed?}] pointing at `data` {inode, lines, added?: {line, at}, alive?, mark?}
 *     (`mark` lights the inode, `alive` says the data is still here);
 *   - symlink: `link` pointing at the name `target`, the directory `dir`; `added`, `moved` {to, at},
 *     `broken` and `hard` {name, inode} for the broken-link step;
 *   - teleport: the hero walks through `link` from `from` to `to`, where `item` lies, at line `at`;
 *   - table: `head` [two column titles] and `rows` [[label, hard, soft]], trusted HTML; 'yes'/'no' become marks.
 *   The numbers `added`, `removed`, `at`, `alive`, `mark`, `broken` are indices of the step's terminal
 *   lines: that part moves when that line's output shows.
 * @param {{at?: (index: number) => number}} [timing] When each terminal line's output shows, in seconds.
 * @returns {string} HTML, every part in its final place; CSS animations bring it there.
 * @throws {Error} If `show` names no drawing.
 */
export function drawLinks(diagram, timing = { at: () => 0 }) {
  const draw = DRAW[diagram.show];
  if (!draw) throw new Error(`no links drawing called ${diagram.show}`);
  const broken = diagram.broken === undefined ? '' : ' broken';
  return `<div class="ex-links ${diagram.show}${broken}">${draw(diagram, timing)}</div>`;
}
