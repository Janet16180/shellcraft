/**
 * HTML for the Quest, Spellbook and Chapters panels, built from the View.
 * Lessons and briefings are trusted HTML from the chapter modules; every
 * other string is escaped.
 */

import { esc, inlineCode } from './output.js';
import { hintLabel, hintTitle, isExactCommand } from './hints.js';

const STATUS_TEXT = { playing: 'playing', open: 'open', cleared: 'cleared', locked: 'locked', soon: 'coming soon' };
const PHASE_TEXT = { quest: 'Quest', boss: 'Boss room', done: 'Cleared' };
const ROMAN = ['', 'I', 'II', 'III'];

/**
 * The act number as a Roman numeral, as the chapter list shows it.
 *
 * @param {number} act 1 or 2 (3 is allowed for later chapters).
 * @returns {string} The numeral.
 */
export function actName(act) {
  return ROMAN[act];
}

function taskRow({ goal, done, next }, index) {
  const cls = done ? 'done' : next ? 'next' : '';
  const current = next ? ' aria-current="step"' : '';
  const state = done ? '<span class="sr-only"> (done)</span>' : '';
  return `<li class="${cls}"${current}><span class="num" aria-hidden="true">${done ? '&#10003;' : index + 1}</span><span class="goal">${inlineCode(goal)}${state}</span></li>`;
}

function revealedHints({ phase, tasks, boss }) {
  if (phase === 'boss') return boss.hints;
  return tasks.find(task => task.next)?.hints ?? [];
}

// The last hint is the exact line to type, so all of it is code.
function hintText(level, levels, text) {
  return isExactCommand(level, levels) ? `<code>${esc(text)}</code>` : inlineCode(text);
}

function hintsHTML(hint, levels, hints) {
  const revealed = hints.map(({ level, text }) => `<li><b>${esc(hintTitle(level, levels))}</b><span>${hintText(level, levels, text)}</span></li>`).join('');
  return `<div class="hintbox">
    ${revealed ? `<ul class="hints" aria-label="Hints">${revealed}</ul>` : ''}
    <button class="px-btn small" id="hintBtn" type="button"${hint ? '' : ' disabled'}>${esc(hintLabel(hint, levels))}</button>
  </div>`;
}

function bossHTML(boss) {
  return `<div class="boss-brief"><h3>${esc(boss.title)}</h3>${boss.briefing}<p class="rules">No step list here: use what you learned. Hints still work.</p></div>`;
}

function clearedHTML() {
  return `<div class="cleared-note">
    <p>You cleared this chapter. Explore freely, or read what you learned.</p>
    <button class="px-btn primary small" id="logBtn" type="button">Open the adventure log</button>
  </div>`;
}

/**
 * The Quest panel. In the quest: lesson, quest log, hints. In the boss room
 * the briefing comes first and the lesson folds away below; once cleared, the
 * way on comes first. A chapter with an explainer gets a button to watch it
 * again. The hints shown are the ones revealed for the next task,
 * or for the boss.
 *
 * @param {{chapter: object, hint: {level: number, cost: number}|null, hintLevels: number}} view The session View.
 * @returns {string} HTML.
 */
export function questHTML({ chapter, hint, hintLevels }) {
  const { number, title, phase, lesson, tasks, boss } = chapter;
  const hints = hintsHTML(hint, hintLevels, revealedHints(chapter));
  const lessonAgain = `<details class="lesson-again"><summary>Read the lesson again</summary><div class="lesson">${lesson}</div></details>`;
  let body = `<div class="lesson">${lesson}</div><ol class="quest-log" aria-label="Tasks">${tasks.map(taskRow).join('')}</ol>${hints}`;
  if (phase === 'boss') body = bossHTML(boss) + hints + lessonAgain;
  if (phase === 'done') body = clearedHTML() + lessonAgain;
  const watch = chapter.explainer ? `<button class="px-btn small ghost explainer-btn" id="explainerBtn" type="button">Watch the explainer: ${esc(chapter.explainer.title)}</button>` : '';
  const replay = chapter.replay ? '<p class="replay">You cleared this chapter before, so replaying it pays no XP.</p>' : '';
  return `<div class="eyebrow">Chapter ${number} &middot; ${PHASE_TEXT[phase]}</div>
    <h2>${esc(title)}</h2>
    ${replay}
    ${watch}
    ${body}`;
}

function spellHTML({ name, summary, examples, unlocked }) {
  if (!unlocked) return `<div class="spell locked"><h3>${esc(name)}</h3><p>Locked: you learn it in a later chapter.</p></div>`;
  const chips = examples.map(([line, note]) =>
    `<button type="button" class="chip" data-ins="${esc(line)}">${esc(line)}${note ? `<small>${inlineCode(note)}</small>` : ''}</button>`).join('');
  return `<div class="spell"><h3>${esc(name)}</h3><p>${inlineCode(summary)}</p><div class="ex">${chips}</div></div>`;
}

/**
 * The Spellbook: one card per spell; example commands go into the input when clicked.
 *
 * @param {{name: string, summary: string, examples: string[][], unlocked: boolean}[]} spells From the View.
 * @returns {string} HTML.
 */
export function spellsHTML(spells) {
  return spells.map(spellHTML).join('');
}

function chapterRow({ id, number, title, status, current }) {
  const closed = status === 'locked' || status === 'soon';
  const cls = current ? 'cur' : status;
  const attrs = `${current ? ' aria-current="true"' : ''}${closed ? ' disabled' : ''}`;
  return `<li><button type="button" data-ch="${esc(id)}" class="${cls}"${attrs}><span class="num">${String(number).padStart(2, '0')}</span><span class="title">${esc(title)}</span><span class="status ${status}">${STATUS_TEXT[status]}</span></button></li>`;
}

/**
 * The Chapters panel, grouped by act. Locked and unwritten chapters are
 * disabled; the one you are in is marked as current. Once the game is
 * finished, a button at the end plays the ending again.
 *
 * @param {{id: string, number: number, act: number, title: string, status: string, current: boolean}[]} chapters From the View.
 * @param {{ending?: boolean}} [opts] ending: the player may watch the ending again.
 * @returns {string} HTML.
 */
export function chaptersHTML(chapters, { ending = false } = {}) {
  const acts = [...new Set(chapters.map(c => c.act))];
  const list = acts.map(act => {
    const rows = chapters.filter(c => c.act === act).map(chapterRow).join('');
    return `<h3 class="act">Act ${actName(act)}</h3><ul class="levels">${rows}</ul>`;
  }).join('');
  const again = ending ? '<div class="ending-again"><button class="px-btn small" id="endingBtn" type="button">Watch the ending</button></div>' : '';
  return list + again;
}

/**
 * The strip over the terminal that says what to do now, with the task's tip,
 * so the goal and what it needs stay in sight while the quest panel is
 * scrolled away (or below, on a phone).
 *
 * @param {{phase: string, tasks: {goal: string, tip: string|null, next: boolean}[], boss: {title: string}}} chapter From the View.
 * @returns {string} HTML.
 */
export function nowHTML({ phase, tasks, boss }) {
  const index = tasks.findIndex(task => task.next);
  let html = '<b>Chapter cleared.</b> Explore freely, or pick a chapter in the Chapters tab.';
  if (phase === 'boss') html = `<b>Boss room:</b> ${esc(boss.title)}`;
  else if (phase === 'quest') {
    const { goal, tip } = tasks[index];
    html = `<b>Next task ${index + 1} of ${tasks.length}:</b> ${inlineCode(goal)}${tip ? `<span class="tip">${inlineCode(tip)}</span>` : ''}`;
  }
  return html;
}
