/**
 * Pathname expansion. Patterns arrive with quoted characters escaped by a
 * backslash, so `"*"x*` is the pattern `\*x*`.
 */

import { lookup, joinPath, normalize } from './fs.js';
import { compareNames } from '../backend/tree.js';
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

function translate(pattern) {
  let source = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    const br = c === '[' ? bracket(pattern, i) : null;
    if (c === '\\' && i + 1 < pattern.length) { source += escapeRe(pattern[i + 1]); i += 2; }
    else if (c === '*') { source += '.*'; i++; }
    else if (c === '?') { source += '.'; i++; }
    else if (br) { source += br.source; i = br.end; }
    else { source += escapeRe(c); i++; }
  }
  return source;
}

/**
 * Compile a pattern into a regular expression for whole names.
 *
 * @param {string} pattern A pattern with `*`, `?`, `[...]` and backslash escapes.
 * @param {{ignoreCase?: boolean}} [opts] Match regardless of case (find -iname).
 * @returns {RegExp} The compiled pattern.
 */
export const compileGlob = (pattern, { ignoreCase = false } = {}) => new RegExp(`^${translate(pattern)}$`, `su${ignoreCase ? 'i' : ''}`);

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
  return candidates.filter(c => lookup(sys.root, c.path)).map(c => c.shown);
}
