/**
 * How coreutils quotes names in C.UTF-8 (gnulib quotearg): shell-escape
 * quoting for file names, and curly quotes for other quoted words in messages.
 */

const SPECIAL = new Set([...' !"$&()*;<=>[^`|\'\\?']);
const SAFE = /^[%+,\-./0-9:A-Z\]_a-z]$/;
const ESCAPES = { '\u0007': 'a', '\b': 'b', '\f': 'f', '\n': 'n', '\r': 'r', '\t': 't', '\v': 'v' };

const isControl = ch => ch.codePointAt(0) < 0x20 || ch === '\u007f';
const isSpecialAt = (ch, i, name) => SPECIAL.has(ch) || isControl(ch) || ((ch === '#' || ch === '~') && i === 0) || ((ch === '{' || ch === '}') && name.length === 1);

/**
 * @param {string} name A file name.
 * @returns {boolean} Whether shell-escape quoting must quote it.
 */
export const needsQuoting = name => name === '' || [...name].some((ch, i) => isSpecialAt(ch, i, name));

function escapeControl(ch) {
  const code = ch.codePointAt(0);
  return ESCAPES[ch] ?? code.toString(8).padStart(3, '0');
}

function singleQuoted(name) {
  let out = "'";
  let escaping = false;
  for (const ch of name) {
    if (isControl(ch)) {
      out += escaping ? `\\${escapeControl(ch)}` : `'$'\\${escapeControl(ch)}`;
      escaping = true;
    } else {
      if (escaping) out += "''";
      escaping = false;
      out += ch === "'" ? "'\\''" : ch;
    }
  }
  return `${out}'`;
}

/**
 * Quote a name the way ls shows it on a terminal and coreutils shows file
 * names in messages.
 *
 * @param {string} name A file name.
 * @param {{always?: boolean}} [opts] Quote even when nothing needs quoting (coreutils' quoteaf).
 * @returns {string} The quoted name.
 */
export function shellQuote(name, { always = false } = {}) {
  const chars = [...name];
  const compatible = chars.every((ch, i) => SAFE.test(ch) || ch === ' ' || ch === "'" || ch.codePointAt(0) > 0x7f
    || ((ch === '#' || ch === '~') && i === 0) || ((ch === '{' || ch === '}') && name.length === 1));
  let quoted = name;
  if (!always && !needsQuoting(name)) quoted = name;
  else if (name.includes("'") && compatible) quoted = `"${name}"`;
  else quoted = singleQuoted(name);
  return quoted;
}

/**
 * @param {string} text A word to quote in a message.
 * @returns {string} The word in the locale's quotes, which are curly in C.UTF-8.
 */
export const localeQuote = text => `‘${text}’`;
