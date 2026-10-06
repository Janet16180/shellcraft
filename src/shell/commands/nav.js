/**
 * Moving around and looking: cd, ls, tree.
 */

import { lookup, normalize, parentOf, sizeOf } from '../fs.js';
import { compareNames } from '../collate.js';
import { can } from '../perms.js';
import { parseOptions } from '../options.js';
import { result, withNote } from '../result.js';
import { esc, span } from '../html.js';
import { MONTHS } from './info.js';
import { setVar } from '../vars.js';

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
  let target = args[0] ?? sys.home;
  const back = target === '-';
  if (back && !sys.oldpwd) return result('', 'bash: cd: OLDPWD not set', 1);
  if (back) target = sys.oldpwd;
  const p = normalize(target, sys.cwd);
  const node = lookup(sys.root, p);
  let r = result(back ? `${p}\n` : '');
  if (!node) r = result('', `bash: cd: ${args[0]}: No such file or directory`, 1);
  else if (node.type !== 'dir') r = result('', `bash: cd: ${args[0]}: Not a directory`, 1);
  else if (!can(sys, node, 'x')) r = result('', `bash: cd: ${args[0]}: Permission denied`, 1);
  else {
    sys.oldpwd = sys.cwd;
    sys.cwd = p;
    setVar(sys, 'OLDPWD', sys.oldpwd, true);
    setVar(sys, 'PWD', p, true);
  }
  return r;
}

function formatTime(ms) {
  const d = new Date(ms);
  const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${hm}`;
}

function modeString(node) {
  let s = node.type === 'dir' ? 'd' : '-';
  for (let i = 0; i < 9; i++) s += node.mode & (1 << (8 - i)) ? 'rwxrwxrwx'[i] : '-';
  return s;
}

const humanSize = size => (size < 1024 ? String(size) : `${(size / 1024).toFixed(1)}K`);
const linkCount = node => (node.type === 'dir' ? 2 + Object.values(node.children).filter(c => c.type === 'dir').length : 1);

function formatShort(ents, { classify, oneColumn }) {
  const sep = oneColumn ? '\n' : '  ';
  return {
    text: ents.map(e => e.name + (classify ? indicator(e.node) : '')).join(sep),
    html: ents.map(e => nameHTML(e.name, e.node, classify)).join(sep),
  };
}

function formatLong(ents, { classify, human }) {
  const sizes = ents.map(e => (human ? humanSize(sizeOf(e.node)) : String(sizeOf(e.node))));
  const width = Math.max(1, ...sizes.map(s => s.length));
  const rows = ents.map((e, i) => {
    const n = e.node;
    const pre = `${modeString(n)} ${String(linkCount(n)).padStart(2)} ${n.owner} ${n.group} ${sizes[i].padStart(width)} ${formatTime(n.mtime)} `;
    return { text: pre + e.name + (classify ? indicator(n) : ''), html: esc(pre) + nameHTML(e.name, n, classify) };
  });
  return { text: rows.map(r => r.text).join('\n'), html: rows.map(r => r.html).join('\n') };
}

function formatEntries(ents, opts) {
  const ordered = opts.reverse ? [...ents].reverse() : ents;
  return opts.long ? formatLong(ordered, opts) : formatShort(ordered, opts);
}

function listDirectory(d, opts, many) {
  const names = Object.keys(d.node.children).filter(nm => opts.all || opts.almost || nm[0] !== '.').sort(compareNames);
  const ents = names.map(nm => ({ name: nm, node: d.node.children[nm] }));
  if (opts.all) ents.unshift({ name: '.', node: d.node }, { name: '..', node: d.parent });
  const body = formatEntries(ents, opts);
  const head = many ? `${d.typed}:\n` : '';
  const total = opts.long ? `total ${ents.length * 4}${opts.human ? 'K' : ''}\n` : '';
  return { text: head + total + body.text, html: esc(head + total) + body.html };
}

function lsOptions(flags, piped) {
  return {
    all: flags.has('a'), almost: flags.has('A'), long: flags.has('l'), classify: flags.has('F'),
    human: flags.has('h'), reverse: flags.has('r'), oneColumn: flags.has('1') || piped, dirsAsFiles: flags.has('d'),
  };
}

function ls(args, { sys, piped }) {
  const o = parseOptions('ls', args, 'alAh1rFd');
  if (o.err) return result('', o.err, 2);
  const opts = lsOptions(o.flags, piped);
  const targets = o.rest.length ? o.rest : ['.'];
  const files = [];
  const dirs = [];
  const errs = [];
  for (const t of targets) {
    const p = normalize(t, sys.cwd);
    const node = lookup(sys.root, p);
    if (!node) errs.push(`ls: cannot access '${t}': No such file or directory`);
    else if (node.type !== 'dir' || opts.dirsAsFiles) files.push({ name: t, node });
    else if (!can(sys, node, 'r')) errs.push(`ls: cannot open directory '${t}': Permission denied`);
    else dirs.push({ typed: t, node, parent: lookup(sys.root, parentOf(p)) });
  }
  const sections = [];
  if (files.length) sections.push(formatEntries(files, opts));
  for (const d of dirs) sections.push(listDirectory(d, opts, targets.length > 1));
  const shown = sections.filter(s => s.text);
  const text = shown.map(s => s.text).join('\n\n');
  const html = text ? `${shown.map(s => s.html).join('\n\n')}\n` : null;
  return result(text ? `${text}\n` : '', errs.join('\n'), errs.length ? 2 : 0, html);
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

export default { cd, ls, tree };
