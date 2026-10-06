/**
 * Splitting a typed line into tokens, the way bash reads it.
 *
 * A word token is `{type: 'word', parts, raw}`. Its parts are kept unexpanded
 * so that `$VAR`, `~` and `$(...)` are expanded when the command runs, after
 * the commands before it on the line:
 *   `{lit, q}`   literal text, q true when quoted (no globbing or splitting)
 *   `{var, q}`   a parameter: a name, or one of `? $ # 0`
 *   `{cmd, q}`   a command substitution, with the inner line
 *   `{tilde}`    a leading `~` or `~user`
 * Operators are `{type: 'op', op}` and redirections `{type: 'redir', op, fd}`.
 * A line with an unclosed quote is an expected mistake, so tokenize returns
 * the message bash prints instead of raising.
 */

const OPERATORS = ['&>>', '&>', '||', '|', '&&', '&', ';', '(', ')'];
const REDIRECTS = ['>>', '>&', '>|', '<<<', '<<', '<&', '<>', '>', '<'];
const METACHARS = ' \t|&;()<>';
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SPECIAL = /^[?$#0-9!@*-]/;
const unclosed = c => `bash: unexpected EOF while looking for matching \`${c}'`;

function closingParen(line, start) {
  let depth = 1;
  let i = start;
  let quote = null;
  while (i < line.length && depth > 0) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"') i++;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '\\') i++;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

function scanDollar(line, i, q) {
  const rest = line.slice(i + 1);
  const braced = /^\{([A-Za-z_][A-Za-z0-9_]*|[?$#0-9])\}/.exec(rest);
  const name = NAME.exec(rest) ?? SPECIAL.exec(rest);
  let scan = { part: { lit: '$', q }, end: i + 1, error: null };
  if (rest.startsWith('(') && !rest.startsWith('((')) {
    const close = closingParen(line, i + 2);
    scan = close < 0 ? { ...scan, error: unclosed(')') } : { part: { cmd: line.slice(i + 2, close), q }, end: close + 1, error: null };
  } else if (braced) scan = { part: { var: braced[1], q }, end: i + 1 + braced[0].length, error: null };
  else if (name) scan = { part: { var: name[0], q }, end: i + 1 + name[0].length, error: null };
  return scan;
}

function scanBacktick(line, i, q) {
  const close = line.indexOf('`', i + 1);
  return close < 0 ? { error: unclosed('`') } : { part: { cmd: line.slice(i + 1, close), q }, end: close + 1, error: null };
}

function scanDouble(line, start) {
  const parts = [];
  let i = start;
  let error = null;
  while (i < line.length && line[i] !== '"' && !error) {
    const c = line[i];
    let scan;
    if (c === '\\' && '$`"\\'.includes(line[i + 1] ?? '')) scan = { part: { lit: line[i + 1], q: true }, end: i + 2 };
    else if (c === '$') scan = scanDollar(line, i, true);
    else if (c === '`') scan = scanBacktick(line, i, true);
    else scan = { part: { lit: c, q: true }, end: i + 1 };
    error = scan.error ?? null;
    if (!error) parts.push(scan.part);
    i = scan.end;
  }
  if (!error && i >= line.length) error = unclosed('"');
  if (!error && !parts.length) parts.push({ lit: '', q: true });
  return { parts, end: i + 1, error };
}

function scanWordPart(line, i, atStart) {
  const c = line[i];
  let scan;
  if (c === "'") {
    const close = line.indexOf("'", i + 1);
    scan = close < 0 ? { error: unclosed("'") } : { parts: [{ lit: line.slice(i + 1, close), q: true }], end: close + 1 };
  } else if (c === '"') scan = scanDouble(line, i + 1);
  else if (c === '\\') scan = i + 1 < line.length ? { parts: [{ lit: line[i + 1], q: true }], end: i + 2 } : { parts: [], end: i + 1 };
  else if (c === '$') {
    const d = scanDollar(line, i, false);
    scan = { parts: d.part ? [d.part] : [], end: d.end, error: d.error };
  } else if (c === '`') {
    const b = scanBacktick(line, i, false);
    scan = { parts: b.part ? [b.part] : [], end: b.end, error: b.error };
  } else if (c === '~' && atStart) {
    const user = /^~([A-Za-z_][A-Za-z0-9_-]*)?(?=$|[/\s|&;<>()])/.exec(line.slice(i));
    scan = user ? { parts: [{ tilde: user[1] ?? '' }], end: i + user[0].length } : { parts: [{ lit: c, q: false }], end: i + 1 };
  } else scan = { parts: [{ lit: c, q: false }], end: i + 1 };
  return { parts: scan.parts ?? [], end: scan.end, error: scan.error ?? null };
}

function mergeLiterals(parts) {
  const merged = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if ('lit' in p && last && 'lit' in last && last.q === p.q) last.lit += p.lit;
    else merged.push({ ...p });
  }
  return merged;
}

const onlyDigits = word => word.parts.length > 0 && word.parts.every(p => 'lit' in p && !p.q && /^\d+$/.test(p.lit));

/**
 * Split a line into word, operator and redirection tokens.
 *
 * @param {string} line The typed line.
 * @returns {{tokens: object[], error: string|null}} The tokens, or the error
 *   bash prints when the line ends inside a quote or substitution.
 */
export function tokenize(line) {
  const tokens = [];
  let word = null;
  let error = null;
  let i = 0;
  const finish = end => {
    if (word) tokens.push({ type: 'word', parts: mergeLiterals(word.parts), raw: line.slice(word.start, end) });
    word = null;
  };
  while (i < line.length && !error) {
    const c = line[i];
    const op = METACHARS.includes(c) ? OPERATORS.find(o => line.startsWith(o, i)) : null;
    const redir = '<>'.includes(c) ? REDIRECTS.find(r => line.startsWith(r, i)) : null;
    if (c === ' ' || c === '\t') { finish(i); i++; continue; }
    if (c === '#' && !word) break;
    if (redir || op) {
      const fd = redir && word && onlyDigits(word) ? Number(word.parts.map(p => p.lit).join('')) : null;
      if (fd !== null) word = null;
      finish(i);
      tokens.push(redir ? { type: 'redir', op: redir, fd } : (op.startsWith('&>') ? { type: 'redir', op, fd: null } : { type: 'op', op }));
      i += (redir ?? op).length;
      continue;
    }
    word ??= { parts: [], start: i };
    const scan = scanWordPart(line, i, i === word.start);
    error = scan.error;
    word.parts.push(...scan.parts);
    i = scan.end;
  }
  if (!error) finish(i);
  return { tokens: error ? [] : tokens, error };
}
