/**
 * The terminal while a command runs in the foreground (`sleep 5`, `fg`): no
 * prompt, no new line, and Ctrl+C or Ctrl+Z goes to the command as SIGINT or
 * SIGTSTP, as a real terminal sends them. Letters may be typed ahead; they
 * wait in the input for the prompt. The other Ctrl keys (Ctrl+L, Ctrl+R...)
 * wait too, but paste and cut work.
 *
 * It listens before the terminal's own key handling (src/ui/terminal.js) and
 * keeps the keys it takes from it, so the terminal needs no running state.
 */

const HELD = new Set(['Enter', 'Tab', 'ArrowUp', 'ArrowDown']);
// The browser's own paste and cut still work in the input.
const CLIPBOARD = new Set(['v', 'x']);
const TOUCH_SIGNALS = { 'C-c': 'INT', 'C-z': 'TSTP' };

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
 * @param {{input: HTMLInputElement, promptEl: HTMLElement, keys: HTMLElement}} parts The input line,
 *   the prompt before it and the touch key row (buttons with `data-k`).
 * @param {(name: 'INT'|'TSTP') => void} onSignal Sends a signal to the running command.
 * @returns {{set: (on: boolean) => void}} Switches the running state on (a command runs) or off.
 */
export function wireRunning({ input, promptEl, keys }, onSignal) {
  let on = false;
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
      on = running;
      promptEl.hidden = running;
    },
  };
}
