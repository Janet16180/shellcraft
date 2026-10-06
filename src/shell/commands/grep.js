/**
 * grep, following GNU grep 3.11: basic, extended and fixed patterns, the
 * usual output options, recursion, and its exit statuses (0 a line was
 * selected, 1 none, 2 an error unless -q found a match).
 */

import { joinDisp, splitLines } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames } from '../collate.js';
import { can } from '../perms.js';
import { compilePosix } from '../regex.js';
import { shellQuote } from '../quote.js';
import { result, needInput } from '../result.js';
import { esc, span } from '../html.js';

const FLAGS = 'EFGiyvnclLhHrRsqwxozZ';
const WITH_VALUE = 'em';
const LONG = {
  '--extended-regexp': 'E', '--fixed-strings': 'F', '--basic-regexp': 'G', '--ignore-case': 'i', '--invert-match': 'v',
  '--line-number': 'n', '--count': 'c', '--files-with-matches': 'l', '--files-without-match': 'L', '--no-filename': 'h',
  '--with-filename': 'H', '--recursive': 'r', '--dereference-recursive': 'R', '--no-messages': 's', '--quiet': 'q',
  '--silent': 'q', '--word-regexp': 'w', '--line-regexp': 'x', '--only-matching': 'o', '--null-data': 'z', '--null': 'Z',
};
const USAGE = "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.";

function parseGrep(args) {
  const o = { flags: new Set(), patterns: [], max: Infinity, operands: [], error: null };
  let ended = false;
  for (let i = 0; i < args.length && !o.error; i++) {
    const a = args[i];
    if (ended || a === '-' || !a.startsWith('-')) o.operands.push(a);
    else if (a === '--') ended = true;
    else if (a.startsWith('--color') || a.startsWith('--colour')) continue;
    else if (a.startsWith('--')) {
      if (a in LONG) o.flags.add(LONG[a]);
      else o.error = `grep: unrecognized option '${a}'\n${USAGE}`;
    } else {
      for (let j = 1; j < a.length && !o.error; j++) {
        const ch = a[j];
        if (WITH_VALUE.includes(ch)) {
          const v = a.slice(j + 1) || args[++i];
          if (v === undefined) o.error = `grep: option requires an argument -- '${ch}'\n${USAGE}`;
          else if (ch === 'e') o.patterns.push(...v.split('\n'));
          else o.max = Number(v);
          break;
        }
        if (FLAGS.includes(ch)) o.flags.add(ch);
        else o.error = `grep: invalid option -- '${ch}'\n${USAGE}`;
      }
    }
  }
  if (!o.error && !o.patterns.length && !o.operands.length) o.error = USAGE;
  else if (!o.error && !o.patterns.length) o.patterns = o.operands.shift().split('\n');
  return o;
}

function walk(sys, node, label, acc) {
  for (const name of Object.keys(node.children).sort(compareNames)) {
    const child = node.children[name];
    const shown = label === null ? name : joinDisp(label, name);
    if (child.type === 'dir' && can(sys, child, 'r') && can(sys, child, 'x')) walk(sys, child, shown, acc);
    else if (child.type === 'dir') acc.errs.push(`grep: ${shellQuote(shown)}: Permission denied`);
    else if (!can(sys, child, 'r')) acc.errs.push(`grep: ${shellQuote(shown)}: Permission denied`);
    else acc.sources.push({ label: shown, content: child.content });
  }
}

function gatherSources(sys, operands, recursive, stdin) {
  const acc = { sources: [], errs: [] };
  if (!operands.length && !recursive) acc.sources.push({ label: '(standard input)', content: stdin ?? '' });
  const defaulted = !operands.length && recursive;
  for (const f of defaulted ? ['.'] : operands) {
    const r = f === '-' ? null : resolve(sys, f);
    if (f === '-') acc.sources.push({ label: '(standard input)', content: stdin ?? '' });
    else if (r.error) acc.errs.push(`grep: ${shellQuote(f)}: ${errorText(r.error)}`);
    else if (r.node.type === 'dir' && !recursive) acc.errs.push(`grep: ${shellQuote(f)}: Is a directory`);
    else if (r.node.type === 'dir' && !can(sys, r.node, 'r')) acc.errs.push(`grep: ${shellQuote(f)}: Permission denied`);
    else if (r.node.type === 'dir') walk(sys, r.node, defaulted ? null : f, acc);
    else if (!can(sys, r.node, 'r')) acc.errs.push(`grep: ${shellQuote(f)}: Permission denied`);
    else acc.sources.push({ label: f, content: r.node.content });
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

function searchSource(source, regex, global, opts, acc) {
  const records = opts.nullData ? source.content.replace(/\0$/, '').split('\0') : splitLines(source.content);
  const sep = opts.nullData ? '\0' : '\n';
  let count = 0;
  for (let i = 0; i < records.length && count < opts.max; i++) {
    const line = records[i];
    if (regex.test(line) === opts.invert) continue;
    count++;
    if (opts.quiet || opts.count || opts.listMatches || opts.listMissing) continue;
    const pre = prefix(source, i + 1, opts);
    if (opts.only && !opts.invert) {
      for (const m of line.matchAll(global)) {
        if (m[0] === '') continue;
        acc.text += `${pre.text}${m[0]}${sep}`;
        acc.html += `${pre.html}${span('g-match', m[0])}${sep}`;
      }
    } else if (!opts.only) {
      acc.text += `${pre.text}${line}${sep}`;
      acc.html += pre.html + (opts.invert ? esc(line) : esc(line).replace(new RegExp(global.source, global.flags), mm => (mm ? `<span class="g-match">${mm}</span>` : mm))) + sep;
    }
  }
  return count;
}

function summarize(source, count, opts, acc) {
  const name = opts.nullName ? `${source.label}\0` : `${source.label}\n`;
  if (opts.quiet) return;
  if (opts.count) {
    const line = `${opts.showName ? `${source.label}:` : ''}${count}\n`;
    acc.text += line;
    acc.html += esc(line);
  } else if ((opts.listMatches && count) || (opts.listMissing && !count)) {
    acc.text += name;
    acc.html += span('g-file', source.label) + name.slice(source.label.length);
  }
}

function grep(args, { sys, stdin }) {
  const o = parseGrep(args);
  if (o.error) return result('', o.error, 2);
  const f = o.flags;
  const recursive = f.has('r') || f.has('R');
  if (!o.operands.length && !recursive && stdin == null) return needInput('grep');
  const compiled = compilePosix(o.patterns, { extended: f.has('E'), fixed: f.has('F'), ignoreCase: f.has('i') || f.has('y'), word: f.has('w'), line: f.has('x') });
  if (compiled.error) return result('', `grep: ${compiled.error}`, 2);
  const { sources, errs } = gatherSources(sys, o.operands, recursive, stdin);
  const opts = {
    invert: f.has('v'), number: f.has('n'), count: f.has('c'), listMatches: f.has('l'), listMissing: f.has('L'), quiet: f.has('q'),
    only: f.has('o'), nullData: f.has('z'), nullName: f.has('Z'), max: o.max,
    showName: f.has('H') || (!f.has('h') && (sources.length > 1 || o.operands.length > 1 || recursive)),
  };
  const acc = { text: '', html: '' };
  const global = new RegExp(compiled.source, `${compiled.flags}g`);
  let selected = false;
  for (const source of sources) {
    const count = searchSource(source, compiled.regex, global, opts, acc);
    selected ||= count > 0;
    summarize(source, count, opts, acc);
  }
  const warnings = compiled.warning ? [`grep: warning: ${compiled.warning}`] : [];
  const messages = [...warnings, ...(f.has('s') ? [] : errs)];
  let status = selected ? 0 : 1;
  if (errs.length && !(opts.quiet && selected)) status = 2;
  return result(acc.text, messages.join('\n'), status, acc.text ? acc.html : null);
}

export default { grep };
