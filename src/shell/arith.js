/**
 * Shell arithmetic, `$(( ))`: integers, + - * / %, comparisons, && || !,
 * parentheses, and variable names. A variable's value is itself evaluated as
 * an expression, as bash does; an unset or empty one is 0.
 *
 * bash stops after 1024 levels of variables evaluating variables with
 * "expression recursion level exceeded". The same limit applies here to
 * nested parentheses and unary operators, which bash handles until its stack
 * overflows.
 */

const TOKEN = /\s*(\d+|[A-Za-z_][A-Za-z0-9_]*|&&|\|\||==|!=|<=|>=|[-+*/%()<>!])/y;
const BINARY = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
const PRECEDENCE = new Map(BINARY.flatMap((ops, level) => ops.map(op => [op, level])));
const APPLY = {
  '||': (a, b) => +(a !== 0 || b !== 0), '&&': (a, b) => +(a !== 0 && b !== 0), '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b),
  '<': (a, b) => +(a < b), '<=': (a, b) => +(a <= b), '>': (a, b) => +(a > b), '>=': (a, b) => +(a >= b),
  '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => Math.trunc(a / b), '%': (a, b) => a % b,
};
const UNARY = { '-': v => -v, '+': v => v, '!': v => +(v === 0) };
const MAX_LEVEL = 1024;

function tokenize(expr) {
  const tokens = [];
  let pos = 0;
  let m = true;
  while (m && pos < expr.length) {
    TOKEN.lastIndex = pos;
    m = TOKEN.exec(expr);
    if (m) {
      tokens.push({ text: m[1], start: TOKEN.lastIndex - m[1].length });
      pos = TOKEN.lastIndex;
    }
  }
  return { tokens, rest: expr.slice(pos).trim() };
}

function fail(st, message) {
  st.error ??= message;
  return 0;
}

const restOfLine = (st, at) => st.expr.slice(st.tokens[at]?.start ?? st.expr.length).trim();
const tooDeep = (st, at) => fail(st, `${st.text}: expression recursion level exceeded (error token is "${restOfLine(st, at)}")`);

function variable(st, name) {
  const raw = st.lookup(name);
  let value = 0;
  if (/^\s*-?\d+\s*$/.test(raw)) value = Number(raw);
  else if (raw.trim() && st.depth >= MAX_LEVEL) tooDeep(st, st.i - 1);
  else if (raw.trim()) {
    const inner = evaluateAt(raw, st.lookup, st.depth + 1);
    value = inner.error ? fail(st, inner.error) : inner.value;
  }
  return value;
}

function nested(st, read) {
  st.nesting++;
  const value = st.nesting > MAX_LEVEL ? tooDeep(st, st.i) : read();
  st.nesting--;
  return value;
}

function primary(st) {
  const token = st.tokens[st.i++]?.text;
  let value = 0;
  if (token === undefined) fail(st, `${st.text}: syntax error: operand expected (error token is "${st.tokens.at(-1)?.text ?? ''}")`);
  else if (token === '(') {
    value = nested(st, () => binary(st, 0));
    if (st.tokens[st.i++]?.text !== ')') fail(st, `${st.text}: missing \`)' (error token is "${st.tokens[st.i - 1]?.text ?? ''}")`);
  } else if (/^\d+$/.test(token)) value = Number(token);
  else if (/^[A-Za-z_]/.test(token)) value = variable(st, token);
  else fail(st, `${st.text}: syntax error: operand expected (error token is "${restOfLine(st, st.i - 1)}")`);
  return value;
}

function unary(st) {
  const op = st.tokens[st.i]?.text;
  let value;
  if (Object.hasOwn(UNARY, op)) {
    st.i++;
    value = UNARY[op](nested(st, () => unary(st)));
  } else value = primary(st);
  return value;
}

function binary(st, minLevel) {
  let left = unary(st);
  const next = () => st.tokens[st.i]?.text;
  while (!st.error && PRECEDENCE.get(next()) >= minLevel) {
    const op = st.tokens[st.i++].text;
    const right = binary(st, PRECEDENCE.get(op) + 1);
    if ((op === '/' || op === '%') && right === 0) fail(st, `${st.text}: division by 0 (error token is "${restOfLine(st, st.i - 1)}")`);
    else left = APPLY[op](left, right);
  }
  return left;
}

function evaluateAt(expr, lookup, depth) {
  const { tokens, rest } = tokenize(expr);
  const text = expr.trim();
  const st = { expr, text, tokens, lookup, depth, i: 0, nesting: 0, error: null };
  if (rest) fail(st, `${text}: syntax error: invalid arithmetic operator (error token is "${rest}")`);
  const value = st.error ? 0 : binary(st, 0);
  if (!st.error && st.i < tokens.length) fail(st, `${text}: syntax error in expression (error token is "${restOfLine(st, st.i)}")`);
  return st.error ? { value: null, error: st.error } : { value, error: null };
}

/**
 * Evaluate an arithmetic expression.
 *
 * @param {string} expr The text between `$((` and `))`.
 * @param {(name: string) => string} lookup The value of a variable.
 * @returns {{value: number|null, error: string|null}} The value, or bash's message (without `bash: `).
 */
export function evaluate(expr, lookup) {
  return evaluateAt(expr, lookup, 1);
}
