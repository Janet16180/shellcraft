/**
 * What one simulated command returns to the executor.
 *
 * `out` and `err` are the text written to standard output and error, `html`
 * an optional coloured version of `out`, and `note` an explanation where the
 * simulation differs from a real terminal.
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
