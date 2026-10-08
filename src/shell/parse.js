/**
 * Grouping tokens from the lexer into what bash runs.
 *
 * A list is an array of items `{pipeline, next, negate}`: `next` is the
 * operator after the pipeline (`;`, `&&`, `||`, `&`, or null), and `negate`
 * is set by a leading `!`. A pipeline is an array of commands:
 *   simple `{words, redirs, line}`, line being the one it ends on;
 *   `{type: 'for', name, words, body, redirs, line, endLine}`, words null for `for x; do`;
 *   `{type: 'if', branches: [{cond, body}], otherwise, redirs, line, endLine}`.
 * Reserved words (for, in, do, done, if, then, elif, else, fi, !) count only
 * where a command starts. A mistake in the text is an expected outcome, so
 * the parser returns bash's message instead of raising.
 */

const END_OF_FILE = 'syntax error: unexpected end of file';
const NOT_FIRST = new Set(['in', 'do', 'done', 'then', 'elif', 'else', 'fi']);
const SEPARATORS = new Set([';', '&', '\n']);

const peek = st => st.tokens[st.k] ?? null;
const isOp = (token, ...ops) => token?.type === 'op' && ops.includes(token.op);
const isWord = (token, ...words) => token?.type === 'word' && words.includes(token.raw);
const near = (token, line) => ({ message: `syntax error near unexpected token \`${token}'`, line, echo: true, incomplete: false });

// The error is the first one found; an end of the tokens means the text ended too soon.
function fail(st, token) {
  if (st.error) return;
  if (!token) st.error = { message: END_OF_FILE, line: null, echo: false, incomplete: true };
  else if (token.type === 'error') st.error = { message: token.message, line: token.line, echo: false, incomplete: true };
  else st.error = near(token.type === 'word' ? token.raw : token.op.replace('\n', 'newline'), token.line);
}

function expectWord(st, word) {
  const token = peek(st);
  if (!st.error && !isWord(token, word)) fail(st, token);
  if (!st.error) st.k++;
  return token;
}

function skipNewlines(st) {
  while (isOp(peek(st), '\n')) st.k++;
}

function redirection(st, cmd) {
  const op = peek(st);
  const target = st.tokens[st.k + 1];
  if (target?.type === 'word') cmd.redirs.push({ op: op.op, fd: op.fd, target });
  else if (target) fail(st, target);
  else st.error ??= near('newline', op.line);
  st.k += 2;
  return target?.line ?? op.line;
}

function simpleCommand(st) {
  const cmd = { words: [], redirs: [], line: peek(st)?.line ?? null };
  for (let t = peek(st); !st.error && (t?.type === 'word' || t?.type === 'redir'); t = peek(st)) {
    if (t.type === 'redir') cmd.line = redirection(st, cmd);
    else {
      cmd.words.push(t);
      cmd.line = t.line;
      st.k++;
    }
  }
  if (!cmd.words.length && !cmd.redirs.length) fail(st, peek(st));
  return cmd;
}

function forCommand(st) {
  const line = peek(st).line;
  st.k++;
  const name = peek(st);
  if (name?.type !== 'word') fail(st, name);
  else st.k++;
  if (isOp(peek(st), ';')) st.k++;
  skipNewlines(st);
  let words = null;
  if (!st.error && isWord(peek(st), 'in')) {
    st.k++;
    words = [];
    for (; peek(st)?.type === 'word'; st.k++) words.push(peek(st));
    if (isOp(peek(st), ';', '\n')) st.k++;
    else fail(st, peek(st));
    skipNewlines(st);
  }
  expectWord(st, 'do');
  const body = compoundList(st, ['done']);
  const end = expectWord(st, 'done');
  return { type: 'for', name: name?.raw, words, body, redirs: [], line, endLine: end?.line };
}

function ifCommand(st) {
  const line = peek(st).line;
  const branches = [];
  let otherwise = null;
  for (let more = true; more && !st.error; more = isWord(peek(st), 'elif')) {
    st.k++;
    const cond = compoundList(st, ['then']);
    expectWord(st, 'then');
    branches.push({ cond, body: compoundList(st, ['elif', 'else', 'fi']) });
  }
  if (!st.error && isWord(peek(st), 'else')) {
    st.k++;
    otherwise = compoundList(st, ['fi']);
  }
  const end = expectWord(st, 'fi');
  return { type: 'if', branches, otherwise, redirs: [], line, endLine: end?.line };
}

const COMPOUND = { for: forCommand, if: ifCommand };

// A compound command may be followed by redirections, and then must end.
function compoundCommand(st, kind) {
  const cmd = COMPOUND[kind](st);
  while (!st.error && peek(st)?.type === 'redir') redirection(st, cmd);
  if (!st.error && peek(st)?.type === 'word') fail(st, peek(st));
  return cmd;
}

function command(st) {
  const first = peek(st);
  let cmd = null;
  if (isWord(first, 'for', 'if')) cmd = compoundCommand(st, first.raw);
  else if (first?.type === 'word' && NOT_FIRST.has(first.raw)) fail(st, first);
  else cmd = simpleCommand(st);
  return cmd;
}

function pipeline(st) {
  const negate = isWord(peek(st), '!');
  if (negate) st.k++;
  const cmds = [command(st)];
  while (!st.error && isOp(peek(st), '|')) {
    st.k++;
    skipNewlines(st);
    cmds.push(command(st));
  }
  return { pipeline: cmds, next: null, negate };
}

function andOr(st, items) {
  items.push(pipeline(st));
  while (!st.error && isOp(peek(st), '&&', '||')) {
    items.at(-1).next = peek(st).op;
    st.k++;
    skipNewlines(st);
    items.push(pipeline(st));
  }
}

// The commands up to one of the reserved words in `ends`, which is left for the caller.
function compoundList(st, ends) {
  const items = [];
  skipNewlines(st);
  let done = st.error !== null;
  while (!done) {
    andOr(st, items);
    const t = peek(st);
    if (!st.error && SEPARATORS.has(t?.op) && t.type === 'op') {
      items.at(-1).next = t.op === '&' ? '&' : ';';
      st.k++;
      skipNewlines(st);
    } else fail(st, t);
    done = st.error !== null || isWord(peek(st), ...ends);
  }
  return items;
}

// One line: and-or lists separated by ; or &, up to a newline or the end.
function line(st) {
  const items = [];
  let done = false;
  while (!done) {
    andOr(st, items);
    const t = peek(st);
    if (!st.error && isOp(t, ';', '&')) {
      items.at(-1).next = t.op;
      st.k++;
    } else if (!st.error && t && !isOp(t, '\n')) fail(st, t);
    done = st.error !== null || !peek(st) || isOp(peek(st), '\n');
  }
  if (isOp(peek(st), '\n')) st.k++;
  return items;
}

/**
 * Parse the next complete command from the tokens: one line, or more when a
 * compound command spans lines. bash reads a script this way, running each
 * line before it reads the next.
 *
 * @param {object[]} tokens Tokens from tokenize(); a final `{type: 'error', message, line}`
 *   token stands for text that ended inside a quote.
 * @param {number} start Where to begin.
 * @returns {{list: object[]|null, end: number, error: {message: string, line: number|null, echo: boolean, incomplete: boolean}|null}}
 *   The list (null when only blank lines are left) and where the next
 *   command begins; or bash's error without its `bash: ` prefix, the line it
 *   names (null at the end of the text), whether bash echoes that line, and
 *   whether the text ended where bash would wait for more.
 */
export function parseNext(tokens, start) {
  const st = { tokens, k: start, error: null };
  skipNewlines(st);
  const list = peek(st) ? line(st) : null;
  return { list: st.error ? null : list, end: st.k, error: st.error };
}

/**
 * Parse all the tokens of a single line.
 *
 * @param {object[]} tokens Tokens from tokenize().
 * @returns {{list: object[], error: string|null, incomplete: boolean}} The pipelines; or
 *   bash's syntax error (without `bash: `), with incomplete set when the line
 *   ended where bash would wait for more input.
 */
export function parse(tokens) {
  const list = [];
  let next = { end: 0, list: [], error: null };
  while (next.list && !next.error) {
    next = parseNext(tokens, next.end);
    list.push(...(next.list ?? []));
  }
  return { list: next.error ? [] : list, error: next.error?.message ?? null, incomplete: next.error?.incomplete ?? false };
}
