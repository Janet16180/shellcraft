/**
 * Word expansion when a command runs: braces, tilde, parameters, command
 * substitution, word splitting, pathname expansion and quote removal, in
 * bash's order.
 *
 * The environment `env` gives `sys` (for globbing), `lookupVar(name)`,
 * `homeOf(user)` (null if unknown), `positional()` (the arguments `$@`
 * stands for), `substitute(line)` (the output of a command substitution) and
 * `fail(message)` (an expansion error, such as a division by zero, that stops
 * the command).
 */

import { hasGlob, expandPattern, compileGlob } from './glob.js';
import { evaluate } from './arith.js';
import { braceExpand } from './brace.js';
import { tokenize } from './lexer.js';

const GLOB_CHARS = /[*?[\]\\]/g;
const BLANKS = /[ \t\n]+/;

function newField() {
  return { text: '', pattern: '', started: false, active: false };
}

function appendQuoted(field, text) {
  field.text += text;
  field.pattern += text.replace(GLOB_CHARS, '\\$&');
  field.started = true;
}

function appendUnquoted(field, text) {
  field.text += text;
  field.pattern += text.replace(/\\/g, '\\\\');
  field.started ||= text !== '';
  field.active = true;
}

function appendSplit(fields, value) {
  const pieces = value.split(BLANKS);
  pieces.forEach((piece, i) => {
    if (i > 0 && fields.at(-1).started) fields.push(newField());
    appendUnquoted(fields.at(-1), piece);
  });
}

// "$@" is one word per argument; "$*" joins them; unquoted, both split.
function appendPositional(fields, part, args) {
  if (part.q && part.var === '@') {
    args.forEach((arg, i) => {
      if (i > 0) fields.push(newField());
      appendQuoted(fields.at(-1), arg);
    });
  } else if (part.q) appendQuoted(fields.at(-1), args.join(' '));
  else appendSplit(fields, args.join(' '));
}

function arithmetic(expr, env) {
  const text = expr.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*|[?$#])\}?/g, (_, name) => env.lookupVar(name));
  const r = evaluate(text, env.lookupVar);
  if (r.error) env.fail(`bash: ${r.error}`);
  return r.error ? '' : String(r.value);
}

const escapeGlob = text => text.replace(/[*?[\]\\]/g, '\\$&');
const VAR_IN_PATTERN = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?$#!-])\}|([A-Za-z_][A-Za-z0-9_]*|[0-9?$#!-]))/;

// The glob pattern of `${v#pattern}`: variables expanded, quoted text literal.
function trimPattern(raw, env) {
  let out = '';
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const dollar = c === '$' && quote !== "'" ? VAR_IN_PATTERN.exec(raw.slice(i)) : null;
    if (dollar) {
      const value = env.lookupVar(dollar[1] ?? dollar[2]);
      out += quote ? escapeGlob(value) : value;
      i += dollar[0].length - 1;
    } else if (c === quote) quote = null;
    else if (!quote && (c === "'" || c === '"')) quote = c;
    else if (c === '\\' && quote !== "'" && i + 1 < raw.length) out += `\\${raw[++i]}`;
    else out += quote ? escapeGlob(c) : c;
  }
  return out;
}

// Remove the shortest or longest prefix (#, ##) or suffix (%, %%) that matches.
function trimValue(value, op, pattern) {
  const glob = compileGlob(pattern);
  const longest = op.length === 2;
  const sizes = [...Array(value.length + 1).keys()];
  if (longest) sizes.reverse();
  const cut = op[0] === '#'
    ? sizes.find(n => glob.test(value.slice(0, n)))
    : sizes.find(n => glob.test(value.slice(value.length - n)));
  if (cut === undefined) return value;
  return op[0] === '#' ? value.slice(cut) : value.slice(0, value.length - cut);
}

function varValue(part, env) {
  const value = env.lookupVar(part.var);
  if (part.op === 'length') return String([...value].length);
  return part.op ? trimValue(value, part.op, trimPattern(part.pattern, env)) : value;
}

function partValue(part, env) {
  let value = '';
  if ('var' in part) value = varValue(part, env);
  else if ('cmd' in part) value = env.substitute(part.cmd).replace(/\n+$/, '');
  else if ('arith' in part) value = arithmetic(part.arith, env);
  return value;
}

function expandToFields(word, env) {
  const fields = [newField()];
  for (const part of word.parts) {
    const field = fields.at(-1);
    if ('tilde' in part) {
      const home = part.tilde === '' ? env.lookupVar('HOME') : env.homeOf(part.tilde);
      appendQuoted(field, home ?? `~${part.tilde}`);
    } else if (part.var === '@' || part.var === '*') appendPositional(fields, part, env.positional());
    else if ('lit' in part && part.q) appendQuoted(field, part.lit);
    else if ('lit' in part) appendUnquoted(field, part.lit);
    else if (part.q) appendQuoted(field, partValue(part, env));
    else appendSplit(fields, partValue(part, env));
  }
  return fields.filter(f => f.started);
}

function globField(field, env) {
  const matches = field.active && hasGlob(field.pattern) ? expandPattern(field.pattern, env.sys) : [];
  return matches.length ? matches : [field.text];
}

// Each word that braces make is read again; a leading # stays a word, not a comment.
function braceWords(word) {
  const raws = word.raw?.includes('{') ? braceExpand(word.raw) : [word.raw];
  if (raws.length === 1 && raws[0] === word.raw) return [word];
  return raws.flatMap(raw => tokenize(raw.startsWith('#') ? `\\${raw}` : raw).tokens.filter(t => t.type === 'word').map(t => ({ ...t, raw, line: word.line })));
}

/**
 * Expand command words into the arguments the command receives.
 *
 * @param {object[]} words Word tokens from the lexer.
 * @param {object} env The expansion environment.
 * @returns {string[]} The arguments.
 */
export const expandWords = (words, env) => words.flatMap(braceWords).flatMap(w => expandToFields(w, env).flatMap(f => globField(f, env)));

/**
 * Expand a redirection target, which must become exactly one word.
 *
 * @param {object} word The target word token.
 * @param {object} env The expansion environment.
 * @returns {{value: string|null, error: string|null}} The path, or bash's "ambiguous redirect" error.
 */
export function expandTarget(word, env) {
  const values = expandWords([word], env);
  return values.length === 1 ? { value: values[0], error: null } : { value: null, error: `bash: ${word.raw}: ambiguous redirect` };
}

/**
 * Expand the value side of `NAME=value`: no word splitting and no globbing.
 *
 * @param {object} word The whole assignment word.
 * @param {object} env The expansion environment.
 * @returns {string} The value.
 */
export function expandAssignment(word, env) {
  const text = expandToFields({ parts: word.parts.map(p => ('lit' in p || 'tilde' in p ? p : { ...p, q: true })) }, env).map(f => f.text).join(' ');
  return text.slice(text.indexOf('=') + 1);
}
