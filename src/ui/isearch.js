/**
 * Reverse incremental history search, bash's Ctrl+R (readline's
 * reverse-search-history), as plain state: the terminal draws it and decides
 * what the keys do. Each typed letter searches again from the match on show,
 * leftwards through that line and then through older lines; Ctrl+R moves on
 * to the next older match. A failed search remembers no position, so like
 * readline it stays failed until letters are taken back and an older line
 * matches. Checked against bash 5.2.21 (docs/verification/terminal-keys.md).
 */

/**
 * @typedef {object} SearchState
 * @property {string[]} lines The history, oldest first, then the line being typed.
 * @property {string} query The search string typed so far.
 * @property {number} shown The index in `lines` of the line on show.
 * @property {number} cursor Where the match on show starts in that line (or the cursor, before any match).
 * @property {boolean} failed The last search found nothing.
 * @property {number} start The cursor's place in the line being typed when the search began.
 */

/**
 * Start a search, as Ctrl+R does.
 *
 * @param {string[]} entries The history, oldest first.
 * @param {string} line The line being typed.
 * @param {number} cursor The cursor's place in it.
 * @returns {SearchState} The state, showing the line being typed.
 */
export function startSearch(entries, line, cursor) {
  const lines = [...entries, line];
  return { lines, query: '', shown: lines.length - 1, cursor, failed: false, start: cursor };
}

// The newest match at or left of `from` in line `index`, then in older lines from
// their end. An older line equal to the one on show is passed over.
function find({ lines, shown }, query, index, from) {
  let hit = null;
  for (let i = index; i >= 0 && !hit; i--) {
    const start = i === index ? from : lines[i].length;
    const same = i !== index && lines[i] === lines[shown];
    // lastIndexOf reads a negative start as 0, so a start left of the line is checked first.
    const at = start < 0 || same ? -1 : lines[i].lastIndexOf(query, start);
    if (at >= 0) hit = { shown: i, cursor: at };
  }
  return hit;
}

function search(state, query, from) {
  const hit = find(state, query, state.shown, from);
  return hit ? { ...state, query, ...hit, failed: false } : { ...state, query, failed: true };
}

// The search goes on from the match on show; after a failure there is no position left in it.
const here = state => (state.failed ? -1 : state.cursor);

function again(state, query) {
  return query ? search(state, query, here(state)) : { ...state, query };
}

/**
 * Add typed text to the search string, one letter at a time as if typed.
 *
 * @param {SearchState} state The search.
 * @param {string} text The text typed.
 * @returns {SearchState} The new state.
 */
export function typeText(state, text) {
  return [...text].reduce((next, letter) => again(next, next.query + letter), state);
}

/**
 * Find the next older match of the same string, as Ctrl+R again does.
 *
 * @param {SearchState} state The search.
 * @returns {SearchState} The new state; unchanged while the string is empty.
 */
export function searchOlder(state) {
  return state.query ? search(state, state.query, here(state) - 1) : state;
}

/**
 * Take the last letter off the search string and search again from the match on show.
 *
 * @param {SearchState} state The search.
 * @returns {SearchState} The new state; unchanged while the string is empty.
 */
export function backspace(state) {
  return state.query ? again(state, state.query.slice(0, -1)) : state;
}

/**
 * What the terminal shows: bash's search prompt, the line, and the match to highlight.
 *
 * @param {SearchState} state The search.
 * @returns {{prompt: string, line: string, match: {start: number, end: number}|null, cursor: number, failed: boolean}}
 *   `match` is null before anything is found and after a failure, when bash shows the line plain.
 */
export function searchView({ lines, query, shown, cursor, failed }) {
  const match = query && !failed ? { start: cursor, end: cursor + query.length } : null;
  return { prompt: `(${failed ? 'failed ' : ''}reverse-i-search)\`${query}': `, line: lines[shown], match, cursor, failed };
}
