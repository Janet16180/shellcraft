/**
 * Shell arithmetic, `$(( ))`: integers, + - * / %, comparisons, && || !,
 * parentheses, and variable names (an unset or empty one is 0).
 */

const TOKEN = /\s*(\d+|[A-Za-z_][A-Za-z0-9_]*|&&|\|\||==|!=|<=|>=|[-+*/%()<>!])/y;
const BINARY = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
const APPLY = {
  '||': (a, b) => +(a !== 0 || b !== 0), '&&': (a, b) => +(a !== 0 && b !== 0), '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b),
  '<': (a, b) => +(a < b), '<=': (a, b) => +(a <= b), '>': (a, b) => +(a > b), '>=': (a, b) => +(a >= b),
  '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => Math.trunc(a / b), '%': (a, b) => a % b,
};

function tokenize(expr) {
  const tokens = [];
  let pos = 0;
  let m = true;
  while (m && pos < expr.length) {
    TOKEN.lastIndex = pos;
    m = TOKEN.exec(expr);
    if (m) {
      tokens.push(m[1]);
      pos = TOKEN.lastIndex;
    }
  }
  return { tokens, rest: expr.slice(pos).trim() };
}

/**
 * Evaluate an arithmetic expression.
 *
 * @param {string} expr The text between `$((` and `))`.
 * @param {(name: string) => string} lookup The value of a variable.
 * @returns {{value: number|null, error: string|null}} The value, or bash's message (without `bash: `).
 */
export function evaluate(expr, lookup) {
  const { tokens, rest } = tokenize(expr);
  const text = expr.trim();
  let i = 0;
  let error = rest ? `${text}: syntax error: invalid arithmetic operator (error token is "${rest}")` : null;
  const fail = (message) => {
    error ??= message;
    return 0;
  };
  const primary = () => {
    const t = tokens[i++];
    if (t === undefined) return fail(`${text}: syntax error: operand expected (error token is "${tokens.at(-1) ?? ''}")`);
    if (t === '(') { const v = level(0); if (tokens[i++] !== ')') fail(`${text}: missing \`)' (error token is "${tokens[i - 1] ?? ''}")`); return v; }
    if (t === '-' || t === '+' || t === '!') { const v = primary(); return { '-': -v, '+': v, '!': +(v === 0) }[t]; }
    if (/^\d+$/.test(t)) return Number(t);
    if (/^[A-Za-z_]/.test(t)) return Number.parseInt(lookup(t), 10) || 0;
    return fail(`${text}: syntax error: operand expected (error token is "${tokens.slice(i - 1).join('')}")`);
  };
  const level = n => {
    if (n === BINARY.length) return primary();
    let left = level(n + 1);
    while (BINARY[n].includes(tokens[i]) && !error) {
      const op = tokens[i++];
      const right = level(n + 1);
      if ((op === '/' || op === '%') && right === 0) return fail(`${text}: division by 0 (error token is "${tokens.slice(i - 1).join('')}")`);
      left = APPLY[op](left, right);
    }
    return left;
  };
  const value = error ? 0 : level(0);
  if (!error && i < tokens.length) fail(`${text}: syntax error in expression (error token is "${tokens.slice(i).join(' ')}")`);
  return error ? { value: null, error } : { value, error: null };
}
