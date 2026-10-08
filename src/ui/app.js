/**
 * The game page: draws the session's View, sends the player's lines to the
 * session, and turns each Turn's events into sound, cards and confetti.
 * Rules live in the session; this module only shows them.
 */

import { createTerminal } from './terminal.js';
import { renderHUD, layoutButton, hudOpen, hudToggle, SMALL_WINDOW } from './hud.js';
import { questHTML, spellsHTML, chaptersHTML, nowHTML } from './panels.js';
import { titleCardHTML, bossCardHTML, debriefHTML, openCard, closeCard } from './cards.js';
import { commandForPath, commandForPick } from './picks.js';
import { esc, inlineCode } from './output.js';
import { confetti } from './confetti.js';
import { bootText, restoredText } from './messages.js';
import { createSound } from './sound.js';
import { turnSounds } from './turnsounds.js';
import { renderRoster, picksHTML } from './roster.js';
import { createQueue } from './queue.js';
import { conceal, concealEffects } from './conceal.js';
import { createToasts } from './toasts.js';
import { logoSVG } from './logo.js';
import { playIntro } from '../intro/player.js';
import { playExplainer } from '../intro/explainer.js';
import { EXPLAINERS } from '../intro/explainers.js';
import { placeOf, drawKey } from '../map/map.js';

const TABS = ['quest', 'spells', 'levels'];
const TOAST_MS = 2600;
const RANK_FLASH_MS = 3200;

/**
 * Start the page.
 *
 * @param {object} deps
 * @param {Document} deps.doc The page.
 * @param {object} deps.session A session from createSession (DESIGN.md section 2.2).
 * @param {Function} deps.createMap The map renderer (DESIGN.md section 2.4).
 * @param {() => object} deps.createIntroBackend A fresh backend for the intro to run its lines on.
 * @param {(columns: number) => Promise<void>} deps.resizeTerminal Tells the game's shell the terminal's width.
 * @param {string|null} [deps.explainer] Dev mode only: the id of an explainer to open over the title screen.
 * @returns {Promise<void>} Resolves once the title screen is up.
 */
export async function startApp({ doc, session, createMap, createIntroBackend, resizeTerminal, explainer = null }) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sound = createSound();
  const ui = { doc, session, sound, reducedMotion, view: null, queue: createQueue(), mapQueue: createQueue(), rankUp: null };
  ui.terminal = createTerminal({
    root: doc.getElementById('term'),
    queue: ui.queue,
    onSubmit: line => runLine(ui, line),
    onComplete: line => session.complete(line),
    onKey: () => sound.play('key'),
    onResize: resizeTerminal,
  });
  ui.toasts = createToastLine(doc);
  ui.map = createMap(doc.getElementById('map'), { reducedMotion, onPick: pick => ui.terminal.insert(commandForPick(pick)) });
  ui.intro = () => playIntro({ doc, createMap, createBackend: createIntroBackend, reducedMotion, sound, onDone: line => finishIntro(ui, line) });
  ui.explainer = (shown, onDone) => playExplainer({ doc, explainer: shown, reducedMotion, sound, onDone });
  doc.getElementById('brand').innerHTML = logoSVG('SHELLCRAFT');
  wireControls(ui);
  await act(ui, async () => {
    show(ui, await session.boot());
    showRoom(ui);
  });
  renderRoster(doc.getElementById('rosterList'), drawKey, devicePixelRatio || 1, ui.view.prompt.home);
  showTitle(ui);
  if (Object.hasOwn(EXPLAINERS, explainer ?? '')) ui.explainer(EXPLAINERS[explainer], () => doc.getElementById('goBtn').focus());
}

// Every session call runs in the queue the player's lines use, so two never overlap (the session
// raises if they do).
function act(ui, step) {
  return ui.queue.add(step);
}

function show(ui, view) {
  const { doc } = ui;
  const previous = ui.view;
  ui.view = view;
  ui.sound.setOn(view.sound);
  renderHUD(doc, view);
  doc.getElementById('tab-quest').innerHTML = questHTML(view);
  doc.getElementById('now').innerHTML = nowHTML(view.chapter);
  doc.getElementById('spells').innerHTML = spellsHTML(view.spellbook);
  doc.getElementById('levels').innerHTML = chaptersHTML(view.chapters);
  renderCrumbs(doc, view.prompt, placeOf(ui.session.observation()).name);
  ui.terminal.setPrompt(view.prompt);
  if (previous && view.rank.floor > previous.rank.floor) rankUp(ui, view.rank.title);
}

// Through the queue, so an animation still waiting from an earlier line cannot draw over the new room.
function showRoom(ui) {
  const obs = conceal(ui.session.observation(), ui.session.view().concealed);
  afterMap(ui, () => {
    ui.map.show(obs);
    roomSettled(ui);
  });
}

// The map keeps its canvas labelled with the room in words; the live region repeats it aloud.
function roomSettled(ui) {
  const room = ui.doc.getElementById('roomText');
  const text = ui.doc.getElementById('map').getAttribute('aria-label');
  if (room.textContent !== text) room.textContent = text;
  ui.picks = ui.map.picks();
  ui.doc.getElementById('picks').innerHTML = picksHTML(ui.picks);
}

function renderCrumbs(doc, { cwd }, place) {
  const parts = cwd.split('/').filter(Boolean);
  const buttons = parts.map((part, i) => {
    const path = `/${parts.slice(0, i + 1).join('/')}`;
    return `<button type="button" data-cd="${esc(path)}">${esc(part)}</button>`;
  });
  const area = `<span class="area">${esc(place)}</span>`;
  const crumbs = doc.getElementById('crumbs');
  crumbs.innerHTML = `<span class="path"><button type="button" data-cd="/" aria-label="the root directory, /">/</button>${buttons.join('/')}</span>${area}`;
  // A deep path scrolls inside its line; show its end, where the player is.
  const path = crumbs.querySelector('.path');
  path.scrollLeft = path.scrollWidth;
}

function createToastLine(doc) {
  const el = doc.getElementById('toast');
  return createToasts({
    show: html => {
      el.innerHTML = html;
      el.classList.add('on');
      doc.getElementById('announce').textContent = el.textContent;
    },
    hide: () => el.classList.remove('on'),
    wait: done => {
      const id = setTimeout(done, TOAST_MS);
      return { cancel: () => clearTimeout(id) };
    },
  });
}

// Cards hold the toasts back, so a celebration is never spent behind one.
function showCard(ui, html, kind) {
  ui.toasts.hold();
  return openCard(ui.doc, html, kind);
}

function hideCard(ui) {
  closeCard(ui.doc);
  ui.toasts.release();
}

// A note in the terminal, where the player is looking; html is built from escaped parts.
function noteHTML(ui, html) {
  ui.terminal.print([{ stream: 'note', text: '', html }]);
}

function rankUp(ui, title) {
  ui.rankUp = title;
  ui.toasts.add(`Rank up! You are now ${esc(title)}`);
  noteHTML(ui, `<b>Rank up!</b> You are now ${esc(title)}.`);
  ui.map.banner('RANK UP', `You are now ${title}`);
  ui.sound.play('level');
  const rank = ui.doc.getElementById('rank');
  rank.classList.remove('up');
  void rank.offsetWidth;
  rank.classList.add('up');
  setTimeout(() => rank.classList.remove('up'), RANK_FLASH_MS);
}

function shake(ui) {
  const app = ui.doc.getElementById('app');
  app.classList.remove('shake');
  void app.offsetWidth;
  app.classList.add('shake');
}

function chapterBanner(ui) {
  const { number, title } = ui.view.chapter;
  ui.terminal.printLine(`-- Chapter ${number}: ${title} --`, 'chapter');
  ui.terminal.printLine('Read the Quest panel, then type commands here. Type hint if you get stuck.', 'sys');
}

async function runLine(ui, line) {
  ui.doc.querySelector('.callout')?.remove();
  if (!line.trim()) return;
  applyTurn(ui, await ui.session.submit(line));
}

function revealHint(ui) {
  return act(ui, () => {
    if (ui.session.hint()) ui.sound.play('hint');
    show(ui, ui.session.view());
  });
}

function applyTurn(ui, turn) {
  ui.rankUp = null;
  ui.terminal.print(turn.result.output);
  turnSounds(turn).forEach(name => ui.sound.play(name));
  afterMap(ui, async () => {
    const hidden = turn.view.concealed;
    await ui.map.play(concealEffects(turn.effects, hidden), conceal(turn.obs, hidden));
    roomSettled(ui);
  });
  show(ui, turn.view);
  for (const event of turn.events) onEvent(ui, event);
}

const EVENTS = {
  task(ui, { goal, xp }) {
    ui.toasts.add(`+${xp} XP &middot; Task done: ${inlineCode(goal)}`);
    noteHTML(ui, `Task done: ${inlineCode(goal)} <b>+${xp} XP</b>`);
    ui.sound.play('ok');
    confetti(ui.doc.getElementById('confetti'), { origins: [[0.3, 0.3]], count: 30 });
  },
  // The divider goes in at once, before the next prompt: a boss room may move the player, and the
  // scrollback must not suggest the line just typed did that.
  'boss-start'(ui, { title }) {
    ui.terminal.printLine(`-- Boss room: ${title} --`, 'chapter');
    afterMap(ui, () => openBoss(ui));
  },
  boss(ui, { xp }) {
    ui.toasts.add(`+${xp} XP &middot; Boss defeated`);
    noteHTML(ui, `Boss defeated. <b>+${xp} XP</b>`);
    ui.sound.play('ok');
  },
  chapter(ui, event) {
    ui.log = { ...event, rankUp: ui.rankUp };
    afterMap(ui, () => openDebrief(ui));
  },
  'heart-lost'(ui, { reason }) {
    ui.terminal.printLine(`[Guardian] ${reason}`, 'note');
    ui.sound.play('hurt');
    shake(ui);
  },
  'hearts-restored'(ui, { phase }) {
    ui.terminal.printLine(`[Guardian] ${restoredText(phase)}`, 'note');
  },
};

function onEvent(ui, event) {
  const handler = EVENTS[event.kind];
  if (!handler) throw new Error(`unknown event: ${event.kind}`);
  handler(ui, event);
}

function afterMap(ui, step) {
  return ui.mapQueue.add(step);
}

function openBoss(ui) {
  const { chapter } = ui.view;
  ui.sound.play('boss');
  const card = showCard(ui, bossCardHTML(chapter.boss, chapter.number), 'boss');
  card.querySelector('#bossGo').onclick = () => {
    hideCard(ui);
    ui.terminal.focus();
  };
}

function openDebrief(ui) {
  const { chapters, chapter } = ui.view;
  const { recap, field, why = '', total } = ui.log;
  const index = chapters.findIndex(c => c.id === chapter.id);
  ui.sound.play('level');
  confetti(ui.doc.getElementById('confetti'), { origins: [[0.25, 0.3], [0.75, 0.3]] });
  const html = debriefHTML({ chapter, recap, why, field, xp: total, rankUp: ui.log.rankUp, next: chapters[index + 1] ?? null });
  const card = showCard(ui, html, 'log');
  card.querySelector('#stayBtn').onclick = () => {
    hideCard(ui);
    ui.terminal.focus();
  };
  const next = card.querySelector('#nextBtn');
  if (next) next.onclick = () => startChapter(ui, next.dataset.ch, false);
}

async function startChapter(ui, id, fresh, note = 'You jumped to this chapter, so the world was set up fresh.') {
  hideCard(ui);
  await act(ui, async () => {
    show(ui, await ui.session.startChapter(id, { fresh }));
    showRoom(ui);
  });
  ui.terminal.clear();
  chapterBanner(ui);
  if (fresh) ui.terminal.printLine(note, 'sys');
  showTab(ui.doc, 'quest');
  firstExplainer(ui, () => ui.terminal.focus());
}

function showTitle(ui) {
  const { view } = ui;
  const card = showCard(ui, titleCardHTML(view.started ? view.chapter : null));
  card.querySelector('#goBtn').onclick = () => begin(ui);
  const fresh = card.querySelector('#newBtn');
  if (fresh) fresh.onclick = async () => {
    await act(ui, async () => {
      show(ui, await ui.session.reset());
      showRoom(ui);
    });
    begin(ui);
  };
}

function begin(ui) {
  hideCard(ui);
  ui.terminal.clear();
  ui.terminal.printLine('Welcome to Kernelia GNU/Linux (simulated).', 'sys');
  const saved = bootText(ui.view.boot);
  if (saved) ui.terminal.printLine(saved, 'note');
  chapterBanner(ui);
  if (ui.view.introSeen) firstExplainer(ui, () => ui.terminal.focus());
  else ui.intro();
}

async function finishIntro(ui, yourTurn) {
  const first = !ui.view.introSeen;
  await act(ui, () => {
    ui.session.markIntroSeen();
    ui.view = ui.session.view();
  });
  firstExplainer(ui, () => {
    if (first) showCallout(ui, `Your turn: type <code>${esc(yourTurn)}</code> and press <kbd>Enter</kbd>.`);
    ui.terminal.focus();
  });
}

// The first time a chapter with an explainer opens, it plays before the lesson.
function firstExplainer(ui, then) {
  const { explainer } = ui.view.chapter;
  if (explainer && !explainer.seen) watchExplainer(ui, then);
  else then();
}

function watchExplainer(ui, then) {
  ui.explainer(ui.view.chapter.explainer, async id => {
    await act(ui, () => {
      ui.session.markExplainerSeen(id);
      ui.view = ui.session.view();
    });
    then();
  });
}

function showCallout(ui, html) {
  const callout = ui.doc.createElement('div');
  callout.className = 'callout';
  callout.setAttribute('role', 'note');
  callout.innerHTML = html;
  ui.doc.getElementById('screen').append(callout);
}

function showTab(doc, name) {
  for (const tab of TABS) {
    const button = doc.getElementById(`tabbtn-${tab}`);
    button.setAttribute('aria-selected', String(tab === name));
    button.tabIndex = tab === name ? 0 : -1;
    doc.getElementById(`tab-${tab}`).hidden = tab !== name;
  }
}

function wireTabs(doc) {
  const list = doc.querySelector('.tabs');
  list.addEventListener('click', event => {
    const tab = event.target.closest('button')?.dataset.tab;
    if (tab) showTab(doc, tab);
  });
  list.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const current = TABS.findIndex(t => doc.getElementById(`tabbtn-${t}`).getAttribute('aria-selected') === 'true');
    const next = TABS[(current + step + TABS.length) % TABS.length];
    showTab(doc, next);
    doc.getElementById(`tabbtn-${next}`).focus();
  });
}

function wireControls(ui) {
  const { doc, session, terminal } = ui;
  wireTabs(doc);
  wirePicks(ui);
  doc.getElementById('crumbs').addEventListener('click', event => {
    const path = event.target.closest('button')?.dataset.cd;
    if (path) terminal.insert(commandForPath(path));
  });
  doc.getElementById('spells').addEventListener('click', event => {
    const line = event.target.closest('.chip')?.dataset.ins;
    if (line) terminal.insert(line);
  });
  doc.getElementById('levels').addEventListener('click', event => {
    const button = event.target.closest('button[data-ch]');
    if (button && !button.disabled) startChapter(ui, button.dataset.ch, true);
  });
  doc.getElementById('tab-quest').addEventListener('click', event => {
    if (event.target.closest('#hintBtn')) revealHint(ui);
    if (event.target.closest('#logBtn')) openDebrief(ui);
    if (event.target.closest('#explainerBtn')) watchExplainer(ui, () => doc.getElementById('explainerBtn')?.focus());
  });
  doc.getElementById('soundBtn').addEventListener('click', () => act(ui, () => {
    session.setSound(!ui.view.sound);
    show(ui, session.view());
    ui.sound.play('ok');
  }));
  doc.getElementById('layoutBtn').addEventListener('click', () => act(ui, () => {
    show(ui, session.setLayout(layoutButton(ui.view.layout).next));
  }));
  wireHudToggle(doc);
  doc.getElementById('introBtn').addEventListener('click', () => ui.intro());
  doc.getElementById('keyBtn').addEventListener('click', () => {
    const roster = doc.getElementById('roster');
    roster.open = true;
    roster.scrollIntoView({ block: 'nearest' });
    roster.querySelector('summary').focus({ preventScroll: true });
  });
  // On a window the app fits, a closed key hides its line, so focus goes back to the link.
  doc.getElementById('roster').addEventListener('toggle', event => {
    if (!event.target.open && event.target.contains(doc.activeElement)) doc.getElementById('keyBtn').focus();
  });
  wireReset(ui);
}

// The HUD follows the window size until the player opens or hides it; that choice lasts the visit.
function wireHudToggle(doc) {
  const small = doc.defaultView.matchMedia(SMALL_WINDOW);
  const button = doc.getElementById('hudToggle');
  let chosen = null;
  const draw = () => {
    const open = hudOpen({ small: small.matches, chosen });
    const { text, expanded } = hudToggle(open);
    button.textContent = text;
    button.setAttribute('aria-expanded', expanded);
    doc.getElementById('app').dataset.hud = open ? 'open' : 'collapsed';
  };
  button.addEventListener('click', () => {
    chosen = button.getAttribute('aria-expanded') !== 'true';
    draw();
  });
  small.addEventListener('change', draw);
  draw();
}

function wirePicks(ui) {
  const list = ui.doc.getElementById('picks');
  const pickOf = event => ui.picks[event.target.closest('[data-pick]')?.dataset.pick];
  list.addEventListener('click', event => {
    const pick = pickOf(event);
    if (pick) ui.terminal.insert(commandForPick(pick));
  });
  for (const type of ['focusin', 'mouseover']) list.addEventListener(type, event => ui.map.focus(pickOf(event)?.name ?? null));
  for (const type of ['focusout', 'mouseleave']) list.addEventListener(type, () => ui.map.focus(null));
}

// A button that acts only on a second click, so one stray click never throws progress away.
function wireConfirm(button, { label, confirm, run }) {
  let armed = false;
  const disarm = () => {
    armed = false;
    button.textContent = label;
  };
  button.addEventListener('click', async () => {
    armed = !armed;
    button.textContent = armed ? confirm : label;
    if (!armed) await run();
  });
  button.addEventListener('blur', disarm);
}

function wireReset(ui) {
  wireConfirm(ui.doc.getElementById('resetBtn'), {
    label: 'Reset progress',
    confirm: 'Click again to erase all progress',
    run: async () => {
      await act(ui, async () => {
        show(ui, await ui.session.reset());
        showRoom(ui);
      });
      ui.terminal.clear();
      chapterBanner(ui);
      showTab(ui.doc, 'quest');
    },
  });
  wireConfirm(ui.doc.getElementById('restartBtn'), {
    label: 'Restart chapter',
    confirm: 'Click again to restart',
    run: () => startChapter(ui, ui.view.chapter.id, true, 'You restarted this chapter: its world is set up fresh and its tasks start over. Tasks you already finished pay no XP again.'),
  });
}
