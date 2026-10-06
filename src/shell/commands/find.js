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
import { compareNames } from '../../backend/tree.js';
import { can } from '../perms.js';
import { compileGlob } from '../glob.js';
import { localeQuote } from '../quote.js';
import { result, withNote } from '../result.js';
import { nameTable } from '../table.js';
import { versionText } from '../versions.js';

const UNITS = { c: 1, w: 2, b: 512, k: 1024, M: 1024 ** 2, G: 1024 ** 3 };
const SYSTEM_USERS = ['root', 'daemon', 'bin', 'sys', 'nobody'];
const FIND_HELP = `Usage: find [-H] [-L] [-P] [-Olevel] [-D debugopts] [path...] [expression]

Default path is the current directory; default expression is -print.
Expression may consist of: operators, options, tests, and actions.

Operators (decreasing precedence; -and is implicit where no others are given):
      ( EXPR )   ! EXPR   -not EXPR   EXPR1 -a EXPR2   EXPR1 -and EXPR2
      EXPR1 -o EXPR2   EXPR1 -or EXPR2   EXPR1 , EXPR2

Positional options (always true):
      -daystart -follow -nowarn -regextype -warn

Normal options (always true, specified before other expressions):
      -depth -files0-from FILE -maxdepth LEVELS -mindepth LEVELS
       -mount -noleaf -xdev -ignore_readdir_race -noignore_readdir_race

Tests (N can be +N or -N or N):
      -amin N -anewer FILE -atime N -cmin N -cnewer FILE -context CONTEXT
      -ctime N -empty -false -fstype TYPE -gid N -group NAME -ilname PATTERN
      -iname PATTERN -inum N -iwholename PATTERN -iregex PATTERN
      -links N -lname PATTERN -mmin N -mtime N -name PATTERN -newer FILE
      -nouser -nogroup -path PATTERN -perm [-/]MODE -regex PATTERN
      -readable -writable -executable
      -wholename PATTERN -size N[bcwkMG] -true -type [bcdpflsD] -uid N
      -used N -user NAME -xtype [bcdpfls]

Actions:
      -delete -print0 -printf FORMAT -fprintf FILE FORMAT -print 
      -fprint0 FILE -fprint FILE -ls -fls FILE -prune -quit
      -exec COMMAND ; -exec COMMAND {} + -ok COMMAND ;
      -execdir COMMAND ; -execdir COMMAND {} + -okdir COMMAND ;

Other common options:
      --help                   display this help and exit
      --version                output version information and exit

Valid arguments for -D:
exec, opt, rates, search, stat, time, tree, all, help
Use '-D help' for a description of the options, or see find(1)

Please see also the documentation at https://www.gnu.org/software/findutils/.
You can report (and track progress on fixing) bugs in the "find"
program via the GNU findutils bug-reporting page at
https://savannah.gnu.org/bugs/?group=findutils or, if
you have no web access, by sending email to <bug-findutils@gnu.org>.`;
const INFO = new Map([['-help', 'help'], ['--help', 'help'], ['-version', 'version'], ['--version', 'version']]);
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

const MAX_GROUPS = 256;
const endsAnd = t => t === undefined || t === '-o' || t === '-or' || t === ')';
const done = st => st.error !== null || st.info !== null || st.tooDeep;

function fail(st, message) {
  if (!st.tooDeep) st.error ??= message;
  return () => false;
}

function group(st) {
  st.groups++;
  if (st.groups > MAX_GROUPS) st.tooDeep = true;
  const inner = st.tooDeep ? () => false : or(st);
  st.groups--;
  const closed = st.tokens[st.i] === ')';
  if (closed) st.i++;
  return closed || done(st) ? inner : fail(st, "find: invalid expression; I was expecting to find a ')' somewhere but did not see one.");
}

// Like GNU find, -help and -version act as soon as the parser reaches them.
function operand(st) {
  const t = st.tokens[st.i++];
  let test;
  if (t === '(') test = group(st);
  else if (INFO.has(t)) {
    st.info = INFO.get(t);
    test = () => false;
  } else {
    const p = primary(t, st.tokens, st.i, st.ctx);
    st.i += p.used;
    st.prints ||= Boolean(p.prints);
    test = p.error ? fail(st, p.error) : p.test;
  }
  return test;
}

function unary(st) {
  let negated = false;
  while (st.tokens[st.i] === '!' || st.tokens[st.i] === '-not') {
    negated = !negated;
    st.i++;
  }
  const test = operand(st);
  return negated ? e => !test(e) : test;
}

// Chains of -a and -o are kept as flat lists, so a long chain evaluates
// without one call nested inside another for each operator.
function and(st) {
  const tests = [unary(st)];
  while (!endsAnd(st.tokens[st.i]) && !done(st)) {
    if (st.tokens[st.i] === '-a' || st.tokens[st.i] === '-and') st.i++;
    tests.push(unary(st));
  }
  return tests.length === 1 ? tests[0] : e => tests.every(test => test(e));
}

function or(st) {
  const tests = [and(st)];
  while ((st.tokens[st.i] === '-o' || st.tokens[st.i] === '-or') && !done(st)) {
    st.i++;
    tests.push(and(st));
  }
  return tests.length === 1 ? tests[0] : e => tests.some(test => test(e));
}

function parseExpression(tokens, ctx) {
  const st = { tokens, ctx, i: 0, error: null, info: null, tooDeep: false, prints: false, groups: 0 };
  const test = tokens.length ? or(st) : () => true;
  if (!done(st) && st.i < tokens.length) st.error = `find: unknown predicate \`${tokens[st.i]}'`;
  return { test, prints: st.prints, error: st.error, info: st.info, tooDeep: st.tooDeep };
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
  if (parsed.tooDeep) return withNote(result('', '', 1), `Real find accepts deeper nesting, but the game stops at ${MAX_GROUPS} levels of parentheses.`);
  if (parsed.error) return result('', parsed.error, 1);
  if (parsed.info) return result(parsed.info === 'help' ? `${FIND_HELP}\n` : versionText('find'));
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
