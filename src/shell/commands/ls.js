/**
 * ls and dir, following GNU coreutils 9.4 in C.UTF-8: byte-order sorting,
 * column layout on a terminal, shell-escape quoting, the long format with
 * 1K-block totals and the six-month date rule.
 */

import { sizeOf } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames } from '../../backend/tree.js';
import { can } from '../perms.js';
import { ownerLabel, groupLabel } from '../accounts.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { layoutColumns } from '../columns.js';
import { shellQuote, needsQuoting } from '../quote.js';
import { exportedVars } from '../vars.js';
import { result } from '../result.js';
import { esc, span } from '../html.js';
import { MONTHS } from './info.js';

const SHORT = 'aAlh1rFdCtSngoG';
const LONG = {
  '--all': 'a', '--almost-all': 'A', '--human-readable': 'h', '--classify': 'F', '--directory': 'd', '--reverse': 'r',
  '--numeric-uid-gid': 'n', '--no-group': 'G',
};
const SIX_MONTHS_MS = (31556952 / 2) * 1000;
const UNITS = ['K', 'M', 'G', 'T'];

const isExe = node => node.type === 'file' && (node.mode & 0o111) !== 0;
const blocksOf = node => (node.dev ? 0 : node.type === 'dir' ? 4 : Math.ceil(sizeOf(node) / 4096) * 4);

/**
 * Format a size like `ls -h`: whole bytes below 1K, then one decimal below
 * 10 and none above, rounding up.
 *
 * @param {number} bytes A size in bytes.
 * @returns {string} For example `73`, `4.0K`, `11K`, `5.0M`.
 */
export function humanSize(bytes) {
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  let text = String(bytes);
  if (unit >= 0 && Math.ceil(value * 10) / 10 < 10) text = `${(Math.ceil(value * 10) / 10).toFixed(1)}${UNITS[unit]}`;
  else if (unit >= 0 && Math.ceil(value) < 1024) text = `${Math.ceil(value)}${UNITS[unit]}`;
  else if (unit >= 0) text = `1.0${UNITS[unit + 1]}`;
  return text;
}

function modeString(node) {
  if (node.unknown) return `${node.type === 'dir' ? 'd' : '-'}?????????`;
  const m = node.mode;
  const bit = (mask, ch) => (m & mask ? ch : '-');
  const special = (exec, flag, on, off) => {
    if (m & flag) return m & exec ? on : off;
    return bit(exec, 'x');
  };
  let type = node.type === 'dir' ? 'd' : '-';
  if (node.dev) type = 'c';
  return type + bit(0o400, 'r') + bit(0o200, 'w') + special(0o100, 0o4000, 's', 'S')
    + bit(0o040, 'r') + bit(0o020, 'w') + special(0o010, 0o2000, 's', 'S')
    + bit(0o004, 'r') + bit(0o002, 'w') + special(0o001, 0o1000, 't', 'T');
}

function timeString(ms, now) {
  const d = new Date(ms);
  const two = n => String(n).padStart(2, '0');
  const recent = now - SIX_MONTHS_MS < ms && ms <= now;
  const tail = recent ? `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}` : ` ${d.getUTCFullYear()}`;
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${tail}`;
}

function indicator(node, opts) {
  if (!opts.classify) return '';
  if (node.type === 'dir') return '/';
  if (node.unknown) return '';
  return isExe(node) ? '*' : '';
}

function quoteFor(name, opts) {
  if (opts.quoting === 'shell') return shellQuote(name);
  if (opts.quoting === 'escape') return name.replace(/[\\ \t\n]/g, c => ({ '\\': '\\\\', ' ': '\\ ', '\t': '\\t', '\n': '\\n' })[c]);
  return name;
}

function renderName(entry, opts, someQuoted) {
  const quoted = quoteFor(entry.name, opts);
  const pad = opts.align && someQuoted && quoted === entry.name ? ' ' : '';
  const ind = indicator(entry.node, opts);
  let cls = '';
  if (entry.node.type === 'dir' && !entry.node.unknown) cls = 'c-dir';
  else if (isExe(entry.node)) cls = 'c-exe';
  const text = pad + quoted + ind;
  return { text, width: [...text].length, html: pad + (cls ? span(cls, quoted) : esc(quoted)) + ind };
}

function sortEntries(entries, opts) {
  const byName = (a, b) => compareNames(a.name, b.name);
  let cmp = byName;
  if (opts.byTime) cmp = (a, b) => b.node.mtime - a.node.mtime || byName(a, b);
  else if (opts.bySize) cmp = (a, b) => sizeOf(b.node) - sizeOf(a.node) || byName(a, b);
  const sorted = [...entries].sort(cmp);
  return opts.reverse ? sorted.reverse() : sorted;
}

function idCell(label) {
  return { text: label.text, right: label.numeric };
}

function longCells(e, opts, sys, now) {
  if (e.node.unknown) {
    const q = { text: '?', right: false };
    return { mode: modeString(e.node), links: '?', owner: q, group: q, size: '?', time: '?'.padStart(12) };
  }
  return {
    mode: modeString(e.node),
    links: String(e.node.type === 'dir' ? 2 + Object.values(e.node.children).filter(c => c.type === 'dir').length : 1),
    owner: idCell(ownerLabel(sys, e.node.owner, opts.numeric)),
    group: idCell(groupLabel(sys, e.node.group, opts.numeric)),
    size: e.node.dev ? '1, 3' : opts.human ? humanSize(sizeOf(e.node)) : String(sizeOf(e.node)),
    time: timeString(e.node.mtime, now),
  };
}

function longRows(entries, names, opts, ctx) {
  const cells = entries.map(e => longCells(e, opts, ctx.sys, ctx.now));
  const width = key => Math.max(...cells.map(c => (c[key].text ?? c[key]).length));
  const w = { links: width('links'), owner: width('owner'), group: width('group'), size: width('size') };
  const id = (cell, n) => (cell.right ? cell.text.padStart(n) : cell.text.padEnd(n));
  return cells.map((c, i) => {
    const ids = [opts.showOwner && id(c.owner, w.owner), opts.showGroup && id(c.group, w.group)].filter(x => x !== false);
    const prefix = [c.mode, c.links.padStart(w.links), ...ids, c.size.padStart(w.size), c.time, ''].join(' ');
    return { text: `${prefix}${names[i].text}\n`, html: `${esc(prefix)}${names[i].html}\n` };
  });
}

function formatEntries(entries, opts, ctx) {
  const someQuoted = opts.quoting === 'shell' && entries.some(e => needsQuoting(e.name));
  const names = entries.map(e => renderName(e, opts, someQuoted));
  let block;
  if (opts.format === 'long') {
    const rows = longRows(entries, names, opts, ctx);
    block = { text: rows.map(r => r.text).join(''), html: rows.map(r => r.html).join('') };
  } else if (opts.format === 'columns') {
    block = { text: layoutColumns(names, ctx.width), html: layoutColumns(names, ctx.width, 'html') };
  } else {
    block = { text: names.map(n => `${n.text}\n`).join(''), html: names.map(n => `${n.html}\n`).join('') };
  }
  return block;
}

// Without x on a directory, its entries cannot be stat'ed: ls knows only the
// names and whether each is a directory, as readdir tells it.
function needsStat(node, opts) {
  return opts.format === 'long' || opts.byTime || opts.bySize || (opts.classify && node.type !== 'dir');
}

function blindEntries(d, entries, opts, errs) {
  return entries.map(e => {
    if (!needsStat(e.node, opts)) return e;
    const path = d.typed === '.' ? e.name : `${d.typed.replace(/\/+$/, '')}/${e.name}`;
    errs.push(`ls: cannot access ${shellQuote(path, { always: true })}: Permission denied`);
    return { name: e.name, node: { type: e.node.type, unknown: true, children: {} } };
  });
}

function listDirectory(d, opts, ctx, header) {
  const names = Object.keys(d.node.children).filter(nm => opts.all || opts.almost || nm[0] !== '.');
  const dots = opts.all ? [{ name: '.', node: d.node }, { name: '..', node: d.parent }] : [];
  let entries = sortEntries([...dots, ...names.map(nm => ({ name: nm, node: d.node.children[nm] }))], opts);
  const errs = [];
  if (!can(ctx.sys, d.node, 'x')) entries = blindEntries(d, entries, opts, errs);
  const body = formatEntries(entries, opts, ctx);
  let head = header ? `${quoteFor(d.typed, opts)}:\n` : '';
  if (opts.format === 'long') {
    const total = entries.reduce((t, e) => t + (e.node.unknown ? 0 : blocksOf(e.node)), 0);
    head += `total ${opts.human ? humanSize(total * 1024) : total}\n`;
  }
  return { text: head + body.text, html: esc(head) + body.html, errs };
}

function parseLs(name, args, tty) {
  const long = mapLongOptions(name, args, LONG);
  const o = long.err || long.unsimulated ? long : parseOptions(name, long.args, SHORT);
  const failure = optionFailure(name, o, 2);
  if (failure) return { failure };
  const f = o.flags;
  let format = tty || name === 'dir' || f.has('C') ? 'columns' : 'single';
  if (f.has('1')) format = 'single';
  if (['l', 'n', 'g', 'o'].some(c => f.has(c))) format = 'long';
  let quoting = tty ? 'shell' : 'literal';
  if (name === 'dir') quoting = 'escape';
  return {
    operands: o.rest,
    opts: {
      all: f.has('a'), almost: f.has('A'), human: f.has('h'), reverse: f.has('r'), classify: f.has('F'), dirsAsFiles: f.has('d'),
      byTime: f.has('t'), bySize: f.has('S'), format, quoting, align: quoting === 'shell' && format !== 'single',
      numeric: f.has('n'), showOwner: !f.has('g'), showGroup: !f.has('o') && !f.has('G'),
    },
  };
}

function classify(sys, operands, opts) {
  const files = [];
  const dirs = [];
  const errs = [];
  for (const typed of operands) {
    const r = resolve(sys, typed);
    if (r.error) errs.push(`ls: cannot access ${shellQuote(typed, { always: true })}: ${errorText(r.error)}`);
    else if (r.node.type !== 'dir' || opts.dirsAsFiles) files.push({ name: typed, node: r.node });
    else if (!can(sys, r.node, 'r')) errs.push(`ls: cannot open directory ${shellQuote(typed, { always: true })}: Permission denied`);
    else dirs.push({ typed, name: typed, node: r.node, parent: r.parent ?? r.node });
  }
  return { files, dirs, errs };
}

function lineWidth(sys, piped, overlay) {
  const env = parseInt(overlay.COLUMNS ?? exportedVars(sys).COLUMNS, 10);
  let width = sys.columns;
  if (piped) width = env > 0 ? env : 80;
  return width;
}

function listing(name, args, { sys, piped, env }) {
  const parsed = parseLs(name, args, !piped);
  if (parsed.failure) return parsed.failure;
  const { opts } = parsed;
  const operands = parsed.operands.length ? parsed.operands : ['.'];
  const { files, dirs, errs } = classify(sys, operands, opts);
  const ctx = { sys, now: sys.now(), width: lineWidth(sys, piped, env) };
  const sections = [];
  if (files.length) sections.push(formatEntries(sortEntries(files, opts), opts, ctx));
  const header = operands.length > 1 || files.length > 0;
  let minor = [];
  for (const d of sortEntries(dirs, opts)) {
    const listed = listDirectory(d, opts, ctx, header);
    minor = minor.concat(listed.errs);
    sections.push(listed);
  }
  const shown = sections.filter(s => s.text !== '');
  const out = shown.map(s => s.text).join('\n');
  const status = errs.length ? 2 : minor.length ? 1 : 0;
  return result(out, [...errs, ...minor].join('\n'), status, out ? shown.map(s => s.html).join('\n') : null);
}

export default {
  ls: (args, ctx) => listing('ls', args, ctx),
  dir: (args, ctx) => listing('dir', args, ctx),
};
