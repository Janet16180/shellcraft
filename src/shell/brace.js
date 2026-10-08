/**
 * Brace expansion, the first of bash's expansions: `a{b,c}d` and `{1..3}`
 * make several words out of one. It works on the word as typed, so quotes,
 * backslashes and `$...` keep their braces and commas literal; each word it
 * makes is read again by the lexer.
 */

const SEQUENCE = /^(?:(-?\d+)\.\.(-?\d+)|([A-Za-z])\.\.([A-Za-z]))(?:\.\.(-?\d+))?$/;

// Where the quoted or substituted text that starts at i ends (its last
// character), or i if the character there is plain.
function skipQuoted(s, i) {
  const c = s[i];
  let end = i;
  if (c === '\\') end = i + 1;
  else if (c === "'") end = s.indexOf("'", i + 1);
  else if (c === '"') {
    end = i + 1;
    while (end < s.length && s[end] !== '"') end += s[end] === '\\' ? 2 : 1;
  } else if (c === '`') end = s.indexOf('`', i + 1);
  else if (c === '$' && (s[i + 1] === '(' || s[i + 1] === '{')) end = matching(s, i + 1, s[i + 1], s[i + 1] === '(' ? ')' : '}');
  return end < 0 ? s.length : Math.min(end, s.length);
}

function matching(s, start, open, close) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const end = skipQuoted(s, i);
    if (end !== i) i = end;
    else if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  return -1;
}

// The braces that open at `start`: where they close and the top-level commas.
function braceAt(s, start) {
  const commas = [];
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const end = skipQuoted(s, i);
    if (end !== i) i = end;
    else if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return { close: i, commas };
    else if (s[i] === ',' && depth === 1) commas.push(i);
  }
  return null;
}

// A letter sequence can pass over punctuation; bash's quote removal then drops a backslash.
const escape = ch => {
  if (ch === '\\') return "''";
  return /\w/.test(ch) ? ch : `\\${ch}`;
};

function pad(n, width) {
  const digits = String(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  return sign + digits.padStart(width - sign.length, '0');
}

function sequence(text) {
  const m = SEQUENCE.exec(text);
  if (!m) return null;
  const letters = m[3] !== undefined;
  const [from, to] = letters ? [m[3].charCodeAt(0), m[4].charCodeAt(0)] : [Number(m[1]), Number(m[2])];
  const step = Math.abs(Number(m[5] ?? 1)) || 1;
  const padded = !letters && [m[1], m[2]].some(n => /^-?0\d/.test(n));
  const width = padded ? Math.max(m[1].length, m[2].length) : 0;
  const items = [];
  for (let n = from; from <= to ? n <= to : n >= to; n += from <= to ? step : -step) {
    items.push(letters ? escape(String.fromCharCode(n)) : pad(n, width));
  }
  return items;
}

/**
 * Expand the braces in a word as typed.
 *
 * @param {string} word The raw text of one word.
 * @returns {string[]} The raw texts of the words it makes, in bash's order
 *   (the word itself when no braces expand).
 */
export function braceExpand(word) {
  for (let i = 0; i < word.length; i++) {
    const end = skipQuoted(word, i);
    const brace = end === i && word[i] === '{' ? braceAt(word, i) : null;
    i = end;
    const inner = brace ? word.slice(i + 1, brace.close) : '';
    const bounds = brace ? [i, ...brace.commas, brace.close] : [];
    const alternatives = brace?.commas.length
      ? bounds.slice(1).flatMap((end, k) => braceExpand(word.slice(bounds[k] + 1, end)))
      : brace && sequence(inner);
    if (alternatives) {
      const after = braceExpand(word.slice(brace.close + 1));
      return alternatives.flatMap(a => after.map(rest => word.slice(0, i) + a + rest));
    }
  }
  return [word];
}
