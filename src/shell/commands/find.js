/**
 * find, following GNU findutils 4.9: starting points, then an expression of
 * tests (-name -iname -type -empty -size -user -perm), operators (! -not -a
 * -o and parentheses) and -print, plus the global -mindepth and -maxdepth.
 *
 * The real find lists a directory in the order the filesystem returns its
 * entries; the simulator uses name order.
 */

import { joinDisp, sizeOf } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames } from '../collate.js';
import { can } from '../perms.js';
import { compileGlob } from '../glob.js';
import { localeQuote } from '../quote.js';
import { result } from '../result.js';
import { nameTable } from '../table.js';

const UNITS = { c: 1, w: 2, b: 512, k: 1024, M: 1024 ** 2, G: 1024 ** 3 };
const SYSTEM_USERS = ['root', 'daemon', 'bin', 'sys', 'nobody'];
const WITH_VALUE = new Set(['-name', '-iname', '-type', '-size', '-user', '-group', '-perm', '-maxdepth', '-mindepth']);

function compare(spec, value) {
  if (spec.startsWith('+')) return value > Number(spec.slice(1));
  if (spec.startsWith('-')) return value < Number(spec.slice(1));
  return value === Number(spec);
}

function sizeTest(v) {
  const m = /^([+-]?\d+)([cwbkMG]?)$/.exec(v);
  if (!m) return { error: `find: invalid -size type ${localeQuote(v)}` };
  const unit = UNITS[m[2] || 'b'];
  return { test: e => compare(m[1], Math.ceil(sizeOf(e.node) / unit)) };
}

function permTest(v) {
  const m = /^([-/]?)([0-7]{1,4})$/.exec(v);
  if (!m) return { error: `find: invalid mode ${localeQuote(v)}` };
  const mode = parseInt(m[2], 8);
  const tests = { '': e => (e.node.mode & 0o7777) === mode, '-': e => (e.node.mode & mode) === mode, '/': e => mode === 0 || (e.node.mode & mode) !== 0 };
  return { test: tests[m[1]] };
}

const isEmpty = e => (e.node.type === 'dir' ? Object.keys(e.node.children).length === 0 : sizeOf(e.node) === 0);

const PRIMARIES = nameTable({
  '-name': v => { const re = compileGlob(v); return { test: e => re.test(e.name) }; },
  '-iname': v => { const re = compileGlob(v, { ignoreCase: true }); return { test: e => re.test(e.name) }; },
  '-type': v => (v === 'f' || v === 'd' ? { test: e => e.node.type === (v === 'd' ? 'dir' : 'file') } : { error: `find: Unknown argument to -type: ${v}` }),
  '-user': (v, ctx) => (ctx.users.has(v) ? { test: e => e.node.owner === v } : { error: `find: ${localeQuote(v)} is not the name of a known user` }),
  '-group': v => ({ test: e => e.node.group === v }),
  '-size': sizeTest,
  '-perm': permTest,
  '-empty': () => ({ test: isEmpty }),
  '-print': (_v, ctx) => ({ test: e => ctx.out.push(e.shown) > 0, prints: true }),
  '-true': () => ({ test: () => true }),
  '-false': () => ({ test: () => false }),
});

function depthOption(t, v, ctx) {
  let p;
  if (v === undefined) p = { error: `find: missing argument to \`${t}'` };
  else if (!/^\d+$/.test(v)) p = { error: `find: Expected a positive decimal integer argument to ${t}, but got ${localeQuote(v)}` };
  else {
    ctx[t === '-maxdepth' ? 'maxDepth' : 'minDepth'] = Number(v);
    p = { test: () => true };
  }
  return p;
}

function primary(t, tokens, i, ctx) {
  const v = WITH_VALUE.has(t) ? tokens[i] : undefined;
  const used = WITH_VALUE.has(t) ? 1 : 0;
  let p;
  if (t === '-maxdepth' || t === '-mindepth') p = depthOption(t, v, ctx);
  else if (WITH_VALUE.has(t) && v === undefined) p = { error: `find: missing argument to \`${t}'` };
  else if (PRIMARIES[t]) p = PRIMARIES[t](v, ctx);
  else p = { error: t === undefined ? 'find: invalid expression' : `find: unknown predicate \`${t}'` };
  return { ...p, used };
}

function parseExpression(tokens, ctx) {
  let i = 0;
  let error = null;
  let prints = false;
  const fail = message => {
    error ??= message;
    return () => false;
  };
  const group = () => {
    const inner = or();
    return tokens[i++] === ')' ? inner : fail("find: invalid expression; I was expecting to find a ')' somewhere but did not see one.");
  };
  const unary = () => {
    const t = tokens[i++];
    if (t === '!' || t === '-not') { const inner = unary(); return e => !inner(e); }
    if (t === '(') return group();
    const p = primary(t, tokens, i, ctx);
    i += p.used;
    prints ||= Boolean(p.prints);
    return p.error ? fail(p.error) : p.test;
  };
  const and = () => {
    let left = unary();
    while (i < tokens.length && tokens[i] !== '-o' && tokens[i] !== '-or' && tokens[i] !== ')' && !error) {
      if (tokens[i] === '-a' || tokens[i] === '-and') i++;
      const l = left;
      const r = unary();
      left = e => l(e) && r(e);
    }
    return left;
  };
  const or = () => {
    let left = and();
    while ((tokens[i] === '-o' || tokens[i] === '-or') && !error) {
      i++;
      const l = left;
      const r = and();
      left = e => l(e) || r(e);
    }
    return left;
  };
  const test = tokens.length ? or() : () => true;
  if (!error && i < tokens.length) error = `find: unknown predicate \`${tokens[i]}'`;
  return { test, prints, error };
}

function visit(sys, entry, depth, ctx) {
  const readable = entry.node.type !== 'dir' || (can(sys, entry.node, 'r') && can(sys, entry.node, 'x'));
  if (depth >= ctx.minDepth && ctx.test(entry) && !ctx.prints) ctx.out.push(entry.shown);
  if (entry.node.type !== 'dir' || depth >= ctx.maxDepth) return;
  if (!readable) { ctx.errs.push(`find: ${localeQuote(entry.shown)}: Permission denied`); return; }
  for (const name of Object.keys(entry.node.children).sort(compareNames)) {
    visit(sys, { name, node: entry.node.children[name], shown: joinDisp(entry.shown, name) }, depth + 1, ctx);
  }
}

function find(args, { sys }) {
  let k = 0;
  while (k < args.length && !args[k].startsWith('-') && args[k] !== '!' && args[k] !== '(') k++;
  const starts = k ? args.slice(0, k) : ['.'];
  const users = new Set([...SYSTEM_USERS, sys.user]);
  const ctx = { out: [], errs: [], maxDepth: Infinity, minDepth: 0, users };
  const parsed = parseExpression(args.slice(k), ctx);
  if (parsed.error) return result('', parsed.error, 1);
  Object.assign(ctx, { test: parsed.test, prints: parsed.prints });
  for (const start of starts) {
    const r = resolve(sys, start);
    const base = r.abs === '/' ? '/' : r.abs.slice(r.abs.lastIndexOf('/') + 1);
    if (r.error) ctx.errs.push(`find: ${localeQuote(start)}: ${errorText(r.error)}`);
    else visit(sys, { name: start === '.' ? '.' : base, node: r.node, shown: start }, 0, ctx);
  }
  return result(ctx.out.map(p => `${p}\n`).join(''), ctx.errs.join('\n'), ctx.errs.length ? 1 : 0);
}

export default { find };
