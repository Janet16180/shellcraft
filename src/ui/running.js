/**
 * The terminal while a command runs in the foreground (`sleep 5`, `fg`): no
 * prompt, no new line, and Ctrl+C or Ctrl+Z goes to the command as SIGINT or
 * SIGTSTP, as a real terminal sends them. Letters may be typed ahead; they
 * wait in the input for the prompt. The other Ctrl keys (Ctrl+L, Ctrl+R...)
 * wait too, but paste and cut work.
 *
 * A beginner must see that the terminal is busy, not broken: a small busy
 * mark stands where the prompt was, a line in the task strip says which keys
 * stop the command, and the input's label says it to screen readers.
 *
 * It listens before the terminal's own key handling (src/ui/terminal.js) and
 * keeps the keys it takes from it, so the terminal needs no running state.
 */

const HELD = new Set(['Enter', 'Tab', 'ArrowUp', 'ArrowDown']);
// The browser's own paste and cut still work in the input.
const CLIPBOARD = new Set(['v', 'x']);
const TOUCH_SIGNALS = { 'C-c': 'INT', 'C-z': 'TSTP' };
const NOTE_HTML = 'Running&hellip; <kbd>Ctrl+C</kbd> stops it, <kbd>Ctrl+Z</kbd> pauses it.';
const RUNNING_LABEL = 'A command is running. Ctrl+C stops it, Ctrl+Z pauses it. Letters you type wait for the prompt.';

/**
 * @param {{key: string, ctrlKey: boolean, altKey: boolean, metaKey: boolean}} event A keydown.
 * @returns {'INT'|'TSTP'|null} The signal the key sends to a running command, if any.
 */
export function runningKey(event) {
  const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
  const key = event.key.toLowerCase();
  let signal = null;
  if (ctrl && key === 'c') signal = 'INT';
  else if (ctrl && key === 'z') signal = 'TSTP';
  return signal;
}

function take(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/**
 * Wire the running state. Call it before the terminal adds its own listeners.
 *
 * @param {{input: HTMLInputElement, promptEl: HTMLElement, keys: HTMLElement, busy: HTMLElement, note: HTMLElement}} parts
 *   The input line, the prompt before it, the touch key row (buttons with `data-k`), the busy mark
 *   shown in the prompt's place and the note line in the task strip (both hidden at first).
 * @param {(name: 'INT'|'TSTP') => void} onSignal Sends a signal to the running command.
 * @returns {{set: (on: boolean) => void}} Switches the running state on (a command runs) or off.
 */
export function wireRunning({ input, promptEl, keys, busy, note }, onSignal) {
  let on = false;
  let label = input.getAttribute('aria-label');
  input.addEventListener('keydown', event => {
    if (!on) return;
    const signal = runningKey(event);
    const lineKey = event.ctrlKey && !CLIPBOARD.has(event.key.toLowerCase());
    if (signal || HELD.has(event.key) || lineKey) take(event);
    if (signal) onSignal(signal);
  });
  keys.addEventListener('click', event => {
    const key = on ? event.target.closest('button')?.dataset.k : undefined;
    if (key === undefined) return;
    take(event);
    if (Object.hasOwn(TOUCH_SIGNALS, key)) onSignal(TOUCH_SIGNALS[key]);
    input.focus();
  });
  return {
    set: running => {
      if (running === on) return;
      on = running;
      if (running) label = input.getAttribute('aria-label');
      input.setAttribute('aria-label', running ? RUNNING_LABEL : label);
      promptEl.hidden = running;
      busy.hidden = !running;
      note.hidden = !running;
      note.innerHTML = running ? NOTE_HTML : '';
    },
  };
}
