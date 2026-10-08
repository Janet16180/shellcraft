/**
 * Text tools: head, tail, wc, sort, uniq (grep and find have their own modules).
 */

import { splitLines, byteLength, sizeOf } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames } from '../../backend/tree.js';
import { can } from '../perms.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { shellQuote, localeQuote } from '../quote.js';
import { result, withNote, needInput } from '../result.js';
import { writeFile } from '../redirect.js';

/**
 * Open a file operand for reading, or standard input for `-`.
 *
 * @param {object} sys The machine state.
 * @param {string} f The operand as typed.
 * @param {string|null} stdin Piped input.
 * @returns {{content: string|null, node: object|null, code: string|null}} The content and node,
 *   or an error: an errno code from paths.js, or 'EISDIR' for a directory.
 */
export function openInput(sys, f, stdin) {
  const r = f === '-' ? null : resolve(sys, f);
  let opened;
  if (f === '-') opened = { content: stdin ?? '', node: null, code: null };
  else if (r.error) opened = { content: null, node: null, code: r.error };
  else if (r.node.type === 'dir') opened = { content: null, node: r.node, code: 'EISDIR' };
  else if (!can(sys, r.node, 'r')) opened = { content: null, node: r.node, code: 'EACCES' };
  else opened = { content: r.node.content, node: r.node, code: null };
  return opened;
}

/**
 * @param {string} code An error code from openInput().
 * @returns {string} Its message.
 */
export const reason = code => (code === 'EISDIR' ? 'Is a directory' : errorText(code));

const HEAD_LONG = { '--lines': 'n', '--bytes': 'c', '--quiet': 'q', '--silent': 'q', '--verbose': 'v' };
const TAIL_LONG = { ...HEAD_LONG, '--follow': 'f' };

function headTailArgs(which, typed) {
  const long = mapLongOptions(which, typed, which === 'tail' ? TAIL_LONG : HEAD_LONG, /^$/, 'nc');
  if (long.err || long.unsimulated) return { o: { ...long, flags: new Set(), vals: {}, rest: [] }, error: long.err };
  const rawArgs = long.args;
  const takesValue = i => i > 0 && (rawArgs[i - 1] === '-n' || rawArgs[i - 1] === '-c');
  const args = rawArgs.flatMap((x, i) => {
    if (/^-\d+$/.test(x) && !takesValue(i)) return ['-n', x.slice(1)];
    if (which === 'tail' && /^\+\d+$/.test(x) && !takesValue(i)) return ['-n', x];
    return [x];
  });
  const o = parseOptions(which, args.filter(x => which !== 'tail' || x !== '-f'), 'qv', 'nc');
  const raw = o.vals.c ?? o.vals.n ?? '10';
  const number = raw.replace(/^[+-]/, '');
  let error = o.err;
  if (!error && !/^\d+$/.test(number)) error = `${which}: invalid number of ${o.vals.c === undefined ? 'lines' : 'bytes'}: ${localeQuote(raw)}`;
  return {
    o, error, bytes: o.vals.c !== undefined, count: Number(number), follow: which === 'tail' && rawArgs.includes('-f'),
    fromStart: which === 'tail' && raw.startsWith('+'), allBut: which === 'head' && raw.startsWith('-'),
  };
}

function selectPart(which, text, a) {
  const units = a.bytes ? [...text] : text.split(/(?<=\n)/).filter(Boolean);
  let sel;
  if (which === 'head') sel = a.allBut ? units.slice(0, Math.max(0, units.length - a.count)) : units.slice(0, a.count);
  else if (a.fromStart) sel = units.slice(Math.max(0, a.count - 1));
  else sel = a.count === 0 ? [] : units.slice(-a.count);
  return sel.join('');
}

function readError(which, f, code) {
  const name = shellQuote(f, { always: true });
  return code === 'EISDIR' ? `${which}: error reading ${name}: Is a directory` : `${which}: cannot open ${name} for reading: ${reason(code)}`;
}

function readPart(which, f, a, { sys, stdin }, state) {
  const { content, code } = openInput(sys, f, stdin);
  if (code) state.errs.push(readError(which, f, code));
  if (state.headers && (!code || code === 'EISDIR')) state.out += `${state.printed++ ? '\n' : ''}==> ${f === '-' ? 'standard input' : f} <==\n`;
  if (!code) state.out += selectPart(which, content, a);
}

function headTail(which, args, ctx) {
  const a = headTailArgs(which, args);
  if (a.o.unsimulated) return optionFailure(which, a.o, 1);
  if (a.error) return result('', a.error, 1);
  if (!a.o.rest.length && ctx.stdin == null) return needInput(which);
  const files = a.o.rest.length ? a.o.rest : ['-'];
  const state = { out: '', errs: [], printed: 0, headers: (files.length > 1 && !a.o.flags.has('q')) || a.o.flags.has('v') };
  for (const f of files) readPart(which, f, a, ctx, state);
  const r = result(state.out, state.errs.join('\n'), state.errs.length ? 1 : 0);
  return a.follow ? withNote(r, 'tail -f would keep running and print new lines as the file grows (Ctrl+C stops it). Here it prints once.') : r;
}

const WC_FIELDS = ['l', 'w', 'm', 'c', 'L'];

function wcCounts(text) {
  return {
    l: (text.match(/\n/g) ?? []).length,
    w: text.split(/[ \t\n\v\f\r]+/).filter(Boolean).length,
    m: [...text].length,
    c: byteLength(text),
    L: Math.max(0, ...text.split('\n').map(l => [...l].length)),
  };
}

function wcWidth(inputs, fields) {
  const opened = inputs.filter(i => i.code === null || i.code === 'EISDIR');
  const irregular = opened.some(i => i.name === '-' || i.code === 'EISDIR');
  const total = opened.reduce((t, i) => t + (i.node?.type === 'file' ? sizeOf(i.node) : 0), 0);
  return inputs.length === 1 && fields.length === 1 ? 1 : Math.max(irregular ? 7 : 1, String(total).length);
}

function wcRows(inputs, fields, width, labelled) {
  const row = (counts, label) => `${fields.map(k => String(counts[k]).padStart(width)).join(' ')}${label}\n`;
  const total = { l: 0, w: 0, m: 0, c: 0, L: 0 };
  let out = '';
  for (const input of inputs.filter(i => !i.code || i.code === 'EISDIR')) {
    const counts = wcCounts(input.content ?? '');
    for (const k of WC_FIELDS) total[k] = k === 'L' ? Math.max(total.L, counts.L) : total[k] + counts[k];
    out += row(counts, labelled ? ` ${input.name}` : '');
  }
  return inputs.length > 1 ? out + row(total, ' total') : out;
}

const WC_LONG = { '--lines': 'l', '--words': 'w', '--bytes': 'c', '--chars': 'm', '--max-line-length': 'L' };

function wc(args, { sys, stdin }) {
  const long = mapLongOptions('wc', args, WC_LONG, /^$/);
  const o = long.err || long.unsimulated ? long : parseOptions('wc', long.args, 'lwcmL');
  const failed = optionFailure('wc', o, 1);
  if (failed) return failed;
  if (!o.rest.length && stdin == null) return needInput('wc');
  const chosen = WC_FIELDS.filter(k => o.flags.has(k));
  const fields = chosen.length ? chosen : ['l', 'w', 'c'];
  const inputs = (o.rest.length ? o.rest : ['-']).map(name => ({ name, ...openInput(sys, name, stdin) }));
  const errs = inputs.filter(i => i.code).map(i => `wc: ${shellQuote(i.name)}: ${reason(i.code)}`);
  const out = wcRows(inputs, fields, wcWidth(inputs, fields), o.rest.length > 0);
  return result(out, errs.join('\n'), errs.length ? 1 : 0);
}

function readLines(sys, name, files, stdin, separator) {
  const errs = [];
  let text = '';
  for (const f of files.length ? files : ['-']) {
    const { content, code } = openInput(sys, f, stdin);
    if (code === 'EISDIR') errs.push(`${name}: read failed: ${shellQuote(f)}: Is a directory`);
    else if (code) errs.push(`${name}: cannot read: ${shellQuote(f)}: ${reason(code)}`);
    else text += content && !content.endsWith(separator) ? content + separator : content;
  }
  return { lines: text === '' ? [] : text.slice(0, -1).split(separator), errs };
}

function numericValue(line) {
  const m = /^[ \t]*(-?)(\d*)(?:\.(\d*))?/.exec(line);
  return (m[1] ? -1 : 1) * Number(`${m[2] || '0'}.${m[3] || '0'}`);
}

function sortCompare(flags) {
  const fold = s => (flags.has('f') ? s.replace(/[a-z]/g, c => c.toUpperCase()) : s);
  const blanks = s => (flags.has('b') ? s.replace(/^[ \t]+/, '') : s);
  const key = flags.has('n')
    ? (a, b) => numericValue(a) - numericValue(b)
    : (a, b) => compareNames(fold(blanks(a)), fold(blanks(b)));
  return { key, full: (a, b) => key(a, b) || compareNames(a, b) };
}

function sort(args, { sys, stdin }) {
  const o = parseOptions('sort', args, 'rnufbz');
  const failed = optionFailure('sort', o, 2);
  if (failed) return failed;
  if (!o.rest.length && stdin == null) return needInput('sort');
  const sep = o.flags.has('z') ? '\0' : '\n';
  const { lines, errs } = readLines(sys, 'sort', o.rest, stdin, sep);
  if (errs.length) return result('', errs[0], 2);
  const { key, full } = sortCompare(o.flags);
  const sign = o.flags.has('r') ? -1 : 1;
  let sorted = [...lines].sort((a, b) => sign * full(a, b));
  if (o.flags.has('u')) sorted = sorted.filter((l, i) => i === 0 || key(l, sorted[i - 1]) !== 0);
  return result(sorted.map(l => l + sep).join(''));
}

function uniqGroups(text, ignoreCase) {
  const same = (x, y) => (ignoreCase ? x.toLowerCase() === y.toLowerCase() : x === y);
  const groups = [];
  for (const line of splitLines(text)) {
    const g = groups.at(-1);
    if (g && same(g.line, line)) g.n++;
    else groups.push({ line, n: 1 });
  }
  return groups;
}

function uniq(args, { sys, stdin }) {
  const o = parseOptions('uniq', args, 'cdui');
  const failed = optionFailure('uniq', o, 1);
  if (failed) return failed;
  if (o.rest.length > 2) return result('', `uniq: extra operand ${localeQuote(o.rest[2])}\nTry 'uniq --help' for more information.`, 1);
  if ((o.rest[0] ?? '-') === '-' && stdin == null) return needInput('uniq');
  const input = openInput(sys, o.rest[0] ?? '-', stdin);
  if (input.code) return result('', `uniq: ${shellQuote(o.rest[0])}: ${reason(input.code)}`, 1);
  let sel = uniqGroups(input.content, o.flags.has('i'));
  if (o.flags.has('d')) sel = sel.filter(g => g.n > 1);
  if (o.flags.has('u')) sel = sel.filter(g => g.n === 1);
  const out = sel.map(g => `${o.flags.has('c') ? `${String(g.n).padStart(7)} ` : ''}${g.line}\n`).join('');
  const written = o.rest.length === 2 ? writeFile(sys, o.rest[1], out) : null;
  if (o.rest.length === 2) return written ? result('', `uniq: ${shellQuote(o.rest[1])}: ${written}`, 1) : result();
  return result(out);
}

export default {
  head: (args, ctx) => headTail('head', args, ctx),
  tail: (args, ctx) => headTail('tail', args, ctx),
  wc,
  sort,
  uniq,
};
