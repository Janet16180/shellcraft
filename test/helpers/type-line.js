/**
 * Type a scripted line the way a player would. In `solve` lines a literal tab
 * character means "press Tab here": the text typed so far is completed, then
 * typing continues after the completion.
 *
 * @template T
 * @param {string} line The scripted line, such as 'cd fo\t'.
 * @param {{complete: (line: string) => Promise<{line: string}>, submit: (line: string) => Promise<T>}} keys
 *   Tab completion and Enter: session.complete and session.submit, or a backend's complete and run.
 * @returns {Promise<T>} What submit returned for the final line.
 */
export async function typeLine(line, { complete, submit }) {
  const [first, ...rest] = line.split('\t');
  let typed = first;
  for (const part of rest) typed = (await complete(typed)).line + part;
  return submit(typed);
}
