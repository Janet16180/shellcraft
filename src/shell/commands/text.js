/**
 * Text tools: head, tail, wc, grep, find, sort, uniq.
 */

import { lookup, normalize, baseName, joinDisp, splitLines, byteLength } from '../fs.js';
import { compareNames } from '../collate.js';
import { can } from '../perms.js';
import { compileGlob } from '../glob.js';
import { parseOptions } from '../options.js';
import { result, withNote, needInput } from '../result.js';
import { esc, span } from '../html.js';
import { readSources } from './files.js';

const errResult = (out, errs, failStatus = 1) => result(out, errs.join('\n'), errs.length ? failStatus : 0);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function readOne(sys, which, f, stdin) {
  const node = f === '-' ? null : lookup(sys.root, normalize(f, sys.cwd));
  let content = null;
  let error = null;
  if (f === '-') content = stdin ?? '';
  else if (!node) error = `${which}: cannot open '${f}' for reading: No such file or directory`;
  else if (node.type === 'dir') error = `${which}: error reading '${f}': Is a directory`;
  else if (!can(sys, node, 'r')) error = `${which}: cannot open '${f}' for reading: Permission denied`;
  else content = node.content;
  return { content, error };
}

function selectLines(which, lines, count, fromStart) {
  let sel;
  if (which === 'head') sel = lines.slice(0, count);
  else if (fromStart) sel = lines.slice(Math.max(0, count - 1));
  else sel = count === 0 ? [] : lines.slice(-count);
  return sel;
}

function headTail(which, rawArgs, { sys, stdin }) {
  const args = rawArgs.flatMap(x => (/^-\d+$/.test(x) ? ['-n', x.slice(1)] : [x]));
  const o = parseOptions(which, args, 'qv', 'n');
  if (o.err) return result('', o.err, 1);
  let raw = o.vals.n ?? '10';
  const fromStart = which === 'tail' && raw.startsWith('+');
  if (fromStart) raw = raw.slice(1);
  if (!/^\d+$/.test(raw)) return result('', `${which}: invalid number of lines: '${o.vals.n}'`, 1);
  if (!o.rest.length && stdin == null) return needInput(which);
  const files = o.rest.length ? o.rest : ['-'];
  const errs = [];
  let out = '';
  files.forEach((f, idx) => {
    const { content, error } = readOne(sys, which, f, stdin);
    if (error) { errs.push(error); return; }
    if (files.length > 1) out += `${idx ? '\n' : ''}==> ${f} <==\n`;
    out += selectLines(which, splitLines(content), parseInt(raw, 10), fromStart).map(l => `${l}\n`).join('');
  });
  return errResult(out, errs);
}

function tail(args, ctx) {
  const r = headTail('tail', args.filter(x => x !== '-f'), ctx);
  return args.includes('-f') ? withNote(r, 'tail -f would keep running and print new lines as the file grows (Ctrl+C stops it). The game prints once.') : r;
}

function wc(args, { sys, stdin }) {
  const o = parseOptions('wc', args, 'lwcm');
  if (o.err) return result('', o.err, 1);
  let fields = ['l', 'w', 'c'].filter(k => o.flags.has(k) || (k === 'c' && o.flags.has('m')));
  if (!fields.length) fields = ['l', 'w', 'c'];
  if (!o.rest.length && stdin == null) return needInput('wc');
  const fromStdin = !o.rest.length;
  const { out, errs } = readSources(sys, 'wc', fromStdin ? ['-'] : o.rest, stdin);
  const rows = out.map(s => ({
    label: fromStdin ? '' : s.label,
    l: (s.content.match(/\n/g) || []).length,
    w: s.content.split(/\s+/).filter(Boolean).length,
    c: byteLength(s.content),
  }));
  if (rows.length > 1) {
    const sum = k => rows.reduce((t, r) => t + r[k], 0);
    rows.push({ label: 'total', l: sum('l'), w: sum('w'), c: sum('c') });
  }
  let width = Math.max(1, ...rows.flatMap(r => fields.map(k => String(r[k]).length)));
  if (fields.length === 1 && rows.length === 1) width = 0;
  if (fromStdin && fields.length > 1) width = 7;
  const text = rows.map(r => fields.map(k => String(r[k]).padStart(width)).join(' ') + (r.label ? ` ${r.label}` : '')).join('\n');
  return errResult(text ? `${text}\n` : '', errs);
}

function grepSources(sys, files, recursive, stdin) {
  const sources = [];
  const errs = [];
  const walk = (node, label) => {
    for (const k of Object.keys(node.children).sort(compareNames)) {
      const child = node.children[k];
      const shown = label ? joinDisp(label, k) : k;
      if (child.type === 'dir') walk(child, shown);
      else sources.push({ label: shown, content: child.content });
    }
  };
  const defaulted = !files.length && recursive;
  if (!files.length && !recursive) sources.push({ label: '(standard input)', content: stdin });
  for (const f of defaulted ? ['.'] : files) {
    const node = lookup(sys.root, normalize(f, sys.cwd));
    if (!node) errs.push(`grep: ${f}: No such file or directory`);
    else if (node.type === 'dir' && recursive) walk(node, defaulted ? '' : f);
    else if (node.type === 'dir') errs.push(`grep: ${f}: Is a directory`);
    else if (!can(sys, node, 'r')) errs.push(`grep: ${f}: Permission denied`);
    else sources.push({ label: f, content: node.content });
  }
  return { sources, errs };
}

function grepPattern(pat, flags) {
  let source = pat;
  try {
    new RegExp(source);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    source = escapeRe(pat);
  }
  if (flags.has('w')) source = `\\b(?:${source})\\b`;
  return { test: new RegExp(source, flags.has('i') ? 'i' : ''), highlight: new RegExp(source, flags.has('i') ? 'gi' : 'g') };
}

function grepMatches(s, re, f, showName, acc) {
  let count = 0;
  splitLines(s.content).forEach((line, i) => {
    if (re.test.test(line) === f.has('v')) return;
    count++;
    if (f.has('c') || f.has('l')) return;
    let t = '';
    let h = '';
    if (showName) { t += `${s.label}:`; h += `${span('g-file', s.label)}${span('g-sep', ':')}`; }
    if (f.has('n')) { t += `${i + 1}:`; h += `${span('g-num', String(i + 1))}${span('g-sep', ':')}`; }
    acc.text.push(t + line);
    acc.html.push(h + (f.has('v') ? esc(line) : esc(line).replace(re.highlight, m => `<span class="g-match">${m}</span>`)));
  });
  return count;
}

function grep(args, { sys, stdin }) {
  const usage = "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.";
  const o = parseOptions('grep', args, 'invcrRlwEHh');
  if (o.err) return result('', o.err.replace("Try 'grep --help'", "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help'"), 2);
  if (!o.rest.length) return result('', usage, 2);
  const f = o.flags;
  const recursive = f.has('r') || f.has('R');
  const files = o.rest.slice(1);
  if (!files.length && !recursive && stdin == null) return needInput('grep');
  const re = grepPattern(o.rest[0], f);
  const { sources, errs } = grepSources(sys, files, recursive, stdin);
  let showName = sources.length > 1 || recursive;
  if (f.has('h')) showName = false;
  if (f.has('H')) showName = true;
  const acc = { text: [], html: [] };
  let any = false;
  for (const s of sources) {
    const count = grepMatches(s, re, f, showName, acc);
    any ||= count > 0;
    const counted = `${showName ? `${s.label}:` : ''}${count}`;
    if (f.has('c')) { acc.text.push(counted); acc.html.push(esc(counted)); }
    else if (f.has('l') && count) { acc.text.push(s.label); acc.html.push(span('g-file', s.label)); }
  }
  let status = any ? 0 : 1;
  if (errs.length) status = 2;
  const out = acc.text.length ? `${acc.text.join('\n')}\n` : '';
  return result(out, errs.join('\n'), status, out ? `${acc.html.join('\n')}\n` : null);
}

function findArgs(args) {
  const paths = [];
  const tests = [];
  let i = 0;
  let maxDepth = Infinity;
  let error = null;
  while (i < args.length && !args[i].startsWith('-')) paths.push(args[i++]);
  while (i < args.length && !error) {
    const t = args[i++];
    const v = args[i++];
    if ((t === '-name' || t === '-iname') && v !== undefined) {
      const re = compileGlob(v, { ignoreCase: t === '-iname' });
      tests.push(e => re.test(e.name));
    } else if (t === '-type' && (v === 'f' || v === 'd')) tests.push(e => e.node.type === (v === 'd' ? 'dir' : 'file'));
    else if (t === '-type' && v !== undefined) error = `find: Unknown argument to -type: ${v}`;
    else if (t === '-maxdepth' && /^\d+$/.test(v ?? '')) maxDepth = parseInt(v, 10);
    else if (t === '-maxdepth') error = `find: Expected a positive decimal integer argument to -maxdepth, but got '${v ?? ''}'`;
    else if (['-name', '-iname', '-type'].includes(t)) error = `find: missing argument to \`${t}'`;
    else error = `find: unknown predicate \`${t}'`;
  }
  return { paths: paths.length ? paths : ['.'], tests, maxDepth, error };
}

function find(args, { sys }) {
  const { paths, tests, maxDepth, error } = findArgs(args);
  if (error) return result('', error, 1);
  const out = [];
  const errs = [];
  const visit = (shown, node, name, depth) => {
    if (tests.every(t => t({ name, node }))) out.push(shown);
    if (node.type !== 'dir' || depth >= maxDepth) return;
    for (const k of Object.keys(node.children).sort(compareNames)) visit(joinDisp(shown, k), node.children[k], k, depth + 1);
  };
  for (const p of paths) {
    const abs = normalize(p, sys.cwd);
    const node = lookup(sys.root, abs);
    if (!node) errs.push(`find: '${p}': No such file or directory`);
    else visit(p, node, p === '.' ? '.' : baseName(abs) || '/', 0);
  }
  return errResult(out.length ? `${out.join('\n')}\n` : '', errs);
}

function linesFrom(sys, name, files, stdin) {
  if (!files.length) return { lines: splitLines(stdin ?? ''), errs: [] };
  const { out, errs } = readSources(sys, name, files, stdin);
  return { lines: out.flatMap(s => splitLines(s.content)), errs };
}

function sort(args, { sys, stdin }) {
  const o = parseOptions('sort', args, 'rnuf');
  if (o.err) return result('', o.err, 2);
  if (!o.rest.length && stdin == null) return needInput('sort');
  const src = linesFrom(sys, 'sort', o.rest, stdin);
  const f = o.flags;
  const text = (x, y) => (f.has('f') ? x.toLowerCase().localeCompare(y.toLowerCase()) : x.localeCompare(y));
  const cmp = f.has('n') ? (x, y) => (parseFloat(x) || 0) - (parseFloat(y) || 0) || x.localeCompare(y) : text;
  let lines = [...src.lines].sort(cmp);
  if (f.has('r')) lines.reverse();
  if (f.has('u')) lines = lines.filter((l, i) => i === 0 || cmp(l, lines[i - 1]) !== 0);
  const errs = src.errs.map(e => e.replace(/^sort: (.*): No such file or directory$/, 'sort: cannot read: $1: No such file or directory'));
  return errResult(lines.length ? `${lines.join('\n')}\n` : '', errs, 2);
}

function uniq(args, { sys, stdin }) {
  const o = parseOptions('uniq', args, 'cdui');
  if (o.err) return result('', o.err, 1);
  if (!o.rest.length && stdin == null) return needInput('uniq');
  const src = linesFrom(sys, 'uniq', o.rest.slice(0, 1), stdin);
  const same = (x, y) => (o.flags.has('i') ? x.toLowerCase() === y.toLowerCase() : x === y);
  const groups = [];
  for (const line of src.lines) {
    const g = groups[groups.length - 1];
    if (g && same(g.line, line)) g.n++;
    else groups.push({ line, n: 1 });
  }
  let sel = groups;
  if (o.flags.has('d')) sel = sel.filter(g => g.n > 1);
  if (o.flags.has('u')) sel = sel.filter(g => g.n === 1);
  const text = sel.map(g => (o.flags.has('c') ? `${String(g.n).padStart(7)} ` : '') + g.line).join('\n');
  return errResult(text ? `${text}\n` : '', src.errs);
}

export default {
  head: (args, ctx) => headTail('head', args, ctx),
  tail,
  wc,
  grep,
  find,
  sort,
  uniq,
};
