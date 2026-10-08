/**
 * Splitting a typed line into tokens, the way bash reads it.
 *
 * A word token is `{type: 'word', parts, raw}`. Its parts are kept unexpanded
 * so that `$VAR`, `~` and `$(...)` are expanded when the command runs, after
 * the commands before it on the line:
 *   `{lit, q}`   literal text, q true when quoted (no globbing or splitting)
 *   `{var, q}`   a parameter: a name, a number, or one of `? $ # @ * -`
 *   `{var, q, op, pattern}` `${v#pat}`, `##`, `%` or `%%`, the pattern as typed;
 *                or op 'length' for `${#v}`
 *   `{cmd, q}`   a command substitution, with the inner line
 *   `{arith, q}` an arithmetic expansion `$(( ))`, with the expression
 *   `{tilde}`    a leading `~` or `~user`
 * Operators are `{type: 'op', op}`, a newline included (op '\n'), and
 * redirections `{type: 'redir', op, fd}`. Every token has the `line` (from 1)
 * it starts on, so a script's messages can name it.
 * Text with an unclosed quote is an expected mistake, so tokenize returns
 * the message bash prints instead of raising.
 */

const OPERATORS = ['&>>', '&>', '||', '|', '&&', '&', ';;', ';', '(', ')', '\n'];
const REDIRECTS = ['>>', '>&', '>|', '<<<', '<<', '<&', '<>', '>', '<'];
const METACHARS = ' \t\n|&;()<>';
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SPECIAL = /^[?$#0-9!@*-]/;
const unclosed = c => `unexpected EOF while looking for matching \`${c}'`;

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

// The `}` that closes a `${`, past quotes and backslashes in the pattern.
function closingBrace(line, start) {
  let quote = null;
  let i = start;
  for (; i < line.length && (quote || line[i] !== '}'); i++) {
    if (quote && line[i] === quote) quote = null;
    else if (!quote && (line[i] === "'" || line[i] === '"')) quote = line[i];
    else if (line[i] === '\\' && quote !== "'") i++;
  }
  return i < line.length ? i : -1;
}

// `${#v}`, and `${v#pat}` with the other prefix and suffix removals.
function scanBracedOp(line, i, q) {
  const rest = line.slice(i + 1);
  const length = /^\{#([A-Za-z_][A-Za-z0-9_]*|[0-9]+)\}/.exec(rest);
  if (length) return { part: { var: length[1], q, op: 'length' }, end: i + 1 + length[0].length, error: null };
  const trim = /^\{([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?$#!-])(##?|%%?)/.exec(rest);
  const close = trim ? closingBrace(line, i + 1 + trim[0].length) : -1;
  if (close < 0) return null;
  return { part: { var: trim[1], q, op: trim[2], pattern: line.slice(i + 1 + trim[0].length, close) }, end: close + 1, error: null };
}

function scanDollar(line, i, q) {
  const rest = line.slice(i + 1);
  const braced = /^\{([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?$#@*-])\}/.exec(rest);
  const name = NAME.exec(rest) ?? SPECIAL.exec(rest);
  let scan = { part: { lit: '$', q }, end: i + 1, error: null };
  const arithClose = rest.startsWith('((') ? closingParen(line, i + 2) : -1;
  if (rest.startsWith('((') && arithClose < 0) scan = { ...scan, error: unclosed('))') };
  else if (rest.startsWith('((') && line[arithClose - 1] === ')') scan = { part: { arith: line.slice(i + 3, arithClose - 1), q }, end: arithClose + 1, error: null };
  else if (rest.startsWith('(')) {
    const close = closingParen(line, i + 2);
    scan = close < 0 ? { ...scan, error: unclosed(')') } : { part: { cmd: line.slice(i + 2, close), q }, end: close + 1, error: null };
  } else if (braced) scan = { part: { var: braced[1], q }, end: i + 1 + braced[0].length, error: null };
  else if (rest.startsWith('{') && scanBracedOp(line, i, q)) scan = scanBracedOp(line, i, q);
  else if (name) scan = { part: { var: name[0], q }, end: i + 1 + name[0].length, error: null };
  return scan;
}

function scanBacktick(line, i, q) {
  const close = line.indexOf('`', i + 1);
  return close < 0 ? { error: unclosed('`') } : { part: { cmd: line.slice(i + 1, close), q }, end: close + 1, error: null };
}

// One part inside double quotes; a backslash before a newline is no part at all.
function scanQuotedPart(line, i) {
  const c = line[i];
  let scan = { part: { lit: c, q: true }, end: i + 1 };
  if (c === '\\' && line[i + 1] === '\n') scan = { end: i + 2 };
  else if (c === '\\' && '$`"\\'.includes(line[i + 1] ?? '')) scan = { part: { lit: line[i + 1], q: true }, end: i + 2 };
  else if (c === '$') scan = scanDollar(line, i, true);
  else if (c === '`') scan = scanBacktick(line, i, true);
  return scan;
}

function scanDouble(line, start) {
  const parts = [];
  let i = start;
  let error = null;
  while (i < line.length && line[i] !== '"' && !error) {
    const scan = scanQuotedPart(line, i);
    error = scan.error ?? null;
    if (!error && scan.part) parts.push(scan.part);
    i = scan.end;
  }
  if (!error && i >= line.length) error = unclosed('"');
  if (!error && !parts.length) parts.push({ lit: '', q: true });
  return { parts, end: i + 1, error };
}

const single = scan => ({ parts: scan.part ? [scan.part] : [], end: scan.end, error: scan.error });

function scanSingleQuoted(line, i) {
  const close = line.indexOf("'", i + 1);
  return close < 0 ? { error: unclosed("'") } : { parts: [{ lit: line.slice(i + 1, close), q: true }], end: close + 1 };
}

function scanTilde(line, i) {
  const user = /^~([A-Za-z_][A-Za-z0-9_-]*)?(?=$|[/\s|&;<>()])/.exec(line.slice(i));
  return user ? { parts: [{ tilde: user[1] ?? '' }], end: i + user[0].length } : { parts: [{ lit: '~', q: false }], end: i + 1 };
}

const SCANNERS = {
  "'": scanSingleQuoted,
  '"': (line, i) => scanDouble(line, i + 1),
  '\\': (line, i) => (i + 1 < line.length && line[i + 1] !== '\n' ? { parts: [{ lit: line[i + 1], q: true }], end: i + 2 } : { parts: [], end: i + 2 }),
  $: (line, i) => single(scanDollar(line, i, false)),
  '`': (line, i) => single(scanBacktick(line, i, false)),
};

function scanWordPart(line, i, atStart) {
  const c = line[i];
  let scan = { parts: [{ lit: c, q: false }], end: i + 1 };
  if (SCANNERS[c]) scan = SCANNERS[c](line, i);
  else if (c === '~' && atStart) scan = scanTilde(line, i);
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

function operatorToken(line, i, word) {
  const c = line[i];
  const op = METACHARS.includes(c) ? OPERATORS.find(o => line.startsWith(o, i)) : null;
  const redir = '<>'.includes(c) ? REDIRECTS.find(r => line.startsWith(r, i)) : null;
  const fd = redir && word && onlyDigits(word) ? Number(word.parts.map(p => p.lit).join('')) : null;
  let token = null;
  if (redir) token = { type: 'redir', op: redir, fd };
  else if (op?.startsWith('&>')) token = { type: 'redir', op, fd: null };
  else if (op) token = { type: 'op', op };
  return token ? { token, width: token.op.length, takesWord: fd !== null } : null;
}

// Lines are counted as the tokens go, which only move forward.
function lineAt(line, index, st) {
  for (; st.counted < index; st.counted++) if (line[st.counted] === '\n') st.line++;
  return st.line;
}

const joinedLines = raw => /^(\\\n)+$/.test(raw);

function finishWord(line, end, st) {
  const raw = st.word ? line.slice(st.word.start, end) : '';
  if (st.word && !joinedLines(raw)) st.tokens.push({ type: 'word', parts: mergeLiterals(st.word.parts), raw, line: lineAt(line, st.word.start, st) });
  st.word = null;
}

function step(line, i, st) {
  const blank = line[i] === ' ' || line[i] === '\t';
  const op = blank ? null : operatorToken(line, i, st.word);
  let scan;
  if (op?.takesWord) st.word = null;
  if (blank || op) {
    finishWord(line, i, st);
    if (op) st.tokens.push({ ...op.token, line: lineAt(line, i, st) });
    scan = { end: i + (op ? op.width : 1), error: null };
  } else {
    st.word ??= { parts: [], start: i };
    scan = scanWordPart(line, i, i === st.word.start);
    st.word.parts.push(...scan.parts);
  }
  return scan;
}

/**
 * Split text (a typed line, or a script of many lines) into word, operator
 * and redirection tokens. A `#` at the start of a word starts a comment that
 * runs to the end of its line; a backslash before a newline joins the lines.
 *
 * @param {string} line The text.
 * @returns {{tokens: object[], error: string|null, errorLine: number|null}} The tokens.
 *   When the text ends inside a quote or substitution: the tokens before the
 *   word it is in, the message bash prints (without `bash: `) and the line where it began.
 */
export function tokenize(line) {
  const st = { tokens: [], word: null, line: 1, counted: 0 };
  let error = null;
  let errorLine = null;
  let i = 0;
  while (i < line.length && !error) {
    const comment = line[i] === '#' && !st.word;
    const scan = comment ? { end: line.includes('\n', i) ? line.indexOf('\n', i) : line.length, error: null } : step(line, i, st);
    error = scan.error;
    if (error) errorLine = lineAt(line, i, st);
    i = scan.end;
  }
  if (!error) finishWord(line, i, st);
  return { tokens: st.tokens, error, errorLine };
}
