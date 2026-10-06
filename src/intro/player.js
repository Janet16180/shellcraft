/**
 * Plays the intro storyboard (steps.js) in its own overlay, on a private
 * backend, with the game's map. The player sets the pace: Back, Next and Skip;
 * nothing moves on by itself. With reduced motion every step is a still frame.
 */

import { STEPS, WORLD, PROMPT_PIECES } from './steps.js';
import { linesBefore, anatomyHTML, partsHTML, keysHTML, nextLabel } from './frames.js';
import { chunkLine, esc, promptHTML } from '../ui/output.js';
import { keepFocusIn } from '../ui/focus.js';
import { worldEffects } from '../game/effects.js';

const TYPE_MS = 75;
const PAUSE_MS = 300;

const FRAME_HTML = `<div class="intro window" role="dialog" aria-modal="true" aria-labelledby="introTitle">
  <header class="intro-head">
    <span class="eyebrow" id="introCount"></span>
    <button class="px-btn small ghost" id="introSkip" type="button">Skip intro</button>
  </header>
  <div class="intro-stage stage window" id="introStage">
    <canvas id="introMap" width="640" height="400" aria-hidden="true"></canvas>
    <div class="scroll" id="introScroll" hidden><pre></pre></div>
  </div>
  <div class="intro-term window">
    <div class="intro-screen" id="introScreen" aria-hidden="true"></div>
    <div class="intro-figure" id="introFigure"></div>
  </div>
  <div class="intro-caption" aria-live="polite">
    <h2 id="introTitle"></h2>
    <div class="intro-text" id="introText"></div>
  </div>
  <nav class="intro-nav" aria-label="Intro">
    <button class="px-btn ghost" id="introBack" type="button">Back</button>
    <ol class="dots" id="introDots" aria-hidden="true"></ol>
    <button class="px-btn primary" id="introNext" type="button">Next</button>
  </nav>
</div>`;

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

function promptOf(obs) {
  return promptHTML({ user: obs.user, host: obs.host, cwd: obs.cwd, home: obs.home });
}

function outputHTML(output) {
  return output.map(chunkLine).filter(Boolean).map(l => `<div class="${l.cls}">${l.html}</div>`).join('');
}

function transcriptHTML(entries) {
  return entries.map(({ prompt, line, output }) => `<div class="ln">${prompt}${esc(line)}</div>${outputHTML(output)}`).join('');
}

function waitingLineHTML(obs) {
  return `<div class="ln now">${promptOf(obs)}<span class="typed"></span><span class="cursor"></span></div>`;
}

function figureHTML(step) {
  if (step.focus) return `<div class="anatomy">${anatomyHTML(PROMPT_PIECES, step.focus)}</div>`;
  if (step.parts) return `<div class="parts">${partsHTML(step.parts)}</div>`;
  return '';
}

function renderChrome(it, step, index) {
  it.$('introCount').textContent = `How to play · ${index + 1} of ${STEPS.length}`;
  it.$('introTitle').innerHTML = step.title;
  it.$('introText').innerHTML = step.text.map(p => `<p>${p}</p>`).join('') + (step.keys ? keysHTML(step.keys) : '');
  it.$('introFigure').innerHTML = figureHTML(step);
  it.$('introScroll').hidden = true;
  it.$('introBack').disabled = index === 0;
  it.$('introNext').textContent = nextLabel(STEPS, index);
  [...it.$('introDots').children].forEach((dot, i) => dot.classList.toggle('on', i <= index));
}

function scrollScreen(it) {
  const screen = it.$('introScreen');
  screen.scrollTop = screen.scrollHeight;
}

async function replay(it, index) {
  const backend = it.createBackend();
  await backend.load(WORLD);
  const history = [];
  for (const line of linesBefore(STEPS, index)) {
    const prompt = promptOf(await backend.observe());
    history.push({ prompt, line, output: (await backend.run(line)).output });
  }
  return { backend, history };
}

async function typeLine(it, line, live) {
  const typed = it.$('introScreen').querySelector('.now .typed');
  if (it.reducedMotion) {
    typed.textContent = line;
    return;
  }
  for (const char of line) {
    await sleep(TYPE_MS);
    if (!live()) return;
    typed.textContent += char;
    it.sound.play('key');
  }
  await sleep(PAUSE_MS);
}

function showScroll(it, text) {
  const scroll = it.$('introScroll');
  scroll.querySelector('pre').textContent = text;
  scroll.hidden = false;
}

async function runStep(it, step, backend, before, live) {
  await typeLine(it, step.type, live);
  if (!live()) return;
  const result = await backend.run(step.type);
  const after = await backend.observe();
  if (!live()) return;
  const now = it.$('introScreen').querySelector('.now');
  now.classList.remove('now');
  now.querySelector('.cursor').remove();
  now.insertAdjacentHTML('afterend', outputHTML(result.output) + waitingLineHTML(after));
  scrollScreen(it);
  if (before.cwd !== after.cwd) {
    it.sound.play('step');
    it.map.focus(null);
  }
  if (step.scroll) showScroll(it, result.output.map(c => c.text).join(''));
  await it.map.play(worldEffects(before, after), after);
  if (live() && step.say) it.map.say(step.say, 'player');
}

// Type the start of a name, then show Tab finishing it, as bash does; the line is not run.
async function completeStep(it, typed, backend, live) {
  await typeLine(it, typed, live);
  const { line } = await backend.complete(typed);
  if (!live()) return;
  const now = it.$('introScreen').querySelector('.now');
  now.querySelector('.typed').textContent = line;
  now.querySelector('.cursor').insertAdjacentHTML('afterend', '<kbd class="tabpress">Tab</kbd>');
  it.sound.play('key');
}

async function showStep(it, index) {
  const token = ++it.token;
  const live = () => token === it.token;
  const step = STEPS[index];
  renderChrome(it, step, index);
  const { backend, history } = await replay(it, index);
  const before = await backend.observe();
  if (!live()) return;
  it.map.show(before);
  it.map.focus(step.ring ?? null);
  it.$('introScreen').innerHTML = transcriptHTML(history) + waitingLineHTML(before);
  scrollScreen(it);
  if (step.type) await runStep(it, step, backend, before, live);
  if (step.complete) await completeStep(it, step.complete, backend, live);
}

function close(it) {
  it.token += 1;
  it.map.destroy();
  it.overlay.hidden = true;
  it.overlay.replaceChildren();
  it.onDone(STEPS.at(-1).yourTurn);
}

function go(it, index) {
  it.index = index;
  showStep(it, index);
}

/**
 * Open the intro.
 *
 * @param {object} opts
 * @param {Document} opts.doc The page.
 * @param {Function} opts.createMap The map renderer.
 * @param {() => object} opts.createBackend Makes a fresh backend; the intro rebuilds its world on every step.
 * @param {boolean} opts.reducedMotion Show still frames instead of animation.
 * @param {{play: (name: string) => void}} opts.sound Sound effects.
 * @param {(line: string) => void} opts.onDone Called when the intro closes, finished or skipped,
 *   with the line the player is asked to type first.
 * @returns {void}
 */
export function playIntro({ doc, createMap, createBackend, reducedMotion, sound, onDone }) {
  const overlay = doc.getElementById('introOverlay');
  overlay.innerHTML = FRAME_HTML;
  overlay.hidden = false;
  const $ = id => overlay.querySelector(`#${id}`);
  const map = createMap($('introMap'), { reducedMotion, onPick: () => {} });
  const it = { overlay, $, map, createBackend, reducedMotion, sound, onDone, index: 0, token: 0 };
  $('introDots').innerHTML = STEPS.map(() => '<li></li>').join('');
  $('introBack').onclick = () => go(it, Math.max(0, it.index - 1));
  $('introNext').onclick = () => {
    if (it.index === STEPS.length - 1) close(it);
    else go(it, it.index + 1);
  };
  $('introSkip').onclick = () => close(it);
  const keepFocus = keepFocusIn(overlay);
  overlay.onkeydown = event => {
    if (event.key === 'Escape') close(it);
    else keepFocus(event);
  };
  go(it, 0);
  $('introNext').focus();
}
