/**
 * cp and mv, following coreutils 9.4: a last operand that is a directory
 * receives the others under their own names, and messages name the full
 * target (`forest/readme.txt`).
 */

import { joinDisp, newDir, newFile, addChild, removeChild, depthOf, heightOf, MAX_TREE_DEPTH } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames, isInside, baseName, joinPath } from '../../backend/tree.js';
import { can, canChangeEntries, canUnlink } from '../perms.js';
import { parseOptions, optionFailure } from '../options.js';
import { shellQuote } from '../quote.js';
import { result, withNote } from '../result.js';
import { leaveIfGone } from './files.js';

const q = name => shellQuote(name, { always: true });

function copyNode(sys, src, srcShown, targetParent, name, targetShown, acc) {
  const existing = targetParent.children[name];
  const meta = { mode: src.mode & ~sys.umask, owner: sys.user, group: sys.user, mtime: sys.now() };
  let ok = true;
  if (src.type === 'file' && !can(sys, src, 'r')) {
    acc.errs.push(`cp: cannot open ${q(srcShown)} for reading: Permission denied`);
    ok = false;
  } else if (src.type === 'file' && existing) {
    Object.assign(existing, { content: src.content, mtime: sys.now() });
  } else if (src.type === 'file') {
    addChild(targetParent, name, newFile(src.content, meta), sys.now());
  } else {
    const dir = existing ?? addChild(targetParent, name, newDir({}, { ...meta, mode: src.mode & ~sys.umask | 0o700 }), sys.now());
    for (const child of Object.keys(src.children).sort(compareNames)) {
      ok = copyNode(sys, src.children[child], joinDisp(srcShown, child), dir, child, joinDisp(targetShown, child), acc) && ok;
    }
    dir.mode = src.mode & ~sys.umask;
  }
  if (ok && acc.verbose) acc.out += `${q(srcShown)} -> ${q(targetShown)}\n`;
  return ok;
}

function sourceProblem(op, src, target) {
  let kind = null;
  if (src.error) kind = `cannot stat ${q(src.shown)}: ${errorText(src.error)}`;
  else if (op.name === 'cp' && src.node.type === 'dir' && !op.recursive) kind = `-r not specified; omitting directory ${q(src.shown)}`;
  else if (target.node === src.node) kind = `${q(src.shown)} and ${q(target.shown)} are the same file`;
  else if (src.node.type === 'dir' && isInside(target.abs, src.abs)) {
    kind = op.name === 'mv' ? `cannot move ${q(src.shown)} to a subdirectory of itself, ${q(target.shown)}`
      : `cannot copy a directory, ${q(src.shown)}, into itself, ${q(target.shown)}`;
  }
  return kind;
}

function targetProblem(op, src, target) {
  const existing = target.node;
  const what = src.node.type === 'dir' ? 'directory' : 'regular file';
  let kind = null;
  if (target.error && !(target.error === 'ENOENT' && target.parent)) {
    kind = op.name === 'mv' ? `cannot move ${q(src.shown)} to ${q(target.shown)}: ${errorText(target.error)}` : `cannot create ${what} ${q(target.shown)}: ${errorText(target.error)}`;
  } else if (existing?.type === 'dir' && src.node.type !== 'dir') kind = `cannot overwrite directory ${q(target.shown)} with non-directory`;
  else if (existing && existing.type !== 'dir' && src.node.type === 'dir') kind = `cannot overwrite non-directory ${q(target.shown)} with directory ${q(src.shown)}`;
  return kind;
}

function tooDeep(op, src, target) {
  const deep = src.node.type === 'dir' && depthOf(target.abs) + heightOf(src.node) - 1 > MAX_TREE_DEPTH;
  let kind = null;
  if (deep && op.name === 'mv') kind = `cannot move ${q(src.shown)} to ${q(target.shown)}: ${errorText('ENAMETOOLONG')}`;
  else if (deep) kind = `cannot create directory ${q(target.shown)}: ${errorText('ENAMETOOLONG')}`;
  return kind;
}

function moveDenied(sys, src, target) {
  let kind = null;
  if (!canChangeEntries(sys, target.parent) || !canUnlink(sys, src.parent, src.node)) kind = `cannot move ${q(src.shown)} to ${q(target.shown)}: Permission denied`;
  else if (target.node?.type === 'dir' && Object.keys(target.node.children).length) kind = `cannot move ${q(src.shown)} to ${q(target.shown)}: Directory not empty`;
  return kind;
}

function copyDenied(sys, src, target) {
  const what = src.node.type === 'dir' ? 'directory' : 'regular file';
  const blocked = target.node ? target.node.type === 'file' && !can(sys, target.node, 'w') : !canChangeEntries(sys, target.parent);
  return blocked ? `cannot create ${what} ${q(target.shown)}: Permission denied` : null;
}

function problem(sys, op, src, target) {
  const early = sourceProblem(op, src, target) ?? (src.error ? null : targetProblem(op, src, target) ?? tooDeep(op, src, target));
  return early ?? (op.name === 'mv' ? moveDenied(sys, src, target) : copyDenied(sys, src, target));
}

function transfer(sys, op, srcTyped, dest, acc) {
  const s = resolve(sys, srcTyped);
  const src = { ...s, shown: srcTyped };
  const targetShown = dest.intoDir && !s.error ? joinDisp(dest.typed, baseName(s.abs)) : dest.typed;
  const t = resolve(sys, dest.intoDir && !s.error ? joinPath(dest.abs, baseName(s.abs)) : dest.typed);
  const target = { ...t, shown: targetShown };
  const kind = problem(sys, op, src, target);
  const kept = Boolean(target.node) && op.noClobber;
  if (kind) acc.errs.push(`${op.name}: ${kind}`);
  else if (!kept && op.name === 'cp') copyNode(sys, src.node, src.shown, target.parent, baseName(target.abs), target.shown, acc);
  else if (!kept) {
    removeChild(src.parent, baseName(src.abs), sys.now());
    addChild(target.parent, baseName(target.abs), src.node, sys.now());
    if (acc.verbose) acc.out += `renamed ${q(src.shown)} -> ${q(target.shown)}\n`;
  }
}

function copyOrMove(name, args, { sys }) {
  const o = parseOptions(name, args, name === 'mv' ? 'ivn' : 'rRivna');
  const failed = optionFailure(name, o, 1);
  if (failed) return failed;
  const tryHelp = `Try '${name} --help' for more information.`;
  if (!o.rest.length) return result('', `${name}: missing file operand\n${tryHelp}`, 1);
  if (o.rest.length === 1) return result('', `${name}: missing destination file operand after ${q(o.rest[0])}\n${tryHelp}`, 1);
  const sources = o.rest.slice(0, -1);
  const typed = o.rest.at(-1);
  const d = resolve(sys, typed);
  const dest = { typed, abs: d.abs, intoDir: d.node?.type === 'dir' };
  if (sources.length > 1 && !dest.intoDir) {
    return result('', d.error ? `${name}: target ${q(typed)}: ${errorText(d.error)}` : `${name}: target ${q(typed)} is not a directory`, 1);
  }
  const op = { name, recursive: o.flags.has('r') || o.flags.has('R') || o.flags.has('a'), noClobber: o.flags.has('n') };
  const acc = { out: '', errs: [], verbose: o.flags.has('v') };
  for (const src of sources) transfer(sys, op, src, dest, acc);
  if (name === 'mv') leaveIfGone(sys);
  const r = result(acc.out, acc.errs.join('\n'), acc.errs.length ? 1 : 0);
  return withNote(r, o.flags.has('i') ? `In a real terminal, -i asks before overwriting and waits for y or n. The game answers yes for you.` : null);
}

export default {
  cp: (args, ctx) => copyOrMove('cp', args, ctx),
  mv: (args, ctx) => copyOrMove('mv', args, ctx),
};
