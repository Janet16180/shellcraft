/**
 * Tab completion of command names and paths.
 */

import { resolve } from './paths.js';
import { compareNames } from '../backend/tree.js';
import { can } from './perms.js';

const LAST_WORD = /((?:\\.|[^\s\\])*\\?)$/;
const escapeName = name => name.replace(/[\s!"#$&'()*;<=>?[\\\]^`{|}~]/g, '\\$&');
const unescape = word => word.replace(/\\(.)/g, '$1');

function commonPrefix(list) {
  let prefix = list[0];
  for (const s of list) while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

function pathCandidates(sys, word) {
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
  const base = unescape(word.slice(slash + 1));
  const literalDir = unescape(dirPart);
  const lookupPath = literalDir.startsWith('~') ? sys.home + literalDir.slice(1) : literalDir;
  const r = resolve(sys, lookupPath || '.');
  if (r.error || r.node.type !== 'dir' || !can(sys, r.node, 'r')) return [];
  return Object.keys(r.node.children)
    .filter(k => k.startsWith(base) && (base.startsWith('.') || k[0] !== '.'))
    .sort(compareNames)
    .map(k => {
      const child = r.node.children[k];
      const isDir = child.type === 'dir';
      // Like readline, a link to a directory gets no slash until a second Tab.
      const dirLink = child.type === 'symlink' && resolve(sys, `${lookupPath || '.'}/${k}`).node?.type === 'dir';
      const text = dirPart + escapeName(k) + (isDir ? '/' : dirLink ? '' : ' ');
      return { text, show: k + (isDir || dirLink ? '/' : ''), again: dirLink ? `${text}/` : text };
    });
}

/**
 * Complete the last word of a line. A first word (or one after `|`, `;`,
 * `&&`) completes to a command name, anything else to a path. One match is
 * inserted in full; several matches are completed to their common prefix,
 * and listed only when no more can be added.
 *
 * @param {object} sys The machine state.
 * @param {string} line The line typed so far.
 * @param {string[]} commandNames Names a command word can complete to.
 * @returns {{line: string, candidates: string[]}} The completed line and the names to list.
 */
export function complete(sys, line, commandNames) {
  const word = LAST_WORD.exec(line)[1];
  const before = line.slice(0, line.length - word.length);
  const isCommand = !before.trim() || /[|;&]\s*$/.test(before);
  const cands = isCommand && !word.includes('/')
    ? [...new Set([...commandNames, ...Object.keys(sys.aliases)])].filter(k => k.startsWith(word)).sort(compareNames).map(k => ({ text: `${k} `, show: k }))
    : pathCandidates(sys, word);
  const common = cands.length ? commonPrefix(cands.map(c => c.text)) : '';
  let out = { line, candidates: [] };
  if (cands.length === 1) out = { line: before + (cands[0].text === word ? cands[0].again ?? cands[0].text : cands[0].text), candidates: [] };
  else if (common.length > word.length) out = { line: before + common, candidates: [] };
  else if (cands.length > 1) out = { line, candidates: cands.map(c => c.show) };
  return out;
}
