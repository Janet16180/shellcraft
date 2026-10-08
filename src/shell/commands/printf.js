/**
 * The printf builtin: a format string with %s, %d and friends, reused until
 * the arguments run out.
 */

import { result, withNote } from '../result.js';
import { setVar } from '../vars.js';
import { echoEscapes } from './info.js';

const USAGE = 'printf: usage: printf [-v var] format [arguments]';
const FORMAT_ESCAPES = { a: '\u0007', b: '\b', e: '\u001b', E: '\u001b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'", '?': '?' };
const SPEC = /%([-+ #0]*)(\d*)(?:\.(\d*))?[hlLqjzt]*(.?)/y;
const NUMBER = /^\s*([+-]?)(0x[0-9a-f]+|0[0-7]*|[1-9]\d*)$/i;
const UNSIMULATED = new Set(['q', 'g', 'G', 'a', 'A']);

function formatEscape(m, e) {
  if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8) & 0xff);
  if (e[0] === 'x' && e.length > 1) return String.fromCharCode(parseInt(e.slice(1), 16));
  return FORMAT_ESCAPES[e] ?? m;
}

const decodeFormat = text => text.replace(/\\([0-7]{1,3}|x[0-9A-Fa-f]{1,2}|.)/g, formatEscape);

/** The integer an argument stands for, and whether it was a valid number. */
function toInteger(arg) {
  if (arg === undefined || arg === '') return { n: 0n, ok: true };
  if (/^['"]/.test(arg)) return { n: BigInt(arg.codePointAt(1) ?? 0), ok: true };
  const m = NUMBER.exec(arg);
  if (m) return { n: (m[1] === '-' ? -1n : 1n) * BigInt(m[2].length > 1 && m[2][0] === '0' && !/x/i.test(m[2]) ? `0o${m[2].slice(1)}` : m[2]), ok: true };
  const prefix = /^\s*[+-]?\d+/.exec(arg);
  return { n: prefix ? BigInt(prefix[0].trim()) : 0n, ok: false };
}

function toFloat(arg) {
  if (arg === undefined || arg === '') return { x: 0, ok: true };
  const x = Number(arg);
  if (!Number.isNaN(x)) return { x, ok: true };
  const prefix = /^\s*[+-]?(\d+\.?\d*|\.\d+)/.exec(arg);
  return { x: prefix ? Number(prefix[0]) : 0, ok: false };
}

function pad(text, flags, width) {
  if (text.length >= width) return text;
  if (flags.includes('-')) return text.padEnd(width);
  return text.padStart(width);
}

function padNumber(digits, sign, flags, width) {
  const zeros = flags.includes('0') && !flags.includes('-') ? Math.max(0, width - sign.length - digits.length) : 0;
  return pad(sign + '0'.repeat(zeros) + digits, flags, width);
}

function integerText(conv, n, flags, width) {
  if ('di'.includes(conv)) {
    const sign = n < 0n ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
    return padNumber(String(n < 0n ? -n : n), sign, flags, width);
  }
  const u = BigInt.asUintN(64, n);
  const digits = { u: u.toString(10), x: u.toString(16), X: u.toString(16).toUpperCase(), o: u.toString(8) }[conv];
  return padNumber(digits, '', flags, width);
}

function floatText(conv, x, flags, width, precision) {
  const p = precision ?? 6;
  let digits = conv === 'f' || conv === 'F' ? Math.abs(x).toFixed(p) : Math.abs(x).toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
  if (conv === 'E') digits = digits.toUpperCase();
  const sign = x < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
  return padNumber(digits, sign, flags, width);
}

/**
 * Convert one argument for one conversion.
 *
 * @returns {{text: string, bad?: string, stop?: boolean}} The text; bad names
 *   an invalid number; stop is set when %b met \c.
 */
function convert(conv, arg, spec) {
  const { flags, width, precision } = spec;
  if (conv === 's') return { text: pad((arg ?? '').slice(0, precision ?? undefined), flags, width) };
  if (conv === 'b') {
    const decoded = echoEscapes(arg ?? '');
    return { text: pad(decoded.text.slice(0, precision ?? undefined), flags, width), stop: decoded.stop };
  }
  if (conv === 'c') return { text: pad((arg ?? '').slice(0, 1), flags, width) };
  if ('fFeE'.includes(conv)) {
    const f = toFloat(arg);
    return { text: floatText(conv, f.x, flags, width, precision), bad: f.ok ? null : arg };
  }
  const i = toInteger(arg);
  return { text: integerText(conv, i.n, flags, width), bad: i.ok ? null : arg };
}

/** One pass over the format, taking arguments from `args` from index `at`. */
function formatOnce(format, args, at) {
  const acc = { out: '', errs: [], used: 0, stop: false, unsimulated: null };
  let i = 0;
  while (i < format.length && !acc.stop) {
    const pct = format.indexOf('%', i);
    acc.out += decodeFormat(format.slice(i, pct < 0 ? undefined : pct));
    if (pct < 0) break;
    SPEC.lastIndex = pct;
    const m = SPEC.exec(format);
    i = SPEC.lastIndex;
    const conv = m[4];
    if (conv === '%') acc.out += '%';
    else if (!conv) [acc.stop, acc.errs] = [true, [...acc.errs, '`%\': missing format character']];
    else if (UNSIMULATED.has(conv)) [acc.stop, acc.unsimulated] = [true, conv];
    else if (!'sbcdiuxXofFeE'.includes(conv)) [acc.stop, acc.errs] = [true, [...acc.errs, `\`${conv}': invalid format character`]];
    else {
      const spec = { flags: m[1], width: Number(m[2] || 0), precision: m[3] === undefined ? null : Number(m[3] || 0) };
      const c = convert(conv, args[at + acc.used], spec);
      acc.used++;
      acc.out += c.text;
      if (c.bad) acc.errs.push(`${c.bad}: invalid number`);
      if (c.stop) acc.stop = true;
    }
  }
  return acc;
}

function printfOptions(args) {
  let i = 0;
  let variable = null;
  if (args[0] === '-v') {
    if (args.length < 2) return { err: `bash: printf: -v: option requires an argument\n${USAGE}` };
    variable = args[1];
    i = 2;
  }
  if (args[i] === '--') i++;
  else if (/^-./.test(args[i] ?? '')) return { err: `bash: printf: ${args[i].slice(0, 2)}: invalid option\n${USAGE}` };
  return { variable, format: args[i], rest: args.slice(i + 1) };
}

function printf(args, { sys }) {
  const o = printfOptions(args);
  if (o.err) return result('', o.err, 2);
  if (o.format === undefined) return result('', USAGE, 2);
  let out = '';
  const errs = [];
  let at = 0;
  let stopped = false;
  let unsimulated = null;
  do {
    const pass = formatOnce(o.format, o.rest, at);
    out += pass.out;
    errs.push(...pass.errs);
    at += pass.used;
    stopped = pass.stop || !pass.used;
    unsimulated = pass.unsimulated;
  } while (at < o.rest.length && !stopped);
  if (unsimulated) return withNote(result(out, '', 1), `printf %${unsimulated} is real, but this game does not simulate it.`);
  if (o.variable) setVar(sys, o.variable, out);
  const err = errs.map(e => `bash: printf: ${e}`).join('\n');
  return result(o.variable ? '' : out, err, errs.length ? 1 : 0);
}

export default { printf };
