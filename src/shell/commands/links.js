/**
 * Links: ln and readlink, following coreutils 9.4. A hard link is a second
 * directory entry for the same node; a symbolic link is a node that holds a
 * path as text.
 */

import { addChild, removeChild, newSymlink, joinDisp } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { baseName, parentOf, joinPath } from '../../backend/tree.js';
import { can, canChangeEntries, canUnlink, newMeta } from '../perms.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { shellQuote } from '../quote.js';
import { result } from '../result.js';

const q = name => shellQuote(name, { always: true });
const tryHelp = name => `Try '${name} --help' for more information.`;
const lastName = path => path.replace(/\/+$/, '').split('/').pop();

const LN_LONG = { '--symbolic': 's', '--force': 'f', '--verbose': 'v', '--no-dereference': 'n' };
const READLINK_LONG = { '--canonicalize': 'f', '--canonicalize-existing': 'e', '--canonicalize-missing': 'm', '--no-newline': 'n' };

// Linux's fs.protected_hardlinks, on in Ubuntu: a file of someone else may be
// hard linked only by a user who may read and write it (and not if setuid).
function mayHardLink(sys, node) {
  const special = (node.mode & 0o4000) !== 0 || (node.mode & 0o2010) === 0o2010;
  return sys.user === 'root' || node.owner === sys.user || (node.type === 'file' && !special && can(sys, node, 'r') && can(sys, node, 'w'));
}

// Which links to make: one operand links into the working directory; a last
// operand that is a directory (followed, unless -n and it is a link) takes the others.
function linkPairs(sys, operands, opts) {
  if (operands.length === 1) return { pairs: [{ source: operands[0], name: `./${lastName(operands[0])}` }] };
  const sources = operands.slice(0, -1);
  const dest = operands.at(-1);
  const d = resolve(sys, dest, { follow: !opts.noDeref });
  const intoDir = d.node?.type === 'dir';
  let plan = { pairs: sources.map(source => ({ source, name: intoDir ? joinDisp(dest, lastName(source)) : dest })) };
  if (sources.length > 1 && !intoDir) plan = { error: `ln: target ${q(dest)}: ${errorText(d.error ?? 'ENOTDIR')}` };
  return plan;
}

function sourceProblem(sys, source, opts) {
  const s = opts.symbolic ? null : resolve(sys, source, { follow: false });
  let problem = null;
  if (s?.error) problem = `ln: failed to access ${q(source)}: ${errorText(s.error)}`;
  else if (s?.node.type === 'dir') problem = `ln: ${shellQuote(source)}: hard link not allowed for directory`;
  return { problem, node: s?.node ?? null };
}

function placeProblem(sys, d, node, opts) {
  let error = null;
  if (d.error && !(d.error === 'ENOENT' && d.parent)) error = errorText(d.error);
  else if (d.node && (!opts.force || d.node.type === 'dir')) error = 'File exists';
  else if (node && !mayHardLink(sys, node)) error = 'Operation not permitted';
  else if (!canChangeEntries(sys, d.parent) || (d.node && !canUnlink(sys, d.parent, d.node))) error = 'Permission denied';
  return error;
}

function makeLink(sys, { source, name }, opts, acc) {
  const { problem, node } = sourceProblem(sys, source, opts);
  const d = problem ? null : resolve(sys, name, { follow: false });
  const error = problem ? null : placeProblem(sys, d, node, opts);
  if (problem) acc.errs.push(problem);
  else if (error && opts.symbolic) acc.errs.push(`ln: failed to create symbolic link ${q(name)}: ${error}`);
  else if (error === 'File exists') acc.errs.push(`ln: failed to create hard link ${q(name)}: ${error}`);
  else if (error) acc.errs.push(`ln: failed to create hard link ${q(name)} => ${q(source)}: ${error}`);
  else {
    if (d.node) removeChild(d.parent, baseName(d.abs), sys.now());
    addChild(d.parent, baseName(d.abs), node ?? newSymlink(source, newMeta(sys, d.parent, 0o777, false)), sys.now());
    if (opts.verbose) acc.out += `${q(name)} ${opts.symbolic ? '->' : '=>'} ${q(source)}\n`;
  }
}

function ln(args, { sys }) {
  const long = mapLongOptions('ln', args, LN_LONG, /^$/);
  const o = long.err || long.unsimulated ? long : parseOptions('ln', long.args, 'sfvn');
  const failed = optionFailure('ln', o, 1);
  if (failed) return failed;
  if (!o.rest.length) return result('', `ln: missing file operand\n${tryHelp('ln')}`, 1);
  const opts = { symbolic: o.flags.has('s'), force: o.flags.has('f'), verbose: o.flags.has('v'), noDeref: o.flags.has('n') };
  const plan = linkPairs(sys, o.rest, opts);
  if (plan.error) return result('', plan.error, 1);
  const acc = { out: '', errs: [] };
  for (const pair of plan.pairs) makeLink(sys, pair, opts, acc);
  return result(acc.out, acc.errs.join('\n'), acc.errs.length ? 1 : 0);
}

// readlink -m: the real path as far as it exists, then the rest as text.
function canonicalMissing(sys, path) {
  let base = path.startsWith('/') ? '/' : resolve(sys, '.').abs;
  let lost = false;
  let looped = false;
  for (const part of path.split('/').filter(p => p && p !== '.')) {
    const candidate = part === '..' ? parentOf(base) : joinPath(base, part);
    const r = lost || part === '..' ? null : resolve(sys, candidate);
    looped ||= r?.error === 'ELOOP';
    base = r && (!r.error || (r.error === 'ENOENT' && r.parent)) ? r.abs : candidate;
    lost ||= Boolean(r?.error);
  }
  return looped ? null : base;
}

function canonical(sys, path, mode) {
  if (mode === 'm') return canonicalMissing(sys, path);
  const r = resolve(sys, path);
  const missingLast = mode === 'f' && r.error === 'ENOENT' && r.parent;
  return !r.error || missingLast ? r.abs : null;
}

function linkText(sys, path) {
  const r = resolve(sys, path, { follow: false });
  return r.node?.type === 'symlink' ? r.node.target : null;
}

function readlink(args, { sys }) {
  const long = mapLongOptions('readlink', args, READLINK_LONG, /^$/);
  const o = long.err || long.unsimulated ? long : parseOptions('readlink', long.args, 'femn');
  const failed = optionFailure('readlink', o, 1);
  if (failed) return failed;
  if (!o.rest.length) return result('', `readlink: missing operand\n${tryHelp('readlink')}`, 1);
  const mode = [...o.flags].filter(c => 'fem'.includes(c)).at(-1);
  const found = o.rest.map(path => (mode ? canonical(sys, path, mode) : linkText(sys, path)));
  const ignored = o.flags.has('n') && o.rest.length > 1;
  const end = o.flags.has('n') && !ignored ? '' : '\n';
  const out = found.filter(text => text !== null).map(text => text + end).join('');
  return result(out, ignored ? 'readlink: ignoring --no-newline with multiple arguments' : '', found.includes(null) ? 1 : 0);
}

export default { ln, readlink };
