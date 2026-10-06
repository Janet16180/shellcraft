/**
 * grep, following GNU grep 3.11: basic, extended and fixed patterns, the
 * usual output options, recursion, and its exit statuses (0 a line was
 * selected, 1 none, 2 an error unless -q found a match).
 */

import { joinDisp, splitLines } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames } from '../../backend/tree.js';
import { can } from '../perms.js';
import { compilePosix } from '../regex.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { shellQuote } from '../quote.js';
import { result, needInput } from '../result.js';
import { esc, span } from '../html.js';

const LONG = {
  '--extended-regexp': 'E', '--fixed-strings': 'F', '--basic-regexp': 'G', '--ignore-case': 'i', '--invert-match': 'v',
  '--line-number': 'n', '--count': 'c', '--files-with-matches': 'l', '--files-without-match': 'L', '--no-filename': 'h',
  '--with-filename': 'H', '--recursive': 'r', '--dereference-recursive': 'R', '--no-messages': 's', '--quiet': 'q',
  '--silent': 'q', '--word-regexp': 'w', '--line-regexp': 'x', '--only-matching': 'o', '--null-data': 'z', '--null': 'Z',
};
const USAGE = "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.";
const STDIN = '(standard input)';

function parseGrep(args) {
  const long = mapLongOptions('grep', args, LONG);
  const stoppedEarly = long.err || long.unsimulated;
  const o = stoppedEarly ? { ...long, rest: [], lists: {}, vals: {}, flags: new Set() } : parseOptions('grep', long.args, 'EFGiyvnclLhHrRsqwxozZ', 'em');
  const operands = o.rest;
  let error = o.err?.replace(/\nTry 'grep --help'.*$/, `\n${USAGE}`) ?? null;
  if (!error && !o.unsimulated && !o.lists.e && !operands.length) error = USAGE;
  const patterns = o.lists?.e ?? (operands.length ? [operands.shift()] : []);
  return { error, unsimulated: o.unsimulated, flags: o.flags, max: o.vals?.m === undefined ? Infinity : Number(o.vals.m), operands, patterns: patterns.flatMap(p => p.split('\n')) };
}

function walk(sys, node, label, acc) {
  for (const name of Object.keys(node.children).sort(compareNames)) {
    const child = node.children[name];
    const shown = label === null ? name : joinDisp(label, name);
    const readable = can(sys, child, 'r') && (child.type !== 'dir' || can(sys, child, 'x'));
    if (!readable) acc.errs.push(`grep: ${shellQuote(shown)}: Permission denied`);
    else if (child.type === 'dir') walk(sys, child, shown, acc);
    else acc.sources.push({ label: shown, content: child.content });
  }
}

function addOperand(sys, f, recursive, acc) {
  const r = resolve(sys, f);
  const fail = text => acc.errs.push(`grep: ${shellQuote(f)}: ${text}`);
  if (r.error) fail(errorText(r.error));
  else if (r.node.type === 'dir' && !recursive) fail('Is a directory');
  else if (!can(sys, r.node, 'r')) fail('Permission denied');
  else if (r.node.type === 'dir') walk(sys, r.node, f, acc);
  else acc.sources.push({ label: f, content: r.node.content });
}

function gatherSources(sys, operands, recursive, stdin) {
  const acc = { sources: [], errs: [] };
  if (!operands.length && recursive) walk(sys, resolve(sys, '.').node, null, acc);
  if (!operands.length && !recursive) acc.sources.push({ label: STDIN, content: stdin ?? '' });
  for (const f of operands) {
    if (f === '-') acc.sources.push({ label: STDIN, content: stdin ?? '' });
    else addOperand(sys, f, recursive, acc);
  }
  return acc;
}

function prefix(source, lineNo, opts) {
  let text = '';
  let html = '';
  if (opts.showName) { text += `${source.label}:`; html += `${span('g-file', source.label)}${span('g-sep', ':')}`; }
  if (opts.number) { text += `${lineNo}:`; html += `${span('g-num', String(lineNo))}${span('g-sep', ':')}`; }
  return { text, html };
}

function markMatches(line, re) {
  let html = '';
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (!m[0]) continue;
    html += esc(line.slice(last, m.index)) + span('g-match', m[0]);
    last = m.index + m[0].length;
  }
  return html + esc(line.slice(last));
}

function emitLine(line, pre, re, opts, acc) {
  const matches = opts.only ? [...line.matchAll(re.global)].map(m => m[0]).filter(Boolean) : [];
  for (const m of matches) {
    acc.text += `${pre.text}${m}${opts.sep}`;
    acc.html += `${pre.html}${span('g-match', m)}${opts.sep}`;
  }
  if (opts.only) return;
  const marked = opts.invert ? esc(line) : markMatches(line, re.global);
  acc.text += `${pre.text}${line}${opts.sep}`;
  acc.html += `${pre.html}${marked}${opts.sep}`;
}

function searchSource(source, re, opts, acc) {
  const records = opts.nullData ? source.content.replace(/\0$/, '').split('\0') : splitLines(source.content);
  const silent = opts.quiet || opts.count || opts.listMatches || opts.listMissing || (opts.only && opts.invert);
  let count = 0;
  records.forEach((line, i) => {
    if (count >= opts.max || re.test.test(line) === opts.invert) return;
    count++;
    if (!silent) emitLine(line, prefix(source, i + 1, opts), re, opts, acc);
  });
  return count;
}

function summarize(source, count, opts, acc) {
  const end = opts.nullName ? '\0' : '\n';
  const listed = (opts.listMatches && count > 0) || (opts.listMissing && count === 0);
  if (opts.quiet) return;
  if (opts.count) {
    const line = `${opts.showName ? `${source.label}:` : ''}${count}\n`;
    acc.text += line;
    acc.html += esc(line);
  } else if (listed) {
    acc.text += source.label + end;
    acc.html += span('g-file', source.label) + end;
  }
}

function outputOptions(f, o, sources, recursive) {
  return {
    invert: f.has('v'), number: f.has('n'), count: f.has('c'), listMatches: f.has('l'), listMissing: f.has('L'), quiet: f.has('q'),
    only: f.has('o'), nullData: f.has('z'), nullName: f.has('Z'), max: o.max, sep: f.has('z') ? '\0' : '\n',
    showName: f.has('H') || (!f.has('h') && (sources.length > 1 || o.operands.length > 1 || recursive)),
  };
}

function compileFor({ patterns, flags: f }) {
  return compilePosix(patterns, { extended: f.has('E'), fixed: f.has('F'), ignoreCase: f.has('i') || f.has('y'), word: f.has('w'), line: f.has('x') });
}

function grep(args, { sys, stdin }) {
  const o = parseGrep(args);
  const failed = optionFailure('grep', { err: o.error, unsimulated: o.unsimulated }, 2);
  if (failed) return failed;
  const f = o.flags;
  const recursive = f.has('r') || f.has('R');
  if (!o.operands.length && !recursive && stdin == null) return needInput('grep');
  const compiled = compileFor(o);
  if (compiled.error) return result('', `grep: ${compiled.error}`, 2);
  const { sources, errs } = gatherSources(sys, o.operands, recursive, stdin);
  const opts = outputOptions(f, o, sources, recursive);
  const re = { test: compiled.regex, global: new RegExp(compiled.source, `${compiled.flags}g`) };
  const acc = { text: '', html: '' };
  let selected = false;
  for (const source of sources) {
    const count = searchSource(source, re, opts, acc);
    selected ||= count > 0;
    summarize(source, count, opts, acc);
  }
  const messages = [...(compiled.warning ? [`grep: warning: ${compiled.warning}`] : []), ...(f.has('s') ? [] : errs)];
  const status = errs.length && !(opts.quiet && selected) ? 2 : Number(!selected);
  return result(acc.text, messages.join('\n'), status, acc.text ? acc.html : null);
}

export default { grep };
