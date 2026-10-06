/**
 * POSIX regular expressions as GNU grep reads them, translated to
 * JavaScript. Basic expressions (BRE) treat `+ ? | ( ) { }` as literal and
 * accept GNU's `\+ \? \| \( \) \{ \}`; extended ones (ERE) use them directly.
 * Malformed patterns give GNU grep's messages.
 */

import { nameTable } from './table.js';

const WORD = 'A-Za-z0-9_';
const CLASSES = nameTable({
  alpha: 'A-Za-z', digit: '0-9', alnum: '0-9A-Za-z', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f\\x7f', print: ' -~', graph: '!-~',
});
const ESCAPED = { '<': `\\b(?=[${WORD}])`, '>': `\\b(?<=[${WORD}])`, b: '\\b', B: '\\B', w: `[${WORD}]`, W: `[^${WORD}]`, s: '\\s', S: '\\S', '`': '^', "'": '$' };
const UNMATCHED_BRACKET = 'Unmatched [, [^, [:, [., or [=';
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const escapeClass = s => s.replace(/[\]\\[^-]/g, '\\$&');

function namedItem(p, j, kind) {
  const close = p.indexOf(`${kind}]`, j + 2);
  const name = p.slice(j + 2, close);
  let item;
  if (close < 0) item = { error: UNMATCHED_BRACKET };
  else if (kind !== ':') item = { text: escapeClass(name), next: close + 2 };
  else if (CLASSES[name]) item = { text: CLASSES[name], next: close + 2 };
  else item = { error: 'Invalid character class name' };
  return item;
}

function bracketItem(p, j, first) {
  const c = p[j];
  const isRange = p[j + 1] === '-' && j + 2 < p.length && p[j + 2] !== ']';
  let item;
  if (c === ']' && !first) item = { done: true, next: j + 1 };
  else if (c === '[' && ':=.'.includes(p[j + 1] ?? '')) item = namedItem(p, j, p[j + 1]);
  else if (isRange && p.codePointAt(j + 2) < p.codePointAt(j)) item = { error: 'Invalid range end' };
  else if (isRange) item = { text: `${escapeClass(c)}-${escapeClass(p[j + 2])}`, next: j + 3 };
  else item = { text: escapeClass(c), next: j + 1 };
  return item;
}

function bracket(p, i) {
  const negate = p[i + 1] === '^';
  let j = i + (negate ? 2 : 1);
  let items = '';
  let item = {};
  for (let first = true; j < p.length && !item.done && !item.error; first = false) {
    item = bracketItem(p, j, first);
    items += item.text ?? '';
    j = item.next ?? j;
  }
  let error = item.error ?? null;
  if (!error && !item.done) error = i === p.length - 1 ? 'Invalid regular expression' : UNMATCHED_BRACKET;
  return { source: `[${negate ? '^' : ''}${items}]`, end: j, error };
}

function parseBounds(body) {
  const m = /^(\d*)(,?)(\d*)$/.exec(body);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  const lo = Number(m[1] || 0);
  const hi = m[3] === '' ? null : Number(m[3]);
  return { invalid: hi !== null && hi < lo, source: m[2] ? `{${lo},${hi ?? ''}}` : `{${lo}}` };
}

function interval(p, i, ere) {
  const close = ere ? p.indexOf('}', i) : p.indexOf('\\}', i);
  const bounds = close < 0 ? null : parseBounds(p.slice(i, close));
  let r;
  if (ere && !bounds) r = { literal: true };
  else if (close < 0) r = { error: 'Unmatched \\{' };
  else if (!bounds || bounds.invalid) r = { error: 'Invalid content of \\{\\}' };
  else r = { source: bounds.source, end: close + (ere ? 1 : 2) };
  return r;
}

function classify(p, i, ere) {
  const c = p[i];
  const n = p[i + 1];
  const op = ere ? c : (c === '\\' ? n : null);
  let tok;
  if (op !== null && op !== undefined && '()|+?{'.includes(op)) tok = { type: op, width: ere ? 1 : 2 };
  else if (c === '\\') tok = { type: 'escape', char: n, width: 2 };
  else if ('[*^$'.includes(c)) tok = { type: c, width: 1 };
  else tok = { type: 'char', char: c, width: 1 };
  return tok;
}

function atom(st, text) {
  st.out += text;
  st.start = false;
  st.quantified = false;
}

function quantify(st, text, name) {
  if (st.start && st.ere) st.warning ??= `${name} at start of expression`;
  else if (st.start) atom(st, escapeRe(name));
  else if (!st.quantified) { st.out += text; st.quantified = true; }
}

const HANDLERS = {
  '(': st => { st.out += '('; st.open++; st.start = true; },
  ')': st => {
    if (st.open === 0 && !st.ere) st.error = 'Unmatched ) or \\)';
    else if (st.open === 0) atom(st, '\\)');
    else { st.open--; st.groups++; atom(st, ')'); }
  },
  '|': st => { st.out += '|'; st.start = true; },
  '+': st => quantify(st, '+', '+'),
  '?': st => quantify(st, '?', '?'),
  '*': st => quantify(st, '*', '*'),
  '{': (st, p, i, tok) => {
    const iv = st.start ? { literal: true } : interval(p, i + tok.width, st.ere);
    if (iv.error) st.error = iv.error;
    else if (iv.literal) atom(st, '\\{');
    else if (!st.quantified) { st.out += iv.source; st.quantified = true; }
    return iv.end;
  },
  escape: (st, p, i, tok) => {
    const n = tok.char;
    const backref = n >= '1' && n <= '9';
    if (n === undefined) st.error = 'Trailing backslash';
    else if (backref && Number(n) > st.groups) st.error = 'Invalid back reference';
    else atom(st, backref ? `\\${n}` : ESCAPED[n] ?? escapeRe(n));
  },
  '[': (st, p, i) => {
    const br = bracket(p, i);
    if (br.error) st.error = br.error;
    else atom(st, br.source);
    return br.end;
  },
  '^': st => {
    const anchor = st.ere || st.start;
    st.out += anchor ? '^' : '\\^';
    st.start &&= anchor;
  },
  $: (st, p, i) => {
    const rest = p.slice(i + 1);
    st.out += st.ere || rest === '' || rest.startsWith('\\)') || rest.startsWith('\\|') ? '$' : '\\$';
    st.start = false;
  },
  char: (st, p, i, tok) => atom(st, tok.char === '.' ? '.' : escapeRe(tok.char)),
};

function translate(p, ere) {
  const st = { ere, out: '', start: true, quantified: false, open: 0, groups: 0, error: null, warning: null };
  let i = 0;
  while (i < p.length && !st.error) {
    const tok = classify(p, i, ere);
    const next = HANDLERS[tok.type](st, p, i, tok);
    i = next ?? i + tok.width;
  }
  if (!st.error && st.open > 0) st.error = 'Unmatched ( or \\(';
  return { source: st.out, error: st.error, warning: st.warning };
}

/**
 * Compile grep patterns into one regular expression.
 *
 * @param {string[]} patterns The patterns; a line matches if any of them matches.
 * @param {{extended?: boolean, fixed?: boolean, ignoreCase?: boolean, word?: boolean, line?: boolean}} [opts]
 *   -E, -F, -i, -w and -x.
 * @returns {{regex: RegExp|null, source: string, flags: string, error: string|null, warning: string|null}}
 *   The expression, or GNU grep's message for a malformed pattern (without the `grep: ` prefix).
 */
export function compilePosix(patterns, { extended = false, fixed = false, ignoreCase = false, word = false, line = false } = {}) {
  const parts = patterns.map(p => (fixed ? { source: escapeRe(p), error: null, warning: null } : translate(p, extended)));
  const failed = parts.find(p => p.error);
  let source = parts.map(p => `(?:${p.source})`).join('|');
  if (word) source = `(?<![${WORD}])(?:${source})(?![${WORD}])`;
  if (line) source = `^(?:${source})$`;
  const flags = ignoreCase ? 'i' : '';
  return {
    regex: failed ? null : new RegExp(source, flags),
    source, flags,
    error: failed ? failed.error : null,
    warning: parts.find(p => p.warning)?.warning ?? null,
  };
}
