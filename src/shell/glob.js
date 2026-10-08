/**
 * Pathname expansion. Patterns arrive with quoted characters escaped by a
 * backslash, so `"*"x*` is the pattern `\*x*`.
 */

import { lookup, normalize } from './fs.js';
import { compareNames, joinPath } from '../backend/tree.js';
import { can } from './perms.js';
import { nameTable } from './table.js';

const CLASSES = nameTable({
  alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f\\x7f', print: ' -~', graph: '!-~',
});
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const escapeClass = s => s.replace(/[\]\\[^-]/g, '\\$&');

/**
 * Translate a bracket expression starting at `[`.
 *
 * @param {string} pattern The pattern.
 * @param {number} start Index of the `[`.
 * @returns {{source: string, end: number}|null} Regex source and the index after `]`, or null if it never closes.
 */
function bracket(pattern, start) {
  let i = start + 1;
  let negate = false;
  if (pattern[i] === '!' || pattern[i] === '^') { negate = true; i++; }
  let body = '';
  let first = true;
  while (i < pattern.length && (pattern[i] !== ']' || first)) {
    const cls = /^\[:([a-z]+):\]/.exec(pattern.slice(i));
    if (cls && CLASSES[cls[1]]) { body += CLASSES[cls[1]]; i += cls[0].length; }
    else if (pattern[i] === '\\' && i + 1 < pattern.length) { body += escapeClass(pattern[i + 1]); i += 2; }
    else if (pattern[i] === '-' && !first && pattern[i + 1] !== ']') { body += '-'; i++; }
    else { body += escapeClass(pattern[i]); i++; }
    first = false;
  }
  return i < pattern.length ? { source: `[${negate ? '^' : ''}${body}]`, end: i + 1 } : null;
}

const STAR = 'star';

function oneChar(source, flags) {
  const re = new RegExp(`^${source}$`, flags);
  return ch => re.test(ch);
}

// A pattern becomes a list of tokens: STAR, or a test for one character.
function tokenize(pattern, flags) {
  const tokens = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = String.fromCodePoint(pattern.codePointAt(i));
    const br = ch === '[' ? bracket(pattern, i) : null;
    let size = ch.length;
    if (ch === '\\' && i + 1 < pattern.length) {
      const escaped = String.fromCodePoint(pattern.codePointAt(i + 1));
      tokens.push(oneChar(escapeRe(escaped), flags));
      size += escaped.length;
    } else if (ch === '*') tokens.push(STAR);
    else if (ch === '?') tokens.push(oneChar('.', flags));
    else if (br) {
      tokens.push(oneChar(br.source, flags));
      size = br.end - i;
    } else tokens.push(oneChar(escapeRe(ch), flags));
    i += size;
  }
  return tokens;
}

// Classic wildcard matching: on a mismatch, let the last star take one more
// character and retry. Time is proportional to tokens times characters.
function matchTokens(tokens, name) {
  const chars = [...name];
  let t = 0;
  let c = 0;
  let star = -1;
  let starAt = 0;
  let failed = false;
  while (c < chars.length && !failed) {
    if (tokens[t] === STAR) {
      star = t++;
      starAt = c;
    } else if (t < tokens.length && tokens[t](chars[c])) {
      t++;
      c++;
    } else if (star >= 0) {
      t = star + 1;
      c = ++starAt;
    } else failed = true;
  }
  while (!failed && tokens[t] === STAR) t++;
  return !failed && t === tokens.length;
}

/**
 * Compile a pattern for whole names.
 *
 * @param {string} pattern A pattern with `*`, `?`, `[...]` and backslash escapes.
 * @param {{ignoreCase?: boolean}} [opts] Match regardless of case (find -iname).
 * @returns {{test: (name: string) => boolean}} The matcher.
 */
export function compileGlob(pattern, { ignoreCase = false } = {}) {
  const tokens = tokenize(pattern, `su${ignoreCase ? 'i' : ''}`);
  return { test: name => matchTokens(tokens, name) };
}

/**
 * @param {string} pattern A pattern.
 * @returns {boolean} Whether it has an unescaped `*`, `?` or a complete bracket expression.
 */
export function hasGlob(pattern) {
  let found = false;
  for (let i = 0; i < pattern.length && !found; i++) {
    if (pattern[i] === '\\') i++;
    else found = pattern[i] === '*' || pattern[i] === '?' || (pattern[i] === '[' && bracket(pattern, i) !== null);
  }
  return found;
}

/**
 * @param {string} pattern A pattern.
 * @returns {string} The text it stands for when taken literally.
 */
export const unescapeGlob = pattern => pattern.replace(/\\(.)/gs, '$1');

const splitSegments = pattern => pattern.split(/(?<!\\)\/+/);

function stepSegment(sys, candidates, seg) {
  if (seg === '') return candidates.filter(c => lookup(sys.root, c.path)?.type === 'dir');
  if (!hasGlob(seg)) return candidates.map(c => ({ path: normalize(unescapeGlob(seg), c.path), shown: c.shown + unescapeGlob(seg) }));
  const re = compileGlob(seg);
  const dotOk = seg.startsWith('.') || seg.startsWith('\\.');
  return candidates.flatMap(c => {
    const node = lookup(sys.root, c.path);
    if (!node || node.type !== 'dir' || !can(sys, node, 'r')) return [];
    return Object.keys(node.children).sort(compareNames)
      .filter(name => (dotOk || name[0] !== '.') && re.test(name))
      .map(name => ({ path: joinPath(c.path, name), shown: c.shown + name }));
  });
}

/**
 * Expand a pattern against the tree, as bash does without nullglob.
 *
 * @param {string} pattern The pattern, quoted characters escaped.
 * @param {{root: object, cwd: string, user: string, groups: string[]}} sys The machine state.
 * @returns {string[]} The matching paths as they would be typed, sorted; empty when nothing matches.
 */
export function expandPattern(pattern, sys) {
  const abs = pattern.startsWith('/');
  const segments = splitSegments(pattern).filter((s, i) => s !== '' || i > 0);
  let candidates = [{ path: abs ? '/' : sys.cwd, shown: abs ? '/' : '' }];
  segments.forEach((seg, i) => {
    candidates = stepSegment(sys, candidates, seg);
    if (i < segments.length - 1) candidates = candidates.map(c => ({ ...c, shown: `${c.shown}/` }));
  });
  return candidates.filter(c => lookup(sys.root, c.path, { follow: false })).map(c => c.shown);
}
