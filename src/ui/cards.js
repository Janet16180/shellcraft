/**
 * Full-screen cards: the title screen, the boss room and the adventure log.
 * The *HTML functions are pure; openCard and closeCard drive the overlay.
 */

import { esc } from './output.js';
import { keepFocusIn } from './focus.js';

function pairs(list) {
  return `<dl>${list.map(([command, meaning]) => `<dt>${esc(command)}</dt><dd>${esc(meaning)}</dd>`).join('')}</dl>`;
}

/**
 * The title screen.
 *
 * @param {{number: number, title: string} | null} resume The saved chapter, or null on a first visit.
 * @returns {string} HTML.
 */
export function titleCardHTML(resume) {
  const go = resume ? `Continue: chapter ${resume.number}` : 'Start adventure';
  return `<div class="eyebrow">A terminal adventure</div>
    <h2 class="title-logo" id="cardTitle">SHELLCRAFT</h2>
    <p>A Shadow Daemon has taken over the machine Kernelia. Explore a world made of files and directories, cast real Linux commands, and learn the terminal along the way.</p>
    <p>The commands you learn here work in bash on a real Linux system. Where the game's simulation differs, the terminal tells you.</p>
    <div class="actions">
      <button class="px-btn primary" type="button" id="goBtn">${go}</button>
      ${resume ? '<button class="px-btn ghost" type="button" id="newBtn">New game</button>' : ''}
    </div>
    <p class="press">Press <kbd>Enter</kbd> to begin<span class="blink" aria-hidden="true">_</span></p>`;
}

/**
 * The card shown when the boss room opens.
 *
 * @param {{title: string, briefing: string}} boss Title (text) and briefing (trusted HTML).
 * @param {number} number The chapter number.
 * @returns {string} HTML.
 */
export function bossCardHTML({ title, briefing }, number) {
  return `<div class="eyebrow">Chapter ${number} &middot; Boss room</div>
    <h2 id="cardTitle">${esc(title)}</h2>
    <div class="brief">${briefing}</div>
    <p class="rules">No step list in here: use what this chapter taught you. The room is set up at random each time you enter it. Hints still work and cost the same XP.</p>
    <div class="actions"><button class="px-btn primary" type="button" id="bossGo">Enter the boss room</button></div>`;
}

function nextHTML(next) {
  if (!next) return '';
  if (next.status === 'soon') return `<p>Chapter ${next.number}, ${esc(next.title)}, is coming soon.</p>`;
  return `<button class="px-btn primary" id="nextBtn" type="button" data-ch="${esc(next.id)}">Continue to chapter ${next.number}</button>`;
}

/**
 * The adventure log shown when a chapter is cleared: recap, why, field commands.
 *
 * @param {object} log
 * @param {{number: number, title: string}} log.chapter The cleared chapter.
 * @param {string[][]} log.recap Command and meaning pairs.
 * @param {string} log.why Trusted HTML, may be empty.
 * @param {string[][]} log.field Commands to try on a real machine.
 * @param {number} log.xp XP this clear paid; 0 on a replay.
 * @param {{id: string, number: number, title: string, status: string} | null} log.next The next chapter.
 * @returns {string} HTML.
 */
export function debriefHTML({ chapter, recap, why, field, xp, next }) {
  const gain = xp ? `<p class="xpgain">+${xp} XP</p>` : '<p class="xpgain replay">Replays pay no XP</p>';
  return `<div class="eyebrow">Chapter ${chapter.number} cleared &middot; Adventure log</div>
    <h2 id="cardTitle">${esc(chapter.title)}</h2>
    ${gain}
    <h3>Spells mastered</h3>
    ${pairs(recap)}
    ${why ? `<h3>Why it matters</h3><div class="why">${why}</div>` : ''}
    <h3>Try it on a real machine</h3>
    ${pairs(field)}
    <div class="actions">
      ${nextHTML(next)}
      <button class="px-btn ghost" id="stayBtn" type="button">Keep exploring here</button>
    </div>`;
}

/**
 * Show a card in the overlay, keep Tab inside it, and focus its first button.
 *
 * @param {Document} doc The page.
 * @param {string} html The card's content.
 * @param {string} [kind] An extra class for the card ('boss', 'log').
 * @returns {HTMLElement} The card element, for wiring its buttons.
 */
export function openCard(doc, html, kind = '') {
  const overlay = doc.getElementById('overlay');
  const card = doc.getElementById('card');
  card.className = `card ${kind}`.trim();
  card.innerHTML = html;
  overlay.hidden = false;
  overlay.classList.remove('show');
  void overlay.offsetWidth;
  overlay.classList.add('show');
  card.onkeydown = keepFocusIn(card);
  card.querySelector('button')?.focus();
  return card;
}

/**
 * Hide the overlay.
 *
 * @param {Document} doc The page.
 * @returns {void}
 */
export function closeCard(doc) {
  doc.getElementById('overlay').hidden = true;
}
