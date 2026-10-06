/**
 * The game page: draws the session's View, sends the player's lines to the
 * session, and turns each Turn's events into sound, cards and confetti.
 * Rules live in the session; this module only shows them.
 */

import { createTerminal } from './terminal.js';
import { renderHUD } from './hud.js';
import { questHTML, spellsHTML, chaptersHTML } from './panels.js';
import { titleCardHTML, bossCardHTML, debriefHTML, openCard, closeCard } from './cards.js';
import { hintLabel, hintTitle, typedHintFollowUp } from './hints.js';
import { commandForPath, commandForPick } from './picks.js';
import { esc } from './output.js';
import { confetti } from './confetti.js';
import { createSound } from './sound.js';
import { renderRoster } from './roster.js';
import { playIntro } from '../intro/player.js';

const TABS = ['quest', 'spells', 'levels'];
const TOAST_MS = 2600;

/**
 * Start the page.
 *
 * @param {object} deps
 * @param {Document} deps.doc The page.
 * @param {object} deps.session A session from createSession (DESIGN.md section 2.2).
 * @param {Function} deps.createMap The map renderer (DESIGN.md section 2.4).
 * @param {(obs: object) => string} deps.describeRoom The map's text alternative.
 * @param {() => object} deps.createIntroBackend A fresh backend for the intro to run its lines on.
 * @returns {Promise<void>} Resolves once the title screen is up.
 */
export async function startApp({ doc, session, createMap, describeRoom, createIntroBackend }) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sound = createSound();
  const ui = { doc, session, sound, reducedMotion, view: null, mapQueue: Promise.resolve(), hintPending: false, toastTimer: 0 };
  ui.terminal = createTerminal({
    root: doc.getElementById('term'),
    onSubmit: line => runLine(ui, line),
    onComplete: line => session.complete(line),
    onKey: () => sound.play('key'),
  });
  ui.map = createMap(doc.getElementById('map'), { reducedMotion, onPick: pick => ui.terminal.insert(commandForPick(pick)) });
  ui.describeRoom = describeRoom;
  ui.intro = () => playIntro({ doc, createMap, createBackend: createIntroBackend, reducedMotion, sound, onDone: line => finishIntro(ui, line) });
  renderRoster(doc.getElementById('rosterList'));
  wireControls(ui);
  show(ui, await session.boot());
  await showRoom(ui, await session.observe());
  showTitle(ui);
}

function show(ui, view) {
  const { doc } = ui;
  const previous = ui.view;
  ui.view = view;
  ui.sound.setOn(view.sound);
  renderHUD(doc, view);
  doc.getElementById('tab-quest').innerHTML = questHTML(view);
  doc.getElementById('spells').innerHTML = spellsHTML(view.spells);
  doc.getElementById('levels').innerHTML = chaptersHTML(view.chapters);
  renderCrumbs(doc, view.prompt);
  ui.terminal.setPrompt(view.prompt);
  if (previous && previous.rank.title !== view.rank.title) toast(ui, `Rank up: you are now ${view.rank.title}`);
}

async function showRoom(ui, obs) {
  ui.map.show(obs);
  announceRoom(ui, obs);
}

function announceRoom(ui, obs) {
  const room = ui.doc.getElementById('roomText');
  const text = ui.describeRoom(obs);
  if (room.textContent !== text) room.textContent = text;
}

function renderCrumbs(doc, { cwd }) {
  const parts = cwd.split('/').filter(Boolean);
  const buttons = parts.map((part, i) => {
    const path = `/${parts.slice(0, i + 1).join('/')}`;
    return `<button type="button" data-cd="${esc(path)}">${esc(part)}</button>`;
  });
  doc.getElementById('crumbs').innerHTML = `<button type="button" data-cd="/" aria-label="the root directory, /">/</button>${buttons.join('/')}`;
}

function toast(ui, text) {
  const el = ui.doc.getElementById('toast');
  el.textContent = text;
  el.classList.add('on');
  ui.doc.getElementById('announce').textContent = text;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.classList.remove('on'), TOAST_MS);
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
  const typed = line.trim();
  if (typed === 'hint') {
    typedHint(ui);
    return;
  }
  ui.hintPending = false;
  if (!typed) return;
  const turn = await ui.session.submit(line);
  applyTurn(ui, turn);
}

function typedHint(ui) {
  const next = ui.view.hint;
  const paid = next && next.cost > 0;
  if (paid && !ui.hintPending) {
    ui.terminal.printLine(`${hintLabel(next)}. Type hint again to reveal it.`, 'hint');
    ui.hintPending = true;
    return;
  }
  const hint = revealHint(ui);
  if (hint) ui.terminal.printLine(`${hintTitle(hint.level)}: ${hint.text}`, 'hint');
  ui.terminal.printLine(typedHintFollowUp(ui.view.hint), 'sys');
  ui.hintPending = Boolean(ui.view.hint);
}

function revealHint(ui) {
  const hint = ui.session.hint();
  if (hint) ui.sound.play('hint');
  show(ui, ui.session.view());
  return hint;
}

function applyTurn(ui, turn) {
  if (turn.result.commands.some(c => c.name === 'clear' && c.status === 0)) ui.terminal.clear();
  ui.terminal.print(turn.result.output);
  if (turn.result.output.some(chunk => chunk.stream === 'err')) ui.sound.play('err');
  if (turn.effects.some(e => e.type === 'travel')) ui.sound.play('step');
  ui.mapQueue = ui.mapQueue.then(() => ui.map.play(turn.effects, turn.obs));
  announceRoom(ui, turn.obs);
  show(ui, turn.view);
  for (const event of turn.events) onEvent(ui, event);
}

const EVENTS = {
  task(ui, { index, xp }) {
    toast(ui, `Quest complete: ${ui.view.chapter.tasks[index].goal}  +${xp} XP`);
    ui.sound.play('ok');
    confetti(ui.doc.getElementById('confetti'), { origins: [[0.3, 0.3]], count: 30 });
  },
  'boss-start'(ui) {
    afterMap(ui, () => openBoss(ui));
  },
  boss(ui, { xp }) {
    toast(ui, `Boss defeated  +${xp} XP`);
    ui.sound.play('ok');
  },
  chapter(ui, event) {
    afterMap(ui, () => openDebrief(ui, event));
  },
  'heart-lost'(ui, { reason }) {
    ui.terminal.printLine(`[Guardian] ${reason}`, 'note');
    ui.sound.play('hurt');
    shake(ui);
    ui.map.say('Ouch!', 'player');
  },
  'hearts-restored'(ui) {
    ui.terminal.printLine('[Guardian] You ran out of hearts. The Guardian set this part of the world up again and refilled them. Your XP is safe.', 'note');
  },
  notice(ui, { text }) {
    ui.terminal.printLine(text, 'note');
  },
};

function onEvent(ui, event) {
  const handler = EVENTS[event.type];
  if (!handler) throw new Error(`unknown event: ${event.type}`);
  handler(ui, event);
}

function afterMap(ui, open) {
  ui.mapQueue = ui.mapQueue.then(open);
}

function openBoss(ui) {
  const { chapter } = ui.view;
  ui.sound.play('boss');
  const card = openCard(ui.doc, bossCardHTML(chapter.boss, chapter.number), 'boss');
  card.querySelector('#bossGo').onclick = () => {
    closeCard(ui.doc);
    ui.terminal.printLine(`-- Boss room: ${chapter.boss.title} --`, 'chapter');
    ui.terminal.focus();
  };
}

function openDebrief(ui, event) {
  const { chapters, chapter } = ui.view;
  const index = chapters.findIndex(c => c.id === chapter.id);
  ui.sound.play('level');
  confetti(ui.doc.getElementById('confetti'), { origins: [[0.25, 0.3], [0.75, 0.3]] });
  const html = debriefHTML({ chapter, recap: event.recap, why: event.why ?? '', field: event.field, xp: event.xp ?? 0, next: chapters[index + 1] ?? null });
  const card = openCard(ui.doc, html, 'log');
  card.querySelector('#stayBtn').onclick = () => {
    closeCard(ui.doc);
    ui.terminal.focus();
  };
  const next = card.querySelector('#nextBtn');
  if (next) next.onclick = () => startChapter(ui, next.dataset.ch, false);
}

async function startChapter(ui, id, fresh) {
  closeCard(ui.doc);
  show(ui, await ui.session.startChapter(id, { fresh }));
  await showRoom(ui, await ui.session.observe());
  ui.terminal.clear();
  chapterBanner(ui);
  showTab(ui.doc, 'quest');
  ui.terminal.focus();
}

function showTitle(ui) {
  const { view } = ui;
  const started = view.xp > 0 || view.chapter.number > 1;
  const card = openCard(ui.doc, titleCardHTML(started ? view.chapter : null));
  card.querySelector('#goBtn').onclick = () => begin(ui);
  const fresh = card.querySelector('#newBtn');
  if (fresh) fresh.onclick = async () => {
    show(ui, await ui.session.reset());
    await showRoom(ui, await ui.session.observe());
    begin(ui);
  };
}

function begin(ui) {
  closeCard(ui.doc);
  ui.terminal.clear();
  ui.terminal.printLine('Welcome to Kernelia GNU/Linux (simulated).', 'sys');
  chapterBanner(ui);
  if (ui.view.introSeen) ui.terminal.focus();
  else ui.intro();
}

function finishIntro(ui, yourTurn) {
  ui.session.markIntroSeen();
  ui.view = ui.session.view();
  if (yourTurn) showCallout(ui, `Your turn: type <code>${esc(yourTurn)}</code> and press <kbd>Enter</kbd>.`);
  ui.terminal.focus();
}

function showCallout(ui, html) {
  const callout = ui.doc.createElement('div');
  callout.className = 'callout';
  callout.setAttribute('role', 'note');
  callout.innerHTML = html;
  ui.doc.getElementById('term').append(callout);
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
    if (event.target.closest('#logBtn')) openDebrief(ui, ui.view.chapter);
  });
  doc.getElementById('soundBtn').addEventListener('click', () => {
    session.setSound(!ui.view.sound);
    show(ui, session.view());
    ui.sound.play('ok');
  });
  doc.getElementById('introBtn').addEventListener('click', () => ui.intro());
  wireReset(ui);
}

function wireReset(ui) {
  const button = ui.doc.getElementById('resetBtn');
  let armed = false;
  button.addEventListener('click', async () => {
    armed = !armed;
    button.textContent = armed ? 'Click again to erase all progress' : 'Reset progress';
    if (armed) return;
    show(ui, await ui.session.reset());
    await showRoom(ui, await ui.session.observe());
    ui.terminal.clear();
    chapterBanner(ui);
    showTab(ui.doc, 'quest');
  });
  button.addEventListener('blur', () => {
    armed = false;
    button.textContent = 'Reset progress';
  });
}
