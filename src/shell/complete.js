/**
 * Tab completion of command names and paths.
 */

import { lookup, normalize } from './fs.js';
import { compareNames } from './collate.js';
import { can } from './perms.js';

function commonPrefix(list) {
  let prefix = list[0];
  for (const s of list) while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

function pathCandidates(sys, word) {
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
  const base = word.slice(slash + 1);
  const lookupPath = dirPart.startsWith('~') ? sys.home + dirPart.slice(1) : dirPart;
  const node = lookup(sys.root, normalize(lookupPath || '.', sys.cwd));
  if (!node || node.type !== 'dir' || !can(sys, node, 'r')) return [];
  return Object.keys(node.children)
    .filter(k => k.startsWith(base) && (base.startsWith('.') || k[0] !== '.'))
    .sort(compareNames)
    .map(k => {
      const isDir = node.children[k].type === 'dir';
      return { text: dirPart + k + (isDir ? '/' : ' '), show: k + (isDir ? '/' : '') };
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
  const word = /(\S*)$/.exec(line)[1];
  const before = line.slice(0, line.length - word.length);
  const isCommand = !before.trim() || /[|;&]\s*$/.test(before);
  const cands = isCommand && !word.includes('/')
    ? [...new Set([...commandNames, ...Object.keys(sys.aliases)])].filter(k => k.startsWith(word)).sort().map(k => ({ text: `${k} `, show: k }))
    : pathCandidates(sys, word);
  const common = cands.length ? commonPrefix(cands.map(c => c.text)) : '';
  let out = { line, candidates: [] };
  if (cands.length === 1) out = { line: before + cands[0].text, candidates: [] };
  else if (common.length > word.length) out = { line: before + common, candidates: [] };
  else if (cands.length > 1) out = { line, candidates: cands.map(c => c.show) };
  return out;
}
