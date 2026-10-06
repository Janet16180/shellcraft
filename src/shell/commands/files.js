/**
 * Reading and changing files: cat, less, more, touch, mkdir, rmdir, rm,
 * chmod (cp and mv have their own module). Messages follow coreutils 9.4 in
 * C.UTF-8, including which ones quote with straight and which with curly quotes.
 */

import { baseName, newDir, newFile, addChild, removeChild, joinDisp } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames } from '../../backend/tree.js';
import { can, canChangeEntries, canUnlink, canChmod } from '../perms.js';
import { parseOptions, optionFailure } from '../options.js';
import { shellQuote, localeQuote } from '../quote.js';
import { result, withNote, needInput } from '../result.js';
import { openInput, reason } from './text.js';

const tryHelp = name => `Try '${name} --help' for more information.`;
const quoted = name => shellQuote(name, { always: true });
const errResult = (out, errs) => result(out, errs.join('\n'), errs.length ? 1 : 0);
const ownedMeta = (sys, mode) => ({ mode: mode & ~sys.umask, owner: sys.user, group: sys.user, mtime: sys.now() });

/**
 * When the working directory has been removed, move the shell to its nearest
 * existing ancestor. A real bash stays in the deleted directory; the game
 * needs a room to stand in.
 *
 * @param {object} sys The machine state.
 * @returns {void}
 */
export function leaveIfGone(sys) {
  while (resolve(sys, sys.cwd).error) sys.cwd = sys.cwd.slice(0, sys.cwd.lastIndexOf('/')) || '/';
}

function cat(args, { sys, stdin }) {
  const o = parseOptions('cat', args, 'n');
  const failed = optionFailure('cat', o, 1);
  if (failed) return failed;
  if (!o.rest.length && stdin == null) return needInput('cat');
  const errs = [];
  let text = '';
  for (const f of o.rest.length ? o.rest : ['-']) {
    const input = openInput(sys, f, stdin);
    if (input.code) errs.push(`cat: ${shellQuote(f)}: ${reason(input.code)}`);
    else text += input.content;
  }
  if (o.flags.has('n')) {
    let n = 0;
    text = text.split(/(?<=\n)/).filter(Boolean).map(l => `${String(++n).padStart(6)}\t${l}`).join('');
  }
  return errResult(text, errs);
}

const pager = name => (args, ctx) => withNote(cat(args.filter(x => !x.startsWith('-')), ctx),
  `A real ${name} opens the file in a scrollable viewer: arrow keys or Space to move, / to search, q to quit. Here it simply prints the file.`);

function touch(args, { sys }) {
  const o = parseOptions('touch', args, 'm');
  const failed = optionFailure('touch', o, 1);
  if (failed) return failed;
  if (!o.rest.length) return result('', `touch: missing file operand\n${tryHelp('touch')}`, 1);
  const errs = [];
  for (const f of o.rest) {
    const r = resolve(sys, f);
    const fail = text => errs.push(`touch: cannot touch ${quoted(f)}: ${text}`);
    if (r.node && (can(sys, r.node, 'w') || r.node.owner === sys.user)) r.node.mtime = sys.now();
    else if (r.node) fail('Permission denied');
    else if (r.error !== 'ENOENT' || !r.parent) fail(errorText(r.error));
    else if (!canChangeEntries(sys, r.parent)) fail('Permission denied');
    else addChild(r.parent, baseName(r.abs), newFile('', ownedMeta(sys, 0o666)), sys.now());
  }
  return errResult('', errs);
}

function makeDir(sys, path, verbose) {
  const r = resolve(sys, path);
  let error = null;
  let out = '';
  if (r.node) error = 'File exists';
  else if (r.error !== 'ENOENT' || !r.parent) error = errorText(r.error);
  else if (!canChangeEntries(sys, r.parent)) error = 'Permission denied';
  else {
    addChild(r.parent, baseName(r.abs), newDir({}, ownedMeta(sys, 0o777)), sys.now());
    if (verbose) out = `mkdir: created directory ${quoted(path)}\n`;
  }
  return { error, out };
}

const prefixes = path => path.split('/').map((_, i, all) => all.slice(0, i + 1).join('/')).filter(p => p !== '' && !/(^|\/)\.\.?$/.test(p));

function mkdir(args, { sys }) {
  const o = parseOptions('mkdir', args, 'pv');
  const failed = optionFailure('mkdir', o, 1);
  if (failed) return failed;
  if (!o.rest.length) return result('', `mkdir: missing operand\n${tryHelp('mkdir')}`, 1);
  const errs = [];
  let out = '';
  for (const f of o.rest) {
    const parts = o.flags.has('p') ? prefixes(f.replace(/\/+$/, '')) : [f];
    for (const part of parts) {
      if (o.flags.has('p') && resolve(sys, part).node?.type === 'dir') continue;
      const made = makeDir(sys, part, o.flags.has('v'));
      out += made.out;
      if (made.error) {
        errs.push(`mkdir: cannot create directory ${localeQuote(f)}: ${made.error}`);
        break;
      }
    }
  }
  return errResult(out, errs);
}

function rmdir(args, { sys }) {
  const o = parseOptions('rmdir', args, 'pv');
  const failed = optionFailure('rmdir', o, 1);
  if (failed) return failed;
  if (!o.rest.length) return result('', `rmdir: missing operand\n${tryHelp('rmdir')}`, 1);
  const errs = [];
  let out = '';
  for (const f of o.rest) {
    const r = resolve(sys, f);
    const fail = text => errs.push(`rmdir: failed to remove ${quoted(f)}: ${text}`);
    if (o.flags.has('v')) out += `rmdir: removing directory, ${quoted(f)}\n`;
    if (/(^|\/)\.\/*$/.test(f)) fail('Invalid argument');
    else if (r.error) fail(errorText(r.error));
    else if (r.node.type !== 'dir') fail('Not a directory');
    else if (Object.keys(r.node.children).length) fail('Directory not empty');
    else if (!canUnlink(sys, r.parent, r.node)) fail('Permission denied');
    else removeChild(r.parent, baseName(r.abs), sys.now());
  }
  leaveIfGone(sys);
  return errResult(out, errs);
}

const isHomeOrAbove = (sys, abs) => abs === sys.home || sys.home.startsWith(`${abs}/`);

function removeTree(sys, shown, node, parent, name, acc) {
  const openable = node.type !== 'dir' || (can(sys, node, 'r') && can(sys, node, 'x'));
  let ok = openable;
  if (!openable) acc.errs.push(`rm: cannot remove ${quoted(shown)}: Permission denied`);
  if (openable && node.type === 'dir') {
    for (const child of Object.keys(node.children).sort(compareNames)) {
      ok = removeTree(sys, joinDisp(shown, child), node.children[child], node, child, acc) && ok;
    }
  }
  if (ok && !canUnlink(sys, parent, node)) {
    acc.errs.push(`rm: cannot remove ${quoted(shown)}: Permission denied`);
    ok = false;
  }
  if (ok) {
    removeChild(parent, name, sys.now());
    if (acc.verbose) acc.out += node.type === 'dir' ? `removed directory ${quoted(shown)}\n` : `removed ${quoted(shown)}\n`;
  }
  return ok;
}

function rmOne(sys, f, flags, acc) {
  const recursive = flags.has('r') || flags.has('R');
  const last = f.replace(/\/+$/, '').split('/').pop();
  const r = resolve(sys, f);
  let error = null;
  if (last === '.' || last === '..') error = `rm: refusing to remove '.' or '..' directory: skipping ${quoted(f)}`;
  else if (r.abs === '/' && !r.error && recursive) error = "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe";
  else if (r.error) error = flags.has('f') && r.error === 'ENOENT' ? null : `rm: cannot remove ${quoted(f)}: ${errorText(r.error)}`;
  else if (r.node.type === 'dir' && !recursive) error = `rm: cannot remove ${quoted(f)}: Is a directory`;
  else if (isHomeOrAbove(sys, r.abs)) {
    acc.block(`rm -r ${r.abs} would delete the home directory ${sys.home}`);
    acc.blocked = true;
  } else removeTree(sys, f, r.node, r.parent, baseName(r.abs), acc);
  if (error) acc.errs.push(error);
}

function rm(args, { sys, block }) {
  const o = parseOptions('rm', args, 'rRfiv');
  const failed = optionFailure('rm', o, 1);
  if (failed) return failed;
  if (!o.rest.length && !o.flags.has('f')) return result('', `rm: missing operand\n${tryHelp('rm')}`, 1);
  const acc = { out: '', errs: [], verbose: o.flags.has('v'), block, blocked: false };
  for (const f of o.rest) rmOne(sys, f, o.flags, acc);
  leaveIfGone(sys);
  const r = result(acc.out, acc.errs.join('\n'), acc.errs.length || acc.blocked ? 1 : 0);
  return withNote(r, o.flags.has('i') ? 'In a real terminal, -i asks "rm: remove regular file ...?" and waits for y or n. The game answers yes for you.' : null);
}

function symbolicBits(who, perms, old, isDir) {
  const shifts = { u: 6, g: 3, o: 0 };
  const bitsOf = { r: 4, w: 2, x: 1 };
  let bits = 0;
  for (const w of who) {
    for (const p of perms) {
      if (p in bitsOf) bits |= bitsOf[p] << shifts[w];
      if (p === 'X' && (isDir || old & 0o111)) bits |= 1 << shifts[w];
    }
  }
  if (perms.includes('s')) bits |= (who.includes('u') ? 0o4000 : 0) | (who.includes('g') ? 0o2000 : 0);
  if (perms.includes('t')) bits |= 0o1000;
  return bits;
}

function parseSymbolic(mode, umask) {
  const clauses = mode.split(',').map(c => /^([ugoa]*)([+\-=])([rwxXst]*)$/.exec(c));
  if (clauses.some(c => !c)) return null;
  return (old, isDir) => clauses.reduce((m, [, whoRaw, op, perms]) => {
    const who = !whoRaw || whoRaw.includes('a') ? 'ugo' : whoRaw;
    const bits = symbolicBits(who, perms, old, isDir) & (whoRaw ? ~0 : ~umask);
    const mask = [...who].reduce((acc, w) => acc | (7 << { u: 6, g: 3, o: 0 }[w]), 0);
    let next = (m & ~mask) | bits;
    if (op === '+') next = m | bits;
    if (op === '-') next = m & ~bits;
    return next;
  }, old);
}

function chmod(args, { sys }) {
  const recursive = args.includes('-R');
  const rest = args.filter(x => x !== '-R');
  if (!rest.length) return result('', `chmod: missing operand\n${tryHelp('chmod')}`, 1);
  if (rest.length < 2) return result('', `chmod: missing operand after ${localeQuote(rest[0])}\n${tryHelp('chmod')}`, 1);
  const [mode, ...files] = rest;
  const octal = /^[0-7]{1,4}$/.test(mode) ? parseInt(mode, 8) : null;
  const apply = octal === null ? parseSymbolic(mode, sys.umask) : () => octal;
  if (!apply) return result('', `chmod: invalid mode: ${localeQuote(mode)}\n${tryHelp('chmod')}`, 1);
  const errs = [];
  const visit = node => {
    node.mode = apply(node.mode, node.type === 'dir');
    if (recursive && node.type === 'dir') Object.values(node.children).forEach(visit);
  };
  for (const f of files) {
    const r = resolve(sys, f);
    if (r.error) errs.push(`chmod: cannot access ${quoted(f)}: ${errorText(r.error)}`);
    else if (!canChmod(sys, r.node)) errs.push(`chmod: changing permissions of ${quoted(f)}: Operation not permitted`);
    else visit(r.node);
  }
  return errResult('', errs);
}

export default {
  cat,
  less: pager('less'),
  more: pager('more'),
  touch,
  mkdir,
  rmdir,
  rm,
  chmod,
};
