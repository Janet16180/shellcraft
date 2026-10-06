/**
 * Moving around and looking: cd and tree (ls has its own module).
 */

import { lookup, normalize } from '../fs.js';
import { compareNames } from '../collate.js';
import { can } from '../perms.js';
import { parseOptions } from '../options.js';
import { result, withNote } from '../result.js';
import { esc, span } from '../html.js';
import { setVar, varValue } from '../vars.js';
import { resolve, errorText } from '../paths.js';

const isExe = node => node.type === 'file' && (node.mode & 0o111) !== 0;
const indicator = node => {
  if (node.type === 'dir') return '/';
  return isExe(node) ? '*' : '';
};

/**
 * Markup for one name, coloured like a terminal's ls: blue directories, green executables.
 *
 * @param {string} name The name to show.
 * @param {object} node Its node.
 * @param {boolean} classify Append the -F indicator.
 * @returns {string} The markup.
 */
export function nameHTML(name, node, classify) {
  let cls = '';
  if (node.type === 'dir') cls = 'c-dir';
  else if (isExe(node)) cls = 'c-exe';
  return (cls ? span(cls, name) : esc(name)) + (classify ? indicator(node) : '');
}

function cd(args, { sys }) {
  if (args.length > 1) return result('', 'bash: cd: too many arguments', 1);
  const back = args[0] === '-';
  const home = varValue(sys, 'HOME');
  if (!args.length && !home) return result('', 'bash: cd: HOME not set', 1);
  if (back && !varValue(sys, 'OLDPWD')) return result('', 'bash: cd: OLDPWD not set', 1);
  let target = args[0] ?? home;
  if (back) target = varValue(sys, 'OLDPWD');
  const r = target === '' ? resolve(sys, '.') : resolve(sys, target);
  let res = result(back ? `${r.abs}\n` : '');
  if (r.error) res = result('', `bash: cd: ${target}: ${errorText(r.error)}`, 1);
  else if (r.node.type !== 'dir') res = result('', `bash: cd: ${target}: Not a directory`, 1);
  else if (!can(sys, r.node, 'x')) res = result('', `bash: cd: ${target}: Permission denied`, 1);
  else {
    sys.oldpwd = sys.cwd;
    sys.cwd = r.abs;
    setVar(sys, 'OLDPWD', sys.oldpwd, true);
    setVar(sys, 'PWD', r.abs, true);
  }
  return res;
}

function treeWalk(node, prefix, level, opts, acc) {
  if (level > opts.maxLevel) return;
  const names = Object.keys(node.children)
    .filter(k => (opts.all || k[0] !== '.') && (!opts.dirsOnly || node.children[k].type === 'dir'))
    .sort(compareNames);
  names.forEach((k, i) => {
    const child = node.children[k];
    const last = i === names.length - 1;
    const branch = prefix + (last ? '└── ' : '├── ');
    acc.text.push(branch + k);
    acc.html.push(esc(branch) + nameHTML(k, child, false));
    if (child.type === 'dir') {
      acc.dirs++;
      treeWalk(child, prefix + (last ? '    ' : '│   '), level + 1, opts, acc);
    } else acc.files++;
  });
}

function tree(args, { sys }) {
  const o = parseOptions('tree', args, 'ad', 'L');
  if (o.err) return result('', o.err, 1);
  const top = o.rest[0] || '.';
  const node = lookup(sys.root, normalize(top, sys.cwd));
  if (!node || node.type !== 'dir') return result(`${top}  [error opening dir]\n\n0 directories, 0 files\n`, '', 2);
  const opts = { all: o.flags.has('a'), dirsOnly: o.flags.has('d'), maxLevel: o.vals.L ? parseInt(o.vals.L, 10) : Infinity };
  const acc = { text: [top], html: [span('c-dir', top)], dirs: 0, files: 0 };
  treeWalk(node, '', 1, opts, acc);
  const { dirs, files } = acc;
  const summary = `\n${dirs} director${dirs === 1 ? 'y' : 'ies'}${opts.dirsOnly ? '' : `, ${files} file${files === 1 ? '' : 's'}`}\n`;
  const r = result(`${acc.text.join('\n')}\n${summary}`, '', 0, `${acc.html.join('\n')}\n${summary}`);
  return withNote(r, 'tree is not always installed by default. On Ubuntu: sudo apt install tree');
}

export default { cd, tree };
