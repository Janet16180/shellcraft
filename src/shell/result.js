/**
 * What one simulated command returns to the executor.
 *
 * `out` and `err` are the text written to standard output and error, `html`
 * an optional coloured version of `out`, and `note` an explanation where the
 * simulation differs from a real terminal. A command that writes both streams
 * in turn (cat over several files) also gives `chunks`, the same text in the
 * order it was written.
 */

/**
 * @typedef {{out: string, err: string, status: number, html: string|null, note: string|null}} Result
 */

/**
 * Build a command result.
 *
 * @param {string} [out] Standard output.
 * @param {string} [err] Standard error, one message per line, without the final newline.
 * @param {number} [status] Exit status.
 * @param {string|null} [html] Coloured markup for `out`.
 * @returns {Result} The result.
 */
export const result = (out = '', err = '', status = 0, html = null) => ({ out, err, status, html, note: null });

/**
 * Build a result from what a command wrote, in order: `cat a nope b` writes a's
 * text, then the error, then b's text.
 *
 * @param {{stream: 'out'|'err', text: string, html?: string}[]} chunks The writes;
 *   each error chunk ends with a newline. Give `html` on every out chunk or on none.
 * @param {number} status Exit status.
 * @returns {Result & {chunks: object[]}} The result, with `chunks`.
 */
export function ordered(chunks, status) {
  const kept = [];
  for (const c of chunks.filter(chunk => chunk.text)) {
    const last = kept.at(-1);
    if (last?.stream !== c.stream) kept.push({ ...c });
    else {
      const both = typeof c.html === 'string' && typeof last.html === 'string';
      last.text += c.text;
      if (both) last.html += c.html;
      else delete last.html;
    }
  }
  const outs = kept.filter(c => c.stream === 'out');
  const join = (list, key) => list.map(c => c[key]).join('');
  const html = outs.length && outs.every(c => typeof c.html === 'string') ? join(outs, 'html') : null;
  const err = join(kept.filter(c => c.stream === 'err'), 'text').replace(/\n$/, '');
  return { ...result(join(outs, 'text'), err, status, html), chunks: kept };
}

/**
 * @param {Result} r A result.
 * @param {string|null} note The explanation to attach.
 * @returns {Result} A copy of the result carrying the note.
 */
export const withNote = (r, note) => ({ ...r, note });

/**
 * The result of a filter given no file and no piped input. A real one would
 * wait for the keyboard; the simulator explains that instead.
 *
 * @param {string} name The command.
 * @returns {Result} An empty result with status 1 and an explanatory note.
 */
export const needInput = name => withNote(result('', '', 1),
  `${name} is waiting for keyboard input. In a real terminal, ${name} with no file reads what you type until you press Ctrl+D. Here, give it a file name or pipe something into it.`);
