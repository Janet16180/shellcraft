/**
 * Pathname expansion: `*` and `?` in unquoted words become the matching names.
 */

import { lookup, normalize, joinPath, joinDisp } from './fs.js';
import { compareNames } from './collate.js';

/**
 * Compile a shell pattern into a regular expression that matches whole names.
 *
 * @param {string} pattern A pattern with `*` and `?`.
 * @param {boolean} [ignoreCase] Match regardless of case (find -iname).
 * @returns {RegExp} The compiled pattern.
 */
export function globRe(pattern, ignoreCase = false) {
  let source = '^';
  for (const ch of pattern) {
    if (ch === '*') source += '.*';
    else if (ch === '?') source += '.';
    else source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${source}$`, ignoreCase ? 'i' : '');
}

function expandSegment(root, candidates, seg) {
  const next = [];
  for (const c of candidates) {
    const node = /[*?]/.test(seg) ? lookup(root, c.path) : null;
    if (!/[*?]/.test(seg)) {
      next.push({ path: normalize(seg, c.path), disp: joinDisp(c.disp, seg) });
    } else if (node && node.type === 'dir') {
      const re = globRe(seg);
      const names = Object.keys(node.children).sort(compareNames)
        .filter(name => (name[0] !== '.' || seg[0] === '.') && re.test(name));
      for (const name of names) next.push({ path: joinPath(c.path, name), disp: joinDisp(c.disp, name) });
    }
  }
  return next;
}

/**
 * Expand one word token. A word without unquoted wildcards, or one that
 * matches nothing, stays as it is (bash's default, without nullglob).
 *
 * @param {{v: string, glob: boolean}} token The word.
 * @param {object} root The root directory node.
 * @param {string} cwd Absolute working directory.
 * @returns {string[]} The words it expands to.
 */
export function expandGlob(token, root, cwd) {
  if (!token.glob) return [token.v];
  const abs = token.v.startsWith('/');
  let candidates = [{ path: abs ? '/' : cwd, disp: abs ? '/' : '' }];
  for (const seg of token.v.split('/').filter(Boolean)) candidates = expandSegment(root, candidates, seg);
  const hits = candidates.filter(c => lookup(root, c.path)).map(c => c.disp);
  return hits.length ? hits : [token.v];
}
