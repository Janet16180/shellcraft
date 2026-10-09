/**
 * The "which three letters are yours?" diagrams: a file's mode split into its
 * three sets, and the questions Linux asks, in order, to choose the one set
 * that counts for a user. The rule lives in permClass; the drawings only show it.
 */

import { esc } from '../ui/output.js';
import { SPRITES } from '../map/sprites.js';
import { spriteSVG } from './sprite.js';

/** The three sets of a mode, in the order they are written and checked. */
export const PERM_CLASSES = ['owner', 'group', 'other'];

const RUNG_S = 0.75;
const VERDICT_S = 0.35;
const LETTER_WORDS = { r: 'read', w: 'write', x: 'run' };
const WHO = { owner: 'owner', group: 'group', other: 'everyone else' };

/**
 * Which set of letters counts for a user: the owner's if the user owns the
 * file, else the group's if the file's group is one of theirs, else the last.
 * Only the first match counts.
 *
 * @param {{owner: string, group: string}} file The file's owner and group.
 * @param {{user: string, groups: string[]}} person A user and their groups, as `id` lists them.
 * @returns {'owner'|'group'|'other'} The set that counts.
 */
export function permClass(file, person) {
  let cls = 'other';
  if (person.user === file.owner) cls = 'owner';
  else if (person.groups.includes(file.group)) cls = 'group';
  return cls;
}

/**
 * The three letters of one set.
 *
 * @param {{mode: string}} file A mode as `ls -l` prints it, like `-rw-r-----`.
 * @param {'owner'|'group'|'other'} cls The set.
 * @returns {string} Its letters, like `rw-`.
 * @throws {Error} If the mode is not ten characters.
 */
export function lettersFor(file, cls) {
  if (file.mode.length !== 10) throw new Error(`a mode has 10 characters, got ${file.mode}`);
  const start = 1 + 3 * PERM_CLASSES.indexOf(cls);
  return file.mode.slice(start, start + 3);
}

/**
 * Whether a set of letters lets you read.
 *
 * @param {string} letters Three letters, like `r--`.
 * @returns {boolean} True when the first one is r.
 */
export function mayRead(letters) {
  return letters[0] === 'r';
}

/**
 * The questions asked for one user, in order, with the answer to each.
 *
 * @param {{mode: string, owner: string, group: string}} file The file.
 * @param {{user: string, groups: string[]}} person The user.
 * @returns {{cls: string, letters: string, answer: 'yes'|'no'|'not asked'}[]} One rung per set.
 */
export function ladder(file, person) {
  const match = PERM_CLASSES.indexOf(permClass(file, person));
  return PERM_CLASSES.map((cls, i) => {
    let answer = 'yes';
    if (i < match) answer = 'no';
    if (i > match) answer = 'not asked';
    return { cls, letters: lettersFor(file, cls), answer };
  });
}

function meaning(letters) {
  const words = [...letters].filter(l => l !== '-').map(l => LETTER_WORDS[l]);
  return words.length ? words.join(', ') : 'nothing';
}

const delay = seconds => `--d:${seconds.toFixed(2)}s`;

function fileLineHTML({ mode, owner, group, size, name }) {
  const sets = PERM_CLASSES.map(cls => `<span class="perm-${cls}">${esc(lettersFor({ mode }, cls))}</span>`).join('');
  return `<pre class="ex-file perm-line"><span class="perm-type">${esc(mode[0])}</span>${sets} 1 <span class="perm-owner">${esc(owner)}</span> <span class="perm-group">${esc(group)}</span> <span class="meta">${size} Oct  7 09:00 </span>${esc(name)}</pre>`;
}

function personSVG(person, scale) {
  return spriteSVG(SPRITES.player, { scale, colours: person.colours, below: [SPRITES.legs[0].rows[0]], cls: 'ex-hero' });
}

function question(cls, file) {
  const questions = {
    owner: `Is your user name <code>${esc(file.owner)}</code>?`,
    group: `Is the file's group <code>${esc(file.group)}</code> yours?`,
    other: 'Neither? Then you are everyone else.',
  };
  return questions[cls];
}

function setsHTML(file) {
  const cells = [`<div class="ex-set perm-type ex-pop" style="${delay(0)}"><span class="bits">${esc(file.mode[0])}</span><span class="who">type</span><span class="means">${file.mode[0] === 'd' ? 'a directory' : 'a file'}</span></div>`];
  PERM_CLASSES.forEach((cls, i) => {
    const letters = lettersFor(file, cls);
    const name = { owner: file.owner, group: file.group, other: '' }[cls];
    cells.push(`<div class="ex-set perm-${cls} ex-pop" style="${delay(0.7 * (i + 1))}"><span class="bits">${esc(letters)}</span><span class="who">${WHO[cls]}</span><span class="name">${name ? `<code>${esc(name)}</code>` : 'anyone'}</span><span class="means">${meaning(letters)}</span></div>`);
  });
  return `<div class="ex-sets">${cells.join('')}</div>`;
}

function verdictHTML(person, letters, at) {
  const yes = mayRead(letters);
  const words = yes ? 'may read the file' : 'may not read the file';
  return `<p class="verdict ${yes ? 'yes' : 'no'} ex-pop" style="${delay(at)}"><code>${esc(person.user)}</code> gets <code>${esc(letters)}</code>: ${words}</p>`;
}

// The person hops down the rungs: a marker shows on each rung while it is asked and stays on the one that counts.
function rungHTML(rung, i, { file, person, asked }) {
  const state = { yes: 'match', no: 'no', 'not asked': 'skip' }[rung.answer];
  const at = rung.answer === 'not asked' ? asked * RUNG_S : i * RUNG_S;
  const marker = rung.answer === 'not asked' ? '' : `<span class="marker" style="${delay(i * RUNG_S)}">${personSVG(person, 3)}</span>`;
  return `<div class="rung ${state}" data-cls="${rung.cls}" style="${delay(at)}">
    <span class="spot">${marker}</span>
    <span class="q"><b class="n">${i + 1}</b>${question(rung.cls, file)}</span>
    <span class="chip">${rung.answer}</span>
    <span class="letters perm-${rung.cls}"><code>${esc(rung.letters)}</code><small>${WHO[rung.cls]}</small></span>
  </div>`;
}

function ladderHTML(file, person) {
  const rungs = ladder(file, person);
  const asked = rungs.filter(r => r.answer !== 'not asked').length;
  const counted = rungs.find(r => r.answer === 'yes');
  const groups = person.groups.map(g => `<code>${esc(g)}</code>`).join(' ');
  return `<div class="ex-person">${personSVG(person, 4)}<span><b>${esc(person.user)}</b><small>groups: ${groups}</small></span></div>
    <div class="ex-ladder">${rungs.map((rung, i) => rungHTML(rung, i, { file, person, asked })).join('')}</div>
    ${verdictHTML(person, counted.letters, asked * RUNG_S + VERDICT_S)}`;
}

const WALK_STEP_S = 0.5;

function walkHTML(file, people) {
  const heads = people.map(person => `<div class="col-head">${personSVG(person, 3)}<b>${esc(person.user)}</b></div>`).join('');
  let start = 0;
  const columns = people.map(person => {
    const rungs = ladder(file, person);
    const asked = rungs.filter(r => r.answer !== 'not asked').length;
    const column = { rungs, start, end: start + asked * WALK_STEP_S };
    start = column.end + WALK_STEP_S;
    return column;
  });
  const rows = PERM_CLASSES.map((cls, r) => {
    const cells = columns.map(({ rungs, start: at, end }) => {
      const rung = rungs[r];
      const state = { yes: 'match', no: 'no', 'not asked': 'skip' }[rung.answer];
      const when = rung.answer === 'not asked' ? end : at + r * WALK_STEP_S;
      const letters = rung.answer === 'yes' ? `<code class="perm-${cls}">${esc(rung.letters)}</code>` : '';
      return `<div class="cell ${state} ex-pop" style="${delay(when)}"><span class="chip">${rung.answer}</span>${letters}</div>`;
    }).join('');
    return `<div class="rh perm-${cls}"><b>${r + 1}</b> ${WHO[cls]}</div>${cells}`;
  }).join('');
  const verdicts = columns.map(({ rungs, end }, c) => {
    const letters = rungs.find(r => r.answer === 'yes').letters;
    const yes = mayRead(letters);
    return `<div class="verdict ${yes ? 'yes' : 'no'} ex-pop" style="${delay(end)}" aria-label="${esc(people[c].user)} ${yes ? 'may' : 'may not'} read">${yes ? 'reads' : 'denied'}</div>`;
  }).join('');
  return `<div class="ex-walk" style="--cols:${people.length}"><div class="corner"></div>${heads}${rows}<div class="rh">read?</div>${verdicts}</div>`;
}

const DRAW = {
  sets: ({ file }) => setsHTML(file),
  ladder: ({ file, people }) => ladderHTML(file, people[0]),
  walk: ({ file, people }) => walkHTML(file, people),
};

/**
 * Draw one step of the permissions explainer.
 *
 * @param {{show: 'sets'|'ladder'|'walk', file: object, people?: object[]}} diagram The step's diagram:
 *   which drawing, the file (mode, owner, group, size, name) and, for the ladder (first person
 *   only) and the walk, the people (user, groups, sprite colours).
 * @param {{end?: number}} [timing] When the step's terminal lines are done, in seconds; the
 *   drawing starts then.
 * @returns {string} HTML. Every part is in its final place; CSS animations bring it there.
 * @throws {Error} If `show` names no drawing.
 */
export function drawPerms(diagram, { end = 0 } = {}) {
  const draw = DRAW[diagram.show];
  if (!draw) throw new Error(`no permissions drawing called ${diagram.show}`);
  return `<div class="ex-perms ${diagram.show}" style="--t0:${end.toFixed(2)}s">${fileLineHTML(diagram.file)}${draw(diagram)}</div>`;
}
