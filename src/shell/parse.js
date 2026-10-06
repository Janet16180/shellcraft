/**
 * Grouping tokens from the lexer into what bash runs: a list of pipelines,
 * each a list of simple commands `{words, redirs}`, joined by `;`, `&&`,
 * `||` or `&`. A mistake in the line is an expected outcome, so parse
 * returns bash's message instead of raising.
 */

const syntaxError = token => `bash: syntax error near unexpected token \`${token}'`;
const END_OF_FILE = 'bash: syntax error: unexpected end of file';
const newCommand = () => ({ words: [], redirs: [] });
const isEmpty = cmd => !cmd.words.length && !cmd.redirs.length;

function describe(token) {
  if (!token) return 'newline';
  return token.type === 'word' ? token.raw : token.op;
}

function endCommand(st, op) {
  st.pipeline.push(st.cmd);
  st.cmd = newCommand();
  if (op === '|') return;
  st.list.push({ pipeline: st.pipeline, next: op });
  st.pipeline = [];
}

function consume(tokens, k, st) {
  const t = tokens[k];
  let used = 1;
  if (t.type === 'word') st.cmd.words.push(t);
  else if (t.type === 'redir' && tokens[k + 1]?.type === 'word') {
    st.cmd.redirs.push({ op: t.op, fd: t.fd, target: tokens[k + 1] });
    used = 2;
  } else if (t.type === 'redir') st.error = syntaxError(describe(tokens[k + 1]));
  else if (isEmpty(st.cmd) || ['(', ')', ';;'].includes(t.op)) st.error = syntaxError(t.op);
  else endCommand(st, t.op);
  return used;
}

/**
 * Parse tokens into pipelines.
 *
 * @param {object[]} tokens Tokens from tokenize().
 * @returns {{list: {pipeline: {words: object[], redirs: object[]}[], next: string|null}[], error: string|null, incomplete: boolean}}
 *   The pipelines; or bash's syntax error, with incomplete set when the line
 *   ended where bash would wait for more input.
 */
export function parse(tokens) {
  const st = { list: [], pipeline: [], cmd: newCommand(), error: null };
  for (let k = 0; k < tokens.length && !st.error;) k += consume(tokens, k, st);
  const dangling = !st.error && isEmpty(st.cmd) && (st.pipeline.length > 0 || ['&&', '||'].includes(st.list.at(-1)?.next));
  if (dangling) st.error = END_OF_FILE;
  if (!st.error && !isEmpty(st.cmd)) st.list.push({ pipeline: [...st.pipeline, st.cmd], next: null });
  return { list: st.error ? [] : st.list, error: st.error, incomplete: dangling };
}
