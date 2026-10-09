/**
 * Plays a chapter explainer (explainers.js) in its own overlay: a caption, a
 * small terminal and an animated diagram per step. The player sets the pace
 * with Back, Next and Skip; nothing moves on by itself. All the timing is CSS
 * animation delays, so with reduced motion every step is a still frame of its
 * end.
 */

import { termHTML, termTimeline } from './term.js';
import { keepFocusIn } from '../ui/focus.js';

const DEFAULT_SOUND = 'page';

const FRAME_HTML = `<div class="explainer window" role="dialog" aria-modal="true" aria-labelledby="exName">
  <header class="ex-head">
    <div class="ex-headline">
      <span class="eyebrow" id="exCount"></span>
      <h2 class="ex-name" id="exName"></h2>
    </div>
    <button class="px-btn small ghost" id="exSkip" type="button">Skip</button>
  </header>
  <div class="ex-caption" aria-live="polite">
    <h3 id="exTitle"></h3>
    <div class="ex-text" id="exText"></div>
  </div>
  <div class="ex-term" id="exTerm">
    <div class="ex-screen" id="exScreen" aria-hidden="true"></div>
    <pre class="sr-only" id="exTyped"></pre>
  </div>
  <div class="ex-stage window" id="exStage">
    <div class="ex-diagram" id="exDiagram"></div>
    <button class="px-btn small ghost ex-again" id="exAgain" type="button">Play again</button>
  </div>
  <nav class="ex-nav" aria-label="Explainer">
    <button class="px-btn ghost" id="exBack" type="button">Back</button>
    <ol class="dots" id="exDots" aria-hidden="true"></ol>
    <button class="px-btn primary" id="exNext" type="button">Next</button>
  </nav>
</div>`;

/**
 * What one step shows and when its sound plays.
 *
 * @param {(diagram: object, timing: object) => string} draw The explainer's diagram drawer.
 * @param {{term?: object[], diagram: object, sound?: string}} step The step.
 * @returns {{term: string, typed: string, diagram: string, sound: string, cueAt: number}} The
 *   strip's HTML, its lines as plain text for screen readers, the diagram's HTML, the sound and
 *   when it plays (seconds): with the first output, or at once when nothing is typed.
 */
export function stepPlan(draw, step) {
  const entries = step.term ?? [];
  const { lines, end } = termTimeline(entries);
  return {
    term: termHTML(entries),
    typed: entries.map(e => [`$ ${e.type}`, ...(e.output ?? [])].join('\n')).join('\n'),
    diagram: draw(step.diagram, { at: index => lines[index].outAt, end }),
    sound: step.sound ?? DEFAULT_SOUND,
    cueAt: lines.length ? lines[0].outAt : 0,
  };
}

/**
 * The label of the Next button on a step.
 *
 * @param {number} index The step, from 0.
 * @param {number} count How many steps there are.
 * @returns {string} "Next", or "Done" on the last step.
 */
export function nextLabel(index, count) {
  return index === count - 1 ? 'Done' : 'Next';
}

function play(it) {
  const token = ++it.token;
  const plan = stepPlan(it.explainer.draw, it.explainer.steps[it.index]);
  it.$('exScreen').innerHTML = plan.term;
  it.$('exTerm').hidden = plan.term === '';
  it.$('exTyped').textContent = plan.typed;
  it.$('exDiagram').innerHTML = plan.diagram;
  const cue = () => { if (token === it.token) it.sound.play(plan.sound); };
  whenSeen(it, token, () => {
    if (it.reducedMotion || plan.cueAt === 0) cue();
    else setTimeout(cue, plan.cueAt * 1000);
  });
}

// On a phone the diagram sits below the caption: hold the animation until it scrolls into view.
function whenSeen(it, token, start) {
  it.observer?.disconnect();
  const frame = it.overlay.firstElementChild;
  const Observer = it.overlay.ownerDocument.defaultView.IntersectionObserver;
  if (it.reducedMotion || !Observer) {
    start();
    return;
  }
  frame.classList.add('ex-waiting');
  it.observer = new Observer(entries => {
    if (token !== it.token || !entries.some(e => e.isIntersecting)) return;
    it.observer.disconnect();
    frame.classList.remove('ex-waiting');
    start();
  }, { root: it.overlay, threshold: 0.4 });
  it.observer.observe(it.$('exStage'));
}

function show(it) {
  const { explainer, index, $ } = it;
  const step = explainer.steps[index];
  const count = explainer.steps.length;
  $('exCount').textContent = `Explainer · ${index + 1} of ${count}`;
  $('exTitle').innerHTML = step.title;
  $('exText').innerHTML = step.text.map(p => `<p>${p}</p>`).join('');
  $('exBack').disabled = index === 0;
  $('exNext').textContent = nextLabel(index, count);
  [...$('exDots').children].forEach((dot, i) => dot.classList.toggle('on', i <= index));
  it.overlay.scrollTop = 0;
  play(it);
}

function go(it, index) {
  if (index < 0 || index >= it.explainer.steps.length) return;
  const focused = it.overlay.ownerDocument.activeElement;
  it.index = index;
  show(it);
  if (focused === it.$('exBack') && it.$('exBack').disabled) it.$('exNext').focus();
}

function close(it) {
  it.token += 1;
  it.observer?.disconnect();
  it.overlay.hidden = true;
  it.overlay.replaceChildren();
  it.overlay.onkeydown = null;
  it.onDone(it.explainer.id);
}

/**
 * Open an explainer.
 *
 * @param {object} opts
 * @param {Document} opts.doc The page; it has an empty, hidden #explainerOverlay.
 * @param {{id: string, title: string, draw: Function, steps: object[]}} opts.explainer The explainer.
 * @param {boolean} opts.reducedMotion Show still frames: the cue sounds at once and Play again hides.
 * @param {{play: (name: string) => void}} opts.sound Sound effects; one cue per step.
 * @param {(id: string) => void} opts.onDone Called with the explainer's id when it closes, finished or skipped.
 * @returns {void}
 */
export function playExplainer({ doc, explainer, reducedMotion, sound, onDone }) {
  const overlay = doc.getElementById('explainerOverlay');
  overlay.innerHTML = FRAME_HTML;
  overlay.hidden = false;
  const $ = id => overlay.querySelector(`#${id}`);
  const it = { overlay, $, explainer, reducedMotion, sound, onDone, index: 0, token: 0 };
  $('exName').textContent = explainer.title;
  $('exDots').innerHTML = explainer.steps.map(() => '<li></li>').join('');
  $('exAgain').hidden = reducedMotion;
  $('exAgain').onclick = () => play(it);
  $('exBack').onclick = () => go(it, it.index - 1);
  $('exNext').onclick = () => {
    if (it.index === explainer.steps.length - 1) close(it);
    else go(it, it.index + 1);
  };
  $('exSkip').onclick = () => close(it);
  $('exSkip').setAttribute('aria-label', `Skip the explainer: ${explainer.title}`);
  const keepFocus = keepFocusIn(overlay);
  overlay.onkeydown = event => {
    if (event.key === 'Escape') close(it);
    else if (event.key === 'ArrowLeft' && !event.target.closest('input, textarea')) go(it, it.index - 1);
    else if (event.key === 'ArrowRight' && !event.target.closest('input, textarea')) {
      if (it.index < explainer.steps.length - 1) go(it, it.index + 1);
    } else keepFocus(event);
  };
  show(it);
  $('exNext').focus();
}
