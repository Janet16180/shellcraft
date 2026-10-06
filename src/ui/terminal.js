import { chunkLine, clears, columnsFor, displayPath, esc, promptHTML } from './output.js';
import { createHistory } from './history.js';

const MAX_LINES = 600;

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
  t.promptEl.innerHTML = promptHTML(prompt);
  t.title.textContent = `${prompt.user}@${prompt.host}: ${displayPath(prompt.cwd, prompt.home)}`;
}

function caretToEnd(t) {
  const end = t.input.value.length;
  t.input.setSelectionRange(end, end);
}

function insert(t, text) {
  t.input.value = text;
  t.input.focus();
  caretToEnd(t);
}

function submit(t) {
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
  echo(t, t.input.value, '^C');
  t.input.value = '';
}

function recall(t, direction) {
  t.input.value = direction < 0 ? t.history.up(t.input.value) : t.history.down();
  requestAnimationFrame(() => caretToEnd(t));
}

const ACTIONS = {
  Enter: submit,
  Tab: complete,
  Up: t => recall(t, -1),
  Down: t => recall(t, 1),
  'C-c': cancel,
  'C-l': t => t.out.replaceChildren(),
};

// Tab completes names, so Escape hands Tab back to the page for keyboard users.
function actionFor(t, event) {
  const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
  const noSelection = t.input.selectionStart === t.input.selectionEnd;
  const key = event.key;
  let action = null;
  if (key === 'Escape') t.tabLeaves = true;
  else if (ctrl && key.toLowerCase() === 'c' && noSelection) action = ACTIONS['C-c'];
  else if (ctrl && key.toLowerCase() === 'l') action = ACTIONS['C-l'];
  else if (key === 'Tab' && !event.shiftKey && !t.tabLeaves) action = ACTIONS.Tab;
  else if (!ctrl) action = { Enter: ACTIONS.Enter, ArrowUp: ACTIONS.Up, ArrowDown: ACTIONS.Down }[key] ?? null;
  return action;
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
    if (ACTIONS[key]) ACTIONS[key](t);
    else t.input.value += key === '|' || key === '>' ? ` ${key} ` : key;
    t.input.focus();
  });
}

/**
 * Wire the terminal pane: output, the input line, history, Tab completion,
 * Ctrl+C, Ctrl+L and the touch key row.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.root The terminal section holding #out, #screen, #cmd, #prompt, #termTitle and #keys.
 * @param {{add: (step: () => unknown) => Promise<unknown>}} opts.queue The page's one ordered queue: lines,
 *   Tab completions and resizes wait their turn in it, behind any other session call.
 * @param {(line: string) => Promise<void>} opts.onSubmit Runs a line the player entered.
 * @param {(line: string) => Promise<{line: string, candidates: string[]}>} opts.onComplete Tab completion.
 * @param {() => void} [opts.onKey] Called on each printable key (the key click sound).
 * @param {(columns: number) => unknown} [opts.onResize] Told the width in characters at the start and when it changes.
 * @returns {{print: Function, printLine: Function, setPrompt: Function, insert: Function, focus: Function, clear: Function}}
 *   The terminal's controls.
 */
export function createTerminal({ root, queue, onSubmit, onComplete, onKey = () => {}, onResize = () => {} }) {
  const t = {
    out: root.querySelector('#out'),
    screen: root.querySelector('#screen'),
    input: root.querySelector('#cmd'),
    promptEl: root.querySelector('#prompt'),
    title: root.querySelector('#termTitle'),
    history: createHistory(),
    prompt: null,
    queue,
    tabLeaves: false,
    onSubmit,
    onComplete,
    onKey,
    onResize,
    columns: 0,
  };
  wire(t, root);
  watchWidth(t);
  return {
    print: chunks => print(t, chunks),
    printLine: (text, cls) => printLine(t, text, cls),
    setPrompt: prompt => setPrompt(t, prompt),
    insert: text => insert(t, text),
    focus: () => t.input.focus(),
    clear: () => t.out.replaceChildren(),
  };
}
