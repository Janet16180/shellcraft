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

/**
 * Parse tokens into pipelines.
 *
 * @param {object[]} tokens Tokens from tokenize().
 * @returns {{list: {pipeline: {words: object[], redirs: object[]}[], next: string|null}[], error: string|null, incomplete: boolean}}
 *   The pipelines; or bash's syntax error, with incomplete set when the line
 *   ended where bash would wait for more input.
 */
export function parse(tokens) {
  const list = [];
  let pipeline = [];
  let cmd = newCommand();
  let error = null;
  let incomplete = false;
  for (let k = 0; k < tokens.length && !error; k++) {
    const t = tokens[k];
    if (t.type === 'word') cmd.words.push(t);
    else if (t.type === 'redir') {
      const target = tokens[k + 1];
      if (target?.type === 'word') cmd.redirs.push({ op: t.op, fd: t.fd, target });
      else error = syntaxError(describe(target));
      k++;
    } else if (isEmpty(cmd) || t.op === '(' || t.op === ')') error = syntaxError(t.op);
    else if (t.op === '|') {
      pipeline.push(cmd);
      cmd = newCommand();
    } else {
      pipeline.push(cmd);
      list.push({ pipeline, next: t.op });
      pipeline = [];
      cmd = newCommand();
    }
  }
  const dangling = !error && isEmpty(cmd) && (pipeline.length || ['&&', '||'].includes(list.at(-1)?.next));
  if (dangling) {
    error = END_OF_FILE;
    incomplete = true;
  }
  if (!error && !isEmpty(cmd)) list.push({ pipeline: [...pipeline, cmd], next: null });
  return { list: error ? [] : list, error, incomplete };
}
