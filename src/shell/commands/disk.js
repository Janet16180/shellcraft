/**
 * du and df, following coreutils 9.4. du adds up the 4 KiB blocks a tree
 * uses, as on ext4 (a directory takes one, a short symbolic link none, a
 * file with more than one name counts once). df prints the filesystems of
 * a fixed, believable machine: a small virtual disk with Ubuntu 24.04.
 */

import { joinDisp } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames, isInside } from '../../backend/tree.js';
import { can } from '../perms.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { shellQuote, localeQuote } from '../quote.js';
import { result } from '../result.js';
import { blocksOf, humanSize } from './ls.js';

const q = name => shellQuote(name, { always: true });
const DU_LONG = { '--summarize': 's', '--human-readable': 'h', '--all': 'a', '--total': 'c', '--max-depth': 'd' };
const DF_LONG = { '--human-readable': 'h', '--print-type': 'T' };
// The machine's filesystems: name, type, 1K-blocks, used, available, mount point.
const FILESYSTEMS = [
  ['tmpfs', 'tmpfs', 201180, 1072, 200108, '/run'],
  ['/dev/sda2', 'ext4', 30787492, 9105456, 20093176, '/'],
  ['tmpfs', 'tmpfs', 1005884, 0, 1005884, '/dev/shm'],
  ['tmpfs', 'tmpfs', 5120, 0, 5120, '/run/lock'],
  ['/dev/sda1', 'vfat', 1098632, 6220, 1092412, '/boot/efi'],
  ['tmpfs', 'tmpfs', 201176, 12, 201164, '/run/user/1000'],
];

function walk(sys, node, shown, depth, acc) {
  if (acc.seen.has(node)) return 0;
  acc.seen.add(node);
  let total = blocksOf(node);
  if (node.type === 'dir' && !can(sys, node, 'r')) acc.errs.push(`du: cannot read directory ${q(shown)}: Permission denied`);
  else if (node.type === 'dir') {
    for (const name of Object.keys(node.children).sort(compareNames)) {
      const path = joinDisp(shown, name);
      if (can(sys, node, 'x')) total += walk(sys, node.children[name], path, depth + 1, acc);
      else acc.errs.push(`du: cannot access ${q(path)}: Permission denied`);
    }
  }
  const listed = node.type === 'dir' || acc.all || depth === 0;
  if (listed && depth <= acc.maxDepth) acc.lines.push([total, shown]);
  return total;
}

function depthError(text, summarize) {
  let error = null;
  if (text !== undefined && !/^\d+$/.test(text)) error = `du: invalid maximum depth ${localeQuote(text)}`;
  else if (summarize && text !== undefined && text !== '0') error = `du: warning: summarizing conflicts with --max-depth=${text}`;
  return error;
}

function du(args, { sys }) {
  const long = mapLongOptions('du', args, DU_LONG, /^$/, 'd');
  const o = long.err || long.unsimulated ? long : parseOptions('du', long.args, 'shack', 'd');
  const failed = optionFailure('du', o, 1);
  if (failed) return failed;
  const depthText = o.vals.d;
  const depthProblem = depthError(depthText, o.flags.has('s'));
  if (depthProblem) return result('', `${depthProblem}\nTry 'du --help' for more information.`, 1);
  const acc = { seen: new Set(), lines: [], errs: [], all: o.flags.has('a'), maxDepth: o.flags.has('s') ? 0 : Number(depthText ?? Infinity) };
  let sum = 0;
  for (const name of o.rest.length ? o.rest : ['.']) {
    const r = resolve(sys, name, { follow: false });
    if (r.error) acc.errs.push(`du: cannot access ${q(name)}: ${errorText(r.error)}`);
    else sum += walk(sys, r.node, name, 0, acc);
  }
  if (o.flags.has('c')) acc.lines.push([sum, 'total']);
  const size = kb => (o.flags.has('h') ? humanSize(kb * 1024) : String(kb));
  return result(acc.lines.map(([kb, name]) => `${size(kb)}\t${name}\n`).join(''), acc.errs.join('\n'), acc.errs.length ? 1 : 0);
}

const percent = (used, avail) => `${used + avail === 0 ? 0 : Math.ceil((100 * used) / (used + avail))}%`;

// GNU df's columns: each as wide as its widest cell, at least as wide as its
// default; the first two aligned left, the numbers right, the last not padded.
function table(rows, typed) {
  const minimum = typed ? [14, 4, 5, 5, 5, 4, 0] : [14, 5, 5, 5, 4, 0];
  const left = typed ? [0, 1] : [0];
  const widths = minimum.map((min, i) => Math.max(min, ...rows.map(row => row[i].length)));
  const cell = (text, i) => {
    if (i === widths.length - 1) return text;
    return left.includes(i) ? text.padEnd(widths[i]) : text.padStart(widths[i]);
  };
  return rows.map(row => `${row.map(cell).join(' ')}\n`).join('');
}

const mountOf = abs => FILESYSTEMS.filter(fs => isInside(abs, fs[5])).sort((a, b) => b[5].length - a[5].length)[0];

function df(args, { sys }) {
  const long = mapLongOptions('df', args, DF_LONG, /^$/);
  const o = long.err || long.unsimulated ? long : parseOptions('df', long.args, 'hT');
  const failed = optionFailure('df', o, 1);
  if (failed) return failed;
  const human = o.flags.has('h');
  const typed = o.flags.has('T');
  const errs = [];
  const chosen = o.rest.length ? [] : FILESYSTEMS;
  for (const name of o.rest) {
    const r = resolve(sys, name);
    if (r.error) errs.push(`df: ${name}: ${errorText(r.error)}`);
    else chosen.push(mountOf(r.abs));
  }
  const size = kb => (human ? humanSize(kb * 1024) : String(kb));
  const head = human ? ['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'] : ['Filesystem', '1K-blocks', 'Used', 'Available', 'Use%', 'Mounted on'];
  const rows = chosen.map(([source, , blocks, used, avail, target]) => [source, size(blocks), size(used), size(avail), percent(used, avail), target]);
  const withType = (row, type) => (typed ? [row[0], type, ...row.slice(1)] : row);
  const all = [withType(head, 'Type'), ...rows.map((row, i) => withType(row, chosen[i][1]))];
  return result(chosen.length ? table(all, typed) : '', errs.join('\n'), errs.length ? 1 : 0);
}

export default { du, df };
