const CONTROL_KEYS = Object.freeze({ '\u0003': 'ctrl-c', '\u001a': 'ctrl-z' });

/**
 * Type a scripted line the way a player would. In `solve` lines a literal tab
 * character means "press Tab here": the text typed so far is completed, then
 * typing continues after the completion. Ctrl+C (`\u0003`) and Ctrl+Z
 * (`\u001a`) written after the text are keys pressed, in order, while the
 * line runs: `'sleep 100\u001a'` starts `sleep 100` and stops it.
 *
 * @template T
 * @param {string} line The scripted line, such as 'cd fo\t'.
 * @param {{complete: (line: string) => Promise<{line: string}>, submit: (line: string, keys: string[]) => Promise<T>}} keys
 *   Tab completion and Enter: session.complete and session.submit, or a backend's complete and run.
 *   submit also gets the keys pressed while the line runs, `'ctrl-c'` or `'ctrl-z'`.
 * @returns {Promise<T>} What submit returned for the final line.
 */
export async function typeLine(line, { complete, submit }) {
  let end = line.length;
  while (end > 0 && Object.hasOwn(CONTROL_KEYS, line[end - 1])) end--;
  const [first, ...rest] = line.slice(0, end).split('\t');
  let typed = first;
  for (const part of rest) typed = (await complete(typed)).line + part;
  return submit(typed, [...line.slice(end)].map(key => CONTROL_KEYS[key]));
}

/** The signal each key the tests press sends to a running command. */
export const KEY_SIGNALS = Object.freeze({ 'ctrl-c': 'INT', 'ctrl-z': 'TSTP' });
