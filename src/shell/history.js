/**
 * History expansion, which bash does on each line typed at an interactive
 * prompt before anything else: `!!`, `!N`, `!-N`, `!string`, `!?string?`,
 * and the word designators `:N`, `:^`, `:$`, `:*` (also `!^`, `!$`, `!*`).
 * Modifiers such as `:p` or `:s/a/b/` are not simulated.
 */

const LITERAL_AFTER = new Set([undefined, ' ', '\t', '\n', '=', '(']);
const SEARCH_END = /[\s;&|<>()]/;
const OPERATOR = /^(?:&&|\|\||;;|>>|<<|[;&|<>()])/;

function wordEnd(line, start) {
  let j = start;
  while (j < line.length && !/\s/.test(line[j]) && !OPERATOR.test(line.slice(j))) {
    const q = line[j];
    if (q === '\\') j += 2;
    else if (q === "'" || q === '"') j = line.includes(q, j + 1) ? line.indexOf(q, j + 1) + 1 : line.length;
    else j++;
  }
  return j;
}

// The words of a line as history sees them: blanks split, quotes hold, operators stand alone.
function historyWords(line) {
  const words = [];
  let i = 0;
  while (i < line.length) {
    if (/\s/.test(line[i])) i++;
    else if (OPERATOR.test(line.slice(i))) {
      const op = OPERATOR.exec(line.slice(i))[0];
      words.push(op);
      i += op.length;
    } else {
      const j = wordEnd(line, i);
      words.push(line.slice(i, j));
      i = j;
    }
  }
  return words;
}

function numberedEvent(history, digits, i) {
  const n = Number(digits);
  const index = n < 0 ? history.length + n : n - 1;
  return { text: index >= 0 ? history[index] ?? null : null, end: i + 1 + digits.length };
}

function containingEvent(history, rest, i) {
  const close = rest.indexOf('?', 1);
  const wanted = rest.slice(1, close < 0 ? undefined : close);
  return { text: wanted ? history.findLast(h => h.includes(wanted)) ?? null : null, end: i + 2 + wanted.length + (close < 0 ? 0 : 1) };
}

function startingEvent(history, rest, i, inDouble) {
  let n = 0;
  while (n < rest.length && !SEARCH_END.test(rest[n]) && rest[n] !== ':' && !(inDouble && rest[n] === '"')) n++;
  const wanted = rest.slice(0, n);
  return { text: wanted ? history.findLast(h => h.startsWith(wanted)) ?? null : null, end: i + 1 + n };
}

// The event a `!` at i names: the line (null if there is none), and where its text ends.
function findEvent(line, i, history, inDouble) {
  const rest = line.slice(i + 1);
  const digits = /^-?\d+/.exec(rest);
  let event;
  if (rest[0] === '!') event = { text: history.at(-1) ?? null, end: i + 2 };
  else if ('$^*:'.includes(rest[0])) event = { text: history.at(-1) ?? null, end: i + 1, short: true };
  else if (digits) event = numberedEvent(history, digits[0], i);
  else if (rest[0] === '?') event = containingEvent(history, rest, i);
  else event = startingEvent(history, rest, i, inDouble);
  return event;
}

// A word designator after the event: `:1`, `:$`, `:^`, `:*`, or `$ ^ *` right after `!`.
function designate(line, event) {
  const at = event.end;
  const m = event.short ? /^:?(\d+|[$^*])/.exec(line.slice(at)) : /^:(\d+|[$^*])/.exec(line.slice(at));
  if (!m) return { text: event.text, end: at, error: null };
  const words = historyWords(event.text);
  const spec = m[1];
  let picked;
  if (spec === '$') picked = words.at(-1);
  else if (spec === '^') picked = words[1];
  else if (spec === '*') picked = words.slice(1).join(' ');
  else picked = words[Number(spec)];
  const error = picked === undefined ? `bash: :${spec}: bad word specifier` : null;
  return { text: picked ?? null, end: at + m[0].length, error };
}

// Besides the characters after it, bash leaves `$!`, `${!name}` and a `[!...]` pattern alone.
function literalBang(line, i, inDouble) {
  const next = line[i + 1];
  const bracket = line[i - 1] === '[' && line.includes(']', i + 1);
  return LITERAL_AFTER.has(next) || (inDouble && next === '"') || line[i - 1] === '$' || line.slice(i - 2, i) === '${' || bracket;
}

/**
 * Expand history events in a typed line, as interactive bash does.
 *
 * @param {string} line The typed line.
 * @param {string[]} history The lines remembered so far, oldest first.
 * @returns {{line: string|null, expanded: boolean, error: string|null}} The line
 *   to run, whether an event was replaced (bash then echoes the line), or the
 *   message for an event that is not there (and nothing runs).
 */
export function expandHistory(line, history) {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let expanded = false;
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '\\' && !inSingle) {
      out += line.slice(i, i + 2);
      i += 2;
    } else if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      out += c;
      i++;
    } else if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      out += c;
      i++;
    } else if (c !== '!' || inSingle || literalBang(line, i, inDouble)) {
      out += c;
      i++;
    } else {
      const event = findEvent(line, i, history, inDouble);
      if (event.text === null) return { line: null, expanded: false, error: `bash: ${line.slice(i, event.end)}: event not found` };
      const picked = designate(line, event);
      if (picked.error) return { line: null, expanded: false, error: picked.error };
      out += picked.text;
      expanded = true;
      i = picked.end;
    }
  }
  return { line: out, expanded, error: null };
}
