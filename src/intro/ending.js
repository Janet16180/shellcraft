/**
 * Plays the ending (endsteps.js) in its own overlay, in Ring Zero's colours:
 * the camp, the walk down into the kernel, what the player learned in each
 * act, the final score, and the way on to Ring Zero. The player sets the
 * pace with Back, Next and Skip; nothing moves on by itself. With reduced
 * motion every picture is a still frame.
 */

import { ENDING_STEPS, RING_ZERO_URL, journeyOf, scoreOf } from './endsteps.js';
import { drawEndScene } from './endscene.js';
import { esc } from '../ui/output.js';
import { keepFocusIn } from '../ui/focus.js';
import { wireConfirm } from '../ui/confirm.js';

const FRAME_HTML = `<div class="ending window" role="dialog" aria-modal="true" aria-labelledby="endTitle">
  <header class="end-head">
    <span class="eyebrow" id="endCount"></span>
    <button class="px-btn small ghost" id="endSkip" type="button" aria-label="Skip the ending">Skip</button>
  </header>
  <div class="end-stage window" id="endStage">
    <canvas id="endScene" width="320" height="200" aria-hidden="true"></canvas>
    <div class="end-recap" id="endRecap" hidden></div>
  </div>
  <div class="end-caption" aria-live="polite">
    <h2 id="endTitle"></h2>
    <div class="end-text" id="endText"></div>
    <div class="end-score" id="endScore" hidden></div>
    <div class="end-actions" id="endActions" hidden>
      <a class="px-btn primary" id="endRingZero" href="${esc(RING_ZERO_URL)}" target="_blank" rel="noopener">Continue to Ring Zero</a>
      <button class="px-btn ghost" id="endAgain" type="button">Play again</button>
    </div>
  </div>
  <nav class="end-nav" aria-label="Ending">
    <button class="px-btn ghost" id="endBack" type="button">Back</button>
    <ol class="dots" id="endDots" aria-hidden="true"></ol>
    <button class="px-btn primary" id="endNext" type="button">Next</button>
  </nav>
</div>`;

const AGAIN = { label: 'Play again', confirm: 'Click again to erase all progress' };

/**
 * The recap of the journey: one block per act, each chapter with its spells;
 * the spells a chapter used first are lit.
 *
 * @param {ReturnType<typeof journeyOf>} journey From journeyOf.
 * @returns {string} HTML.
 */
export function recapHTML(journey) {
  return journey.map(({ name, chapters }) => {
    const rows = chapters.map(({ number, title, spells, fresh }) => {
      const chips = spells.map(spell => `<code class="${fresh.includes(spell) ? 'fresh' : ''}">${esc(spell)}</code>`).join(' ');
      return `<li><span class="num">${String(number).padStart(2, '0')}</span><span class="what"><b>${esc(title)}</b><span class="spells">${chips}</span></span></li>`;
    }).join('');
    return `<section class="end-act"><h3>${esc(name)}</h3><ol>${rows}</ol></section>`;
  }).join('');
}

/**
 * The final score: XP, rank, and chapters cleared.
 *
 * @param {ReturnType<typeof scoreOf>} score From scoreOf.
 * @returns {string} HTML.
 */
export function scoreHTML({ xp, rank, cleared, total }) {
  return `<dl>
    <div><dt>XP</dt><dd>${xp}</dd></div>
    <div><dt>Rank</dt><dd>${esc(rank)}</dd></div>
    <div><dt>Chapters</dt><dd>${cleared} of ${total}</dd></div>
  </dl>`;
}

/**
 * The label of the forward button.
 *
 * @param {number} index The step shown, from 0.
 * @param {number} count How many steps there are.
 * @returns {string} "Next", or "Finish" on the last step.
 */
export function nextLabel(index, count) {
  return index === count - 1 ? 'Finish' : 'Next';
}

function animate(it, scene) {
  cancelAnimationFrame(it.frame);
  const ctx = it.$('endScene').getContext('2d');
  const start = performance.now();
  const paint = now => {
    drawEndScene(ctx, scene, it.reducedMotion ? 0 : Math.max(0, now - start), it.reducedMotion);
    if (!it.reducedMotion) it.frame = requestAnimationFrame(paint);
  };
  paint(start);
}

function show(it) {
  const { $, index } = it;
  const step = ENDING_STEPS[index];
  const count = ENDING_STEPS.length;
  $('endCount').textContent = `The end · ${index + 1} of ${count}`;
  $('endTitle').textContent = step.title;
  $('endText').innerHTML = step.text.map(p => `<p>${p}</p>`).join('');
  $('endScore').hidden = step.id !== 'score';
  $('endActions').hidden = step.id !== 'next';
  $('endBack').disabled = index === 0;
  $('endNext').textContent = nextLabel(index, count);
  [...$('endDots').children].forEach((dot, i) => dot.classList.toggle('on', i <= index));
  const recap = step.scene === 'recap';
  $('endScene').hidden = recap;
  $('endRecap').hidden = !recap;
  $('endStage').classList.toggle('reading', recap);
  if (recap) cancelAnimationFrame(it.frame);
  else animate(it, step.scene);
  it.overlay.scrollTop = 0;
  $('endRecap').scrollTop = 0;
  it.sound.play(step.sound);
}

function go(it, index) {
  if (index < 0 || index >= ENDING_STEPS.length) return;
  const focused = it.overlay.ownerDocument.activeElement;
  it.index = index;
  show(it);
  if (focused === it.$('endBack') && it.$('endBack').disabled) it.$('endNext').focus();
}

function close(it, then) {
  cancelAnimationFrame(it.frame);
  it.overlay.hidden = true;
  it.overlay.replaceChildren();
  it.overlay.onkeydown = null;
  then();
}

/**
 * Open the ending.
 *
 * @param {object} opts
 * @param {Document} opts.doc The page; it has an empty, hidden #endingOverlay.
 * @param {{xp: number, rank: {title: string}, chapters: object[]}} opts.view The session View, for the journey and the score.
 * @param {boolean} opts.reducedMotion Show still frames.
 * @param {{play: (name: string) => void}} opts.sound Sound effects; one cue per step.
 * @param {() => void} opts.onDone Called when the ending closes, finished or skipped.
 * @param {() => void} opts.onPlayAgain Called instead, once the player confirmed Play again.
 * @returns {void}
 */
export function playEnding({ doc, view, reducedMotion, sound, onDone, onPlayAgain }) {
  const overlay = doc.getElementById('endingOverlay');
  overlay.innerHTML = FRAME_HTML;
  overlay.hidden = false;
  const $ = id => overlay.querySelector(`#${id}`);
  const it = { overlay, $, reducedMotion, sound, index: 0, frame: 0 };
  $('endRecap').innerHTML = recapHTML(journeyOf(view.chapters));
  $('endScore').innerHTML = scoreHTML(scoreOf(view));
  $('endDots').innerHTML = ENDING_STEPS.map(() => '<li></li>').join('');
  $('endBack').onclick = () => go(it, it.index - 1);
  $('endNext').onclick = () => {
    if (it.index === ENDING_STEPS.length - 1) close(it, onDone);
    else go(it, it.index + 1);
  };
  $('endSkip').onclick = () => close(it, onDone);
  wireConfirm($('endAgain'), { ...AGAIN, run: () => close(it, onPlayAgain) });
  const keepFocus = keepFocusIn(overlay);
  overlay.onkeydown = event => {
    if (event.key === 'Escape') close(it, onDone);
    else if (event.key === 'ArrowLeft') go(it, it.index - 1);
    else if (event.key === 'ArrowRight') go(it, it.index + 1);
    else keepFocus(event);
  };
  show(it);
  $('endNext').focus();
}
