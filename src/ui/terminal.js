import { wireRunning } from './running.js';
import { chunkLine, clears, columnsFor, displayPath, esc, promptHTML } from './output.js';
import { createHistory } from './history.js';
import { startSearch, typeText, searchOlder, backspace, searchView } from './isearch.js';

const MAX_LINES = 600;
const PASSWORD_LABEL = 'password';
const SEARCH_LABEL = 'Search the history';

function append(t, cls, html) {
  const line = document.createElement('div');
  line.className = cls;
  line.innerHTML = html;
  t.out.append(line);
  while (t.out.childElementCount > MAX_LINES) t.out.firstElementChild.remove();
  t.screen.scrollTop = t.screen.scrollHeight;
}

function print(t, chunks) {
  for (const chunk of chunks) {
    const line = chunkLine(chunk);
    if (clears(chunk)) t.out.replaceChildren();
    if (line) append(t, line.cls, line.html);
  }
}

function printLine(t, text, cls = 'sys') {
  append(t, `ln ${cls}`, esc(text));
}

function echo(t, line, suffix = '') {
  append(t, 'ln cmdline', promptHTML(t.prompt) + esc(line) + suffix);
}

function setPrompt(t, prompt) {
  t.prompt = prompt;
  if (!t.asking && !t.search) t.promptEl.innerHTML = promptHTML(prompt);
  t.title.textContent = `${prompt.user}@${prompt.host}: ${displayPath(prompt.cwd, prompt.home)}`;
}

function caretToEnd(t) {
  const end = t.input.value.length;
  t.input.setSelectionRange(end, end);
}

function insert(t, text) {
  if (t.asking) return;
  if (t.search) endSearch(t);
  t.input.value = text;
  t.input.focus();
  caretToEnd(t);
}

// A program reads one line (sudo's password): the prompt takes the shell
// prompt's place, and hidden input keeps what is typed in a buffer, never in
// the field, so nothing shows, as in a real terminal. The prompt is not in the
// output log, so a hidden line there says it to screen readers.
function ask(t, { prompt, hidden }) {
  if (t.search) endSearch(t);
  const said = document.createElement('div');
  said.className = 'ln sr-only';
  said.innerHTML = esc(hidden ? `${prompt.trim()} (nothing you type shows)` : prompt);
  t.out.append(said);
  t.asking = { hidden, buffer: '', label: t.input.getAttribute('aria-label'), said };
  t.promptEl.innerHTML = esc(prompt);
  t.input.value = '';
  if (hidden) {
    t.input.type = 'password';
    t.input.setAttribute('aria-label', PASSWORD_LABEL);
  }
  t.input.focus();
}

function endAsk(t) {
  const { hidden, buffer, label, said } = t.asking;
  const text = hidden ? buffer : t.input.value;
  t.asking = null;
  said.remove();
  t.input.value = '';
  t.input.type = 'text';
  t.input.setAttribute('aria-label', label);
  if (t.prompt) setPrompt(t, t.prompt);
  return text;
}

function abandon(t) {
  if (t.asking) endAsk(t);
}

function hide(t, typed) {
  if (!t.asking?.hidden) return;
  t.asking.buffer += typed;
  t.input.value = '';
}

const answer = (t, text) => t.queue.add(() => t.onAnswer(text));

function submit(t) {
  if (t.asking) return answer(t, endAsk(t));
  const line = t.input.value;
  t.input.value = '';
  t.history.push(line);
  return t.queue.add(() => {
    echo(t, line);
    return t.onSubmit(line);
  });
}

async function complete(t) {
  const typed = t.input.value;
  const { line, candidates } = await t.queue.add(() => t.onComplete(typed));
  // The player may have typed on while the completion waited its turn.
  if (t.input.value !== typed) return;
  if (candidates.length > 1 && line === typed) {
    echo(t, typed);
    printLine(t, candidates.join('  '), 'out');
  }
  t.input.value = line;
  caretToEnd(t);
}

function cancel(t) {
  if (t.asking) {
    endAsk(t);
    return answer(t, null);
  }
  echo(t, t.input.value, '^C');
  t.input.value = '';
}

function recall(t, direction) {
  t.input.value = direction < 0 ? t.history.up(t.input.value) : t.history.down();
  requestAnimationFrame(() => caretToEnd(t));
}

const moveCaret = (t, at) => t.input.setSelectionRange(at, at);

// Ctrl+R, bash's reverse-i-search. The input holds the search string, so typing
// works as usual (on-screen keyboards too); the prompt before it and the tail
// after it show the rest of bash's line: (reverse-i-search)`TEXT': MATCH.
function beginSearch(t) {
  const cursor = t.input.selectionStart ?? t.input.value.length;
  t.search = { state: startSearch(t.history.entries(), t.input.value, cursor), label: t.input.getAttribute('aria-label') };
  t.input.value = '';
  t.input.classList.add('searching');
  t.input.setAttribute('aria-label', SEARCH_LABEL);
  t.tail.hidden = false;
  drawSearch(t);
}

function drawSearch(t) {
  const { prompt, line, match, failed } = searchView(t.search.state);
  t.promptEl.innerHTML = esc(prompt.slice(0, prompt.indexOf('`') + 1));
  const shown = match
    ? `${esc(line.slice(0, match.start))}<mark class="isearch-hit">${esc(line.slice(match.start, match.end))}</mark>${esc(line.slice(match.end))}`
    : esc(line);
  t.tail.innerHTML = `<span aria-hidden="true">': </span>${shown}${failed ? '<span class="sr-only">no match</span>' : ''}`;
  t.input.style.width = `calc(${t.input.value.length}ch + 2px)`;
}

// The input changed: letters added at the end search on, letters taken off search back.
function searchInput(t) {
  const { state } = t.search;
  const typed = t.input.value;
  let next = null;
  if (typed.startsWith(state.query)) next = typeText(state, typed.slice(state.query.length));
  else if (state.query.startsWith(typed)) next = [...state.query.slice(typed.length)].reduce(backspace, state);
  else next = typeText(startSearch(state.lines.slice(0, -1), state.lines.at(-1), state.start), typed);
  t.search.state = next;
  drawSearch(t);
}

function endSearch(t) {
  t.input.setAttribute('aria-label', t.search.label);
  t.search = null;
  t.input.classList.remove('searching');
  t.input.style.width = '';
  t.tail.hidden = true;
  t.tail.innerHTML = '';
  if (t.prompt) t.promptEl.innerHTML = promptHTML(t.prompt);
}

// Keep the line on show for editing; history goes on from it, as in bash.
function acceptSearch(t, step = 0) {
  const { state } = t.search;
  const { line, cursor } = searchView(state);
  endSearch(t);
  t.history.seek(state.shown, state.lines.at(-1));
  t.input.value = line;
  moveCaret(t, Math.min(Math.max(cursor + step, 0), line.length));
}

function abortSearch(t) {
  const { lines, start } = t.search.state;
  endSearch(t);
  t.input.value = lines.at(-1);
  moveCaret(t, start);
}

function interruptSearch(t) {
  const { prompt, line } = searchView(t.search.state);
  append(t, 'ln cmdline', `${esc(prompt + line)}^C`);
  endSearch(t);
  t.input.value = '';
}

// At a prompt bash ignores the Ctrl+Z the terminal sends it; only a running command stops (running.js).
const NOTHING = () => {};

const SEARCHING = {
  'C-r': t => {
    t.search.state = searchOlder(t.search.state);
    drawSearch(t);
  },
  'C-g': abortSearch,
  'C-c': interruptSearch,
  Enter: t => {
    acceptSearch(t);
    return submit(t);
  },
  Escape: t => acceptSearch(t),
  Left: t => acceptSearch(t, -1),
  Right: t => acceptSearch(t, 1),
  Up: t => {
    acceptSearch(t);
    recall(t, -1);
  },
  Down: t => {
    acceptSearch(t);
    recall(t, 1);
  },
  Tab: t => {
    acceptSearch(t);
    return complete(t);
  },
  'C-l': t => t.out.replaceChildren(),
  'C-z': NOTHING,
};

const SEARCH_KEYS = { Enter: 'Enter', Escape: 'Escape', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Tab: 'Tab' };

function searchAction(t, event) {
  const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
  const name = ctrl ? `C-${event.key.toLowerCase()}` : SEARCH_KEYS[event.key];
  return SEARCHING[name] ?? null;
}

function searchKey(t, key) {
  if (SEARCHING[key]) return SEARCHING[key](t);
  t.input.value += key;
  return searchInput(t);
}

const ACTIONS = {
  Enter: submit,
  Tab: complete,
  Up: t => recall(t, -1),
  Down: t => recall(t, 1),
  'C-c': cancel,
  'C-l': t => t.out.replaceChildren(),
  'C-r': beginSearch,
  'C-a': t => moveCaret(t, 0),
  'C-e': t => moveCaret(t, t.input.value.length),
  'C-z': NOTHING,
};

// At a program's prompt only Enter, Ctrl+C and Backspace act; history and Tab
// do nothing, from the keyboard and from the touch keys alike.
const ASKING = {
  Enter: submit,
  'C-c': cancel,
  Backspace: t => { if (t.asking.hidden) t.asking.buffer = t.asking.buffer.slice(0, -1); },
  Up: NOTHING,
  Down: NOTHING,
  Tab: NOTHING,
};

function askingAction(t, event) {
  const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
  const key = event.key;
  let action = null;
  if (ctrl && key.toLowerCase() === 'c') action = ASKING['C-c'];
  else if (ctrl && ['r', 'z'].includes(key.toLowerCase())) action = NOTHING;
  else if (key === 'Enter') action = ASKING.Enter;
  else if (key === 'Backspace' && t.asking.hidden) action = ASKING.Backspace;
  else if (['ArrowUp', 'ArrowDown'].includes(key) || (key === 'Tab' && !t.tabLeaves)) action = NOTHING;
  return action;
}

// Ctrl keys the prompt does not answer (the Ctrl+R touch key) type nothing.
function askingKey(t, key) {
  const action = ASKING[key] ?? (key.startsWith('C-') ? NOTHING : null);
  if (action) action(t);
  else if (t.asking.hidden) hide(t, key);
  else t.input.value += key;
}

// Ctrl+L, Ctrl+R, Ctrl+A and Ctrl+E, as readline binds them, and Ctrl+Z.
const LINE_KEYS = ['l', 'r', 'a', 'e', 'z'];

// Tab completes names, so Escape hands Tab back to the page for keyboard users.
function commandAction(t, event) {
  const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
  const noSelection = t.input.selectionStart === t.input.selectionEnd;
  const key = event.key;
  let action = null;
  if (key === 'Escape') t.tabLeaves = true;
  else if (ctrl && key.toLowerCase() === 'c' && noSelection) action = ACTIONS['C-c'];
  else if (ctrl && LINE_KEYS.includes(key.toLowerCase())) action = ACTIONS[`C-${key.toLowerCase()}`];
  else if (key === 'Tab' && !event.shiftKey && !t.tabLeaves) action = ACTIONS.Tab;
  else if (!ctrl) action = { Enter: ACTIONS.Enter, ArrowUp: ACTIONS.Up, ArrowDown: ACTIONS.Down }[key] ?? null;
  return action;
}

function actionFor(t, event) {
  let action = commandAction;
  if (t.asking && event.key !== 'Escape') action = askingAction;
  else if (t.search) action = searchAction;
  return action(t, event);
}

const PROBE = '0123456789';

function measureColumns(t) {
  const probe = document.createElement('span');
  probe.textContent = PROBE;
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
  t.screen.append(probe);
  const glyph = probe.getBoundingClientRect().width / PROBE.length;
  probe.remove();
  const style = getComputedStyle(t.screen);
  const pane = t.screen.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return columnsFor(pane, glyph);
}

// Like a real terminal, tell the shell its width when it changes; in the line queue so it never overlaps a run.
function watchWidth(t) {
  const update = () => {
    const columns = measureColumns(t);
    if (columns === t.columns) return;
    t.columns = columns;
    t.queue.add(() => t.onResize(columns));
  };
  new ResizeObserver(update).observe(t.screen);
  document.fonts.ready.then(update);
}

function wire(t, root) {
  t.input.addEventListener('focus', () => { t.tabLeaves = false; });
  t.input.addEventListener('input', () => {
    hide(t, t.input.value);
    if (t.search) searchInput(t);
  });
  t.input.addEventListener('keydown', event => {
    const action = actionFor(t, event);
    if (!action) {
      if (event.key.length === 1 && !event.ctrlKey) t.onKey();
      return;
    }
    event.preventDefault();
    action(t);
  });
  t.screen.addEventListener('click', () => {
    if (!getSelection().toString()) t.input.focus();
  });
  root.querySelector('#keys').addEventListener('click', event => {
    const key = event.target.closest('button')?.dataset.k;
    if (!key) return;
    if (t.asking) askingKey(t, key);
    else if (t.search) searchKey(t, key);
    else if (ACTIONS[key]) ACTIONS[key](t);
    else t.input.value += key === '|' || key === '>' ? ` ${key} ` : key;
    t.input.focus();
  });
}

/**
 * Wire the terminal pane: output, the input line, history, Tab completion,
 * Ctrl+C, Ctrl+L, Ctrl+A, Ctrl+E, Ctrl+R (bash's reverse-i-search, in
 * #searchTail after the input) and the touch key row. `ask({prompt, hidden})` reads one
 * line for a program (sudo's password) instead of a command: the prompt
 * replaces the shell prompt, hidden input shows nothing and is labelled
 * "password", and the line goes to onAnswer, not to history (Ctrl+C sends null).
 * `abandon()` ends such a prompt without an answer, for when the session
 * dropped the waiting line (a chapter loaded a new world).
 *
 * @param {object} opts
 * @param {HTMLElement} opts.root The terminal section holding #out, #screen, #cmd, #prompt, #searchTail, #termTitle, #keys,
 *   and #busy and #runNote (the busy mark and task strip note while a command runs).
 * @param {{add: (step: () => unknown) => Promise<unknown>}} opts.queue The page's one ordered queue: lines,
 *   Tab completions and resizes wait their turn in it, behind any other session call.
 * @param {(line: string) => Promise<void>} opts.onSubmit Runs a line the player entered.
 * @param {(text: string|null) => Promise<void>} [opts.onAnswer] Sends the line typed at an ask() prompt, or null for Ctrl+C.
 * @param {(name: 'INT'|'TSTP') => unknown} [opts.onSignal] Sends Ctrl+C or Ctrl+Z to a running command: after
 *   `running(true)` the prompt hides and those keys go here (src/ui/running.js), until `running(false)`.
 * @param {(line: string) => Promise<{line: string, candidates: string[]}>} opts.onComplete Tab completion.
 * @param {() => void} [opts.onKey] Called on each printable key (the key click sound).
 * @param {(columns: number) => unknown} [opts.onResize] Told the width in characters at the start and when it changes.
 * @returns {{print: Function, printLine: Function, setPrompt: Function, insert: Function, focus: Function, clear: Function, ask: Function, abandon: Function}}
 *   The terminal's controls.
 */
export function createTerminal({ root, queue, onSubmit, onComplete, onAnswer = async () => {}, onSignal = () => {}, onKey = () => {}, onResize = () => {} }) {
  const t = {
    out: root.querySelector('#out'),
    screen: root.querySelector('#screen'),
    input: root.querySelector('#cmd'),
    promptEl: root.querySelector('#prompt'),
    title: root.querySelector('#termTitle'),
    tail: root.querySelector('#searchTail'),
    history: createHistory(),
    prompt: null,
    queue,
    tabLeaves: false,
    onSubmit,
    onComplete,
    onAnswer,
    asking: null,
    search: null,
    onKey,
    onResize,
    columns: 0,
  };
  const running = wireRunning({
    input: t.input, promptEl: t.promptEl, keys: root.querySelector('#keys'), busy: root.querySelector('#busy'), note: root.querySelector('#runNote'),
  }, onSignal);
  wire(t, root);
  watchWidth(t);
  return {
    running: on => running.set(on),
    print: chunks => print(t, chunks),
    printLine: (text, cls) => printLine(t, text, cls),
    setPrompt: prompt => setPrompt(t, prompt),
    insert: text => insert(t, text),
    focus: () => t.input.focus(),
    clear: () => t.out.replaceChildren(),
    ask: request => ask(t, request),
    abandon: () => abandon(t),
  };
}
