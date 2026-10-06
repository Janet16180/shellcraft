/**
 * Word expansion when a command runs: tilde, parameters, command
 * substitution, word splitting, pathname expansion and quote removal, in
 * bash's order.
 *
 * The environment `env` gives `sys` (for globbing), `lookupVar(name)`,
 * `homeOf(user)` (null if unknown) and `substitute(line)` (the output of a
 * command substitution).
 */

import { hasGlob, expandPattern } from './glob.js';

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

function partValue(part, env) {
  let value = '';
  if ('var' in part) value = env.lookupVar(part.var);
  else if ('cmd' in part) value = env.substitute(part.cmd).replace(/\n+$/, '');
  return value;
}

function expandToFields(word, env) {
  const fields = [newField()];
  for (const part of word.parts) {
    const field = fields.at(-1);
    if ('tilde' in part) {
      const home = part.tilde === '' ? env.lookupVar('HOME') : env.homeOf(part.tilde);
      appendQuoted(field, home ?? `~${part.tilde}`);
    } else if ('lit' in part && part.q) appendQuoted(field, part.lit);
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

/**
 * Expand command words into the arguments the command receives.
 *
 * @param {object[]} words Word tokens from the lexer.
 * @param {object} env The expansion environment.
 * @returns {string[]} The arguments.
 */
export const expandWords = (words, env) => words.flatMap(w => expandToFields(w, env).flatMap(f => globField(f, env)));

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
  const text = expandToFields({ parts: word.parts.map(p => ('lit' in p || 'tilde' in p ? p : { ...p, q: true })) }, env).map(f => f.text).join('');
  return text.slice(text.indexOf('=') + 1);
}
