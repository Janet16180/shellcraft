/**
 * Turning a typed line into commands: tokens (with quote removal, variable
 * and tilde expansion), then a sequence of pipelines joined by `;`, `&&`, `||`.
 *
 * A token is `{v, quoted, glob}` for a word or `{op}` for an operator.
 * Mistakes in the line are expected, so both steps return `{error}` with the
 * message bash would print instead of raising.
 */

const VAR_RE = /^\$(\$|\?|\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/;
const OPERATORS = [['||', '||'], ['|', '|'], ['&&', '&&'], [';', ';'], ['>>', '>>'], ['>', '>'], ['<', '<']];

function operatorAt(line, i) {
  const hit = OPERATORS.find(([text]) => line.startsWith(text, i));
  return hit ? hit[1] : null;
}

function readDoubleQuoted(line, start, lookupVar) {
  let j = start;
  let text = '';
  while (j < line.length && line[j] !== '"') {
    const m = line[j] === '$' ? VAR_RE.exec(line.slice(j)) : null;
    if (line[j] === '\\' && '"\\$'.includes(line[j + 1])) {
      text += line[j + 1];
      j += 2;
    } else if (m) {
      text += lookupVar(m[1]);
      j += m[0].length;
    } else {
      text += line[j];
      j++;
    }
  }
  return { text, end: j };
}

function readWordChar(line, i, cur, { lookupVar, home }) {
  const c = line[i];
  let step = 1;
  let error = null;
  if (c === "'") {
    const j = line.indexOf("'", i + 1);
    if (j < 0) error = "bash: unexpected EOF while looking for matching `''";
    else { cur.v += line.slice(i + 1, j); cur.quoted = true; step = j + 1 - i; }
  } else if (c === '"') {
    const { text, end } = readDoubleQuoted(line, i + 1, lookupVar);
    if (end >= line.length) error = 'bash: unexpected EOF while looking for matching `"\'';
    else { cur.v += text; cur.quoted = true; step = end + 1 - i; }
  } else if (c === '\\' && i + 1 < line.length) {
    cur.v += line[i + 1]; cur.quoted = true; step = 2;
  } else if (c === '$' && VAR_RE.test(line.slice(i))) {
    const m = VAR_RE.exec(line.slice(i));
    cur.v += lookupVar(m[1]); step = m[0].length;
  } else if (c === '~' && cur.v === '' && !cur.quoted && (i + 1 >= line.length || ' /;|'.includes(line[i + 1]))) {
    cur.v += home;
  } else {
    if (c === '*' || c === '?') cur.glob = true;
    cur.v += c;
  }
  return { step, error };
}

/**
 * Split a line into word and operator tokens.
 *
 * @param {string} line The typed line.
 * @param {{lookupVar: (name: string) => string, home: string}} env Variable lookup and the home for `~`.
 * @returns {{tokens: object[], error: string|null}} The tokens, or the error bash prints for an unclosed quote.
 */
export function tokenize(line, env) {
  const tokens = [];
  let cur = null;
  let error = null;
  let i = 0;
  const push = () => {
    if (cur) tokens.push(cur);
    cur = null;
  };
  while (i < line.length && !error) {
    const c = line[i];
    const op = operatorAt(line, i);
    if (c === ' ' || c === '\t') { push(); i++; continue; }
    if (c === '#' && !cur) break;
    if (op) { push(); tokens.push({ op }); i += op.length; continue; }
    cur ??= { v: '', quoted: false, glob: false };
    const r = readWordChar(line, i, cur, env);
    error = r.error;
    i += r.step;
  }
  push();
  return { tokens, error };
}

const isRedirect = op => op === '>' || op === '>>' || op === '<';
const syntaxError = token => `bash: syntax error near unexpected token \`${token}'`;

/**
 * Group tokens into pipelines of stages. A stage is `{args, redir}`; the
 * result is a list of `{pipeline, next}` where next is the operator that
 * follows (`;`, `&&`, `||` or null).
 *
 * @param {object[]} tokens Tokens from tokenize().
 * @returns {{seq: object[], error: string|null}} The sequence, or bash's syntax error.
 */
export function parse(tokens) {
  const seq = [];
  let pipeline = [];
  let stage = { args: [], redir: [] };
  let error = null;
  for (let k = 0; k < tokens.length && !error; k++) {
    const t = tokens[k];
    const empty = !stage.args.length && !stage.redir.length;
    if (t.op === '|') {
      if (!stage.args.length) error = syntaxError('|');
      pipeline.push(stage);
      stage = { args: [], redir: [] };
    } else if (isRedirect(t.op)) {
      const target = tokens[k + 1];
      if (!target || target.op) error = syntaxError(target ? target.op : 'newline');
      else stage.redir.push({ op: t.op, target: target.v });
      k++;
    } else if (t.op) {
      if (empty) error = syntaxError(t.op);
      pipeline.push(stage);
      seq.push({ pipeline, next: t.op });
      pipeline = [];
      stage = { args: [], redir: [] };
    } else {
      stage.args.push(t);
    }
  }
  if (stage.args.length || stage.redir.length) pipeline.push(stage);
  else if (pipeline.length && !error) error = syntaxError('newline');
  if (pipeline.length) seq.push({ pipeline, next: null });
  return { seq: error ? [] : seq, error };
}
