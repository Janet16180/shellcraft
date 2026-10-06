/**
 * POSIX regular expressions as GNU grep reads them, translated to
 * JavaScript. Basic expressions (BRE) treat `+ ? | ( ) { }` as literal and
 * accept GNU's `\+ \? \| \( \) \{ \}`; extended ones (ERE) use them directly.
 * Malformed patterns give GNU grep's messages.
 */

const WORD = 'A-Za-z0-9_';
const CLASSES = {
  alpha: 'A-Za-z', digit: '0-9', alnum: '0-9A-Za-z', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f\\x7f', print: ' -~', graph: '!-~',
};
const ESCAPED = { '<': `\\b(?=[${WORD}])`, '>': `\\b(?<=[${WORD}])`, b: '\\b', B: '\\B', w: `[${WORD}]`, W: `[^${WORD}]`, s: '\\s', S: '\\S', '`': '^', "'": '$' };
const UNMATCHED_BRACKET = 'Unmatched [, [^, [:, [., or [=';
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const escapeClass = s => s.replace(/[\]\\[^-]/g, '\\$&');

function bracket(p, i) {
  let j = i + 1;
  const negate = p[j] === '^';
  if (negate) j++;
  let items = '';
  let first = true;
  let error = null;
  let end = -1;
  while (j < p.length && end < 0 && !error) {
    const c = p[j];
    const kind = c === '[' ? p[j + 1] : null;
    const close = kind && ':=.'.includes(kind) ? p.indexOf(`${kind}]`, j + 2) : -1;
    if (c === ']' && !first) end = j + 1;
    else if (kind && ':=.'.includes(kind) && close < 0) error = UNMATCHED_BRACKET;
    else if (kind === ':') {
      const cls = CLASSES[p.slice(j + 2, close)];
      if (cls) items += cls;
      else error = 'Invalid character class name';
      j = close + 2;
    } else if (kind === '=' || kind === '.') {
      items += escapeClass(p.slice(j + 2, close));
      j = close + 2;
    } else if (p[j + 1] === '-' && j + 2 < p.length && p[j + 2] !== ']') {
      if (p.codePointAt(j + 2) < p.codePointAt(j)) error = 'Invalid range end';
      items += `${escapeClass(c)}-${escapeClass(p[j + 2])}`;
      j += 3;
    } else {
      items += escapeClass(c);
      j++;
    }
    first = false;
  }
  if (!error && end < 0) error = i === p.length - 1 ? 'Invalid regular expression' : UNMATCHED_BRACKET;
  return { source: `[${negate ? '^' : ''}${items}]`, end, error };
}

function interval(p, i, ere) {
  const close = ere ? p.indexOf('}', i) : p.indexOf('\\}', i);
  const body = close < 0 ? null : p.slice(i, close);
  const m = body === null ? null : /^(\d*)(,?)(\d*)$/.exec(body);
  const valid = m && (m[1] !== '' || m[2] !== '');
  const lo = valid ? Number(m[1] || 0) : 0;
  const hi = valid && m[3] !== '' ? Number(m[3]) : null;
  let r;
  if (ere && !valid) r = { literal: true };
  else if (close < 0) r = { error: 'Unmatched \\{' };
  else if (!valid || (hi !== null && hi < lo)) r = { error: 'Invalid content of \\{\\}' };
  else r = { source: m[2] ? `{${lo},${hi ?? ''}}` : `{${lo}}`, end: close + (ere ? 1 : 2) };
  return r;
}

function special(p, i, ere) {
  const c = p[i];
  const escaped = c === '\\';
  const n = p[i + 1];
  let kind = null;
  if (ere && !escaped && '()|+?{'.includes(c)) kind = c;
  else if (!ere && escaped && n !== undefined && '()|+?{'.includes(n)) kind = n;
  return { kind, width: escaped ? 2 : 1 };
}

function translate(p, ere) {
  const st = { out: '', start: true, quantified: false, open: 0, groups: 0, error: null, warning: null };
  const atom = (text, quantifiable = true) => {
    st.out += text;
    st.start = false;
    st.quantified = false;
    st.canQuantify = quantifiable;
  };
  const quantifier = (text, name) => {
    if (st.start && ere) st.warning ??= `${name} at start of expression`;
    else if (st.start) atom(escapeRe(name));
    else if (!st.quantified) { st.out += text; st.quantified = true; }
  };
  let i = 0;
  while (i < p.length && !st.error) {
    const c = p[i];
    const { kind, width } = special(p, i, ere);
    if (kind === '(') { st.out += '('; st.open++; st.start = true; i += width; }
    else if (kind === ')' || (!ere && c === '\\' && p[i + 1] === ')')) {
      if (st.open === 0 && !ere) st.error = 'Unmatched ) or \\)';
      else if (st.open === 0) atom('\\)');
      else { st.open--; st.groups++; atom(')'); }
      i += width;
    } else if (kind === '|') { st.out += '|'; st.start = true; i += width; }
    else if (kind === '+' || kind === '?') { quantifier(kind, kind); i += width; }
    else if (kind === '{') {
      const iv = st.start ? { literal: true } : interval(p, i + width, ere);
      if (iv.error) st.error = iv.error;
      else if (iv.literal) { atom('\\{'); i += width; }
      else { if (!st.quantified) st.out += iv.source; st.quantified = true; i = iv.end; }
    } else if (c === '\\') {
      const n = p[i + 1];
      if (n === undefined) st.error = 'Trailing backslash';
      else if (n >= '1' && n <= '9' && Number(n) > st.groups) st.error = 'Invalid back reference';
      else if (n >= '1' && n <= '9') atom(`\\${n}`);
      else atom(ESCAPED[n] ?? escapeRe(n));
      i += 2;
    } else if (c === '[') {
      const br = bracket(p, i);
      if (br.error) st.error = br.error;
      else { atom(br.source); i = br.end; }
    } else if (c === '*') { quantifier('*', '*'); i++; }
    else if (c === '^') {
      const anchor = ere || st.start;
      st.out += anchor ? '^' : '\\^';
      if (!anchor) st.start = false;
      i++;
    } else if (c === '$') {
      const rest = p.slice(i + 1);
      st.out += ere || rest === '' || rest.startsWith('\\)') || rest.startsWith('\\|') ? '$' : '\\$';
      st.start = false;
      i++;
    } else { atom(c === '.' ? '.' : escapeRe(c)); i++; }
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
