/**
 * Reading and changing files: cat, less, more, touch, mkdir, rmdir, rm, cp, mv, chmod.
 */

import { lookup, normalize, parentOf, baseName, joinPath, newDir, newFile, cloneNode, splitLines } from '../fs.js';
import { can, canChangeEntries, canUnlink, canChmod } from '../perms.js';
import { parseOptions } from '../options.js';
import { result, withNote, needInput } from '../result.js';
import { shellQuote } from '../quote.js';

const missing = name => `${name}: missing operand\nTry '${name} --help' for more information.`;
const errResult = (out, errs) => result(out, errs.join('\n'), errs.length ? 1 : 0);
const ownedMeta = (sys, mode) => ({ mode: mode & ~sys.umask, owner: sys.user, group: sys.user, mtime: sys.now() });

/**
 * Read files (or standard input for `-`) for a command that concatenates them.
 *
 * @param {object} sys The machine state.
 * @param {string} name The command, for error messages.
 * @param {string[]} files File operands as typed.
 * @param {string|null} stdin Piped input, if any.
 * @returns {{out: {label: string, content: string}[], errs: string[]}} The contents read and the errors.
 */
export function readSources(sys, name, files, stdin) {
  const out = [];
  const errs = [];
  for (const f of files) {
    const node = f === '-' ? null : lookup(sys.root, normalize(f, sys.cwd));
    if (f === '-') out.push({ label: '(standard input)', content: stdin ?? '' });
    else if (!node) errs.push(`${name}: ${shellQuote(f)}: No such file or directory`);
    else if (node.type === 'dir') errs.push(`${name}: ${shellQuote(f)}: Is a directory`);
    else if (!can(sys, node, 'r')) errs.push(`${name}: ${shellQuote(f)}: Permission denied`);
    else out.push({ label: f, content: node.content });
  }
  return { out, errs };
}

function leaveIfGone(sys) {
  let p = sys.cwd;
  while (!lookup(sys.root, p)) p = parentOf(p);
  sys.cwd = p;
}

function cat(args, { sys, stdin }) {
  const o = parseOptions('cat', args, 'n');
  if (o.err) return result('', o.err, 1);
  if (!o.rest.length && stdin == null) return needInput('cat');
  const { out, errs } = readSources(sys, 'cat', o.rest.length ? o.rest : ['-'], stdin);
  let text = out.map(s => s.content).join('');
  if (o.flags.has('n')) {
    const lines = splitLines(text);
    text = lines.map((l, i) => `${String(i + 1).padStart(6)}\t${l}\n`).join('');
  }
  return errResult(text, errs);
}

const pager = name => (args, ctx) => withNote(cat(args.filter(x => !x.startsWith('-')), ctx),
  `A real ${name} opens the file in a scrollable viewer: arrow keys or Space to move, / to search, q to quit. Here it simply prints the file.`);

function touch(args, { sys }) {
  const o = parseOptions('touch', args, '');
  if (o.err) return result('', o.err, 1);
  if (!o.rest.length) return result('', "touch: missing file operand\nTry 'touch --help' for more information.", 1);
  const errs = [];
  for (const f of o.rest) {
    const p = normalize(f, sys.cwd);
    const node = lookup(sys.root, p);
    const parent = lookup(sys.root, parentOf(p));
    if (node && (can(sys, node, 'w') || node.owner === sys.user)) node.mtime = sys.now();
    else if (node) errs.push(`touch: cannot touch '${f}': Permission denied`);
    else if (!parent || parent.type !== 'dir') errs.push(`touch: cannot touch '${f}': No such file or directory`);
    else if (!canChangeEntries(sys, parent)) errs.push(`touch: cannot touch '${f}': Permission denied`);
    else parent.children[baseName(p)] = newFile('', ownedMeta(sys, 0o666));
  }
  return errResult('', errs);
}

function mkdirParents(sys, p, typed, verbose) {
  let cur = '/';
  let out = '';
  let error = null;
  for (const seg of p.split('/').filter(Boolean)) {
    const next = joinPath(cur, seg);
    const node = lookup(sys.root, next);
    const parent = lookup(sys.root, cur);
    if (error) break;
    if (node && node.type !== 'dir') error = `mkdir: cannot create directory '${typed}': Not a directory`;
    else if (!node && !canChangeEntries(sys, parent)) error = `mkdir: cannot create directory '${typed}': Permission denied`;
    else if (!node) {
      parent.children[seg] = newDir({}, ownedMeta(sys, 0o777));
      const shown = typed.startsWith('/') || !next.startsWith(`${sys.cwd}/`) ? next : next.slice(sys.cwd.length + 1);
      if (verbose) out += `mkdir: created directory '${shown}'\n`;
    }
    cur = next;
  }
  return { out, error };
}

function mkdir(args, { sys }) {
  const o = parseOptions('mkdir', args, 'pv');
  if (o.err) return result('', o.err, 1);
  if (!o.rest.length) return result('', missing('mkdir'), 1);
  const errs = [];
  let out = '';
  for (const f of o.rest) {
    const p = normalize(f, sys.cwd);
    const existing = lookup(sys.root, p);
    const parent = lookup(sys.root, parentOf(p));
    if (o.flags.has('p') && !(existing && existing.type === 'dir')) {
      const made = mkdirParents(sys, p, f, o.flags.has('v'));
      out += made.out;
      if (made.error) errs.push(made.error);
    } else if (existing && !o.flags.has('p')) errs.push(`mkdir: cannot create directory '${f}': File exists`);
    else if (existing) continue;
    else if (!parent) errs.push(`mkdir: cannot create directory '${f}': No such file or directory`);
    else if (parent.type !== 'dir') errs.push(`mkdir: cannot create directory '${f}': Not a directory`);
    else if (!canChangeEntries(sys, parent)) errs.push(`mkdir: cannot create directory '${f}': Permission denied`);
    else {
      parent.children[baseName(p)] = newDir({}, ownedMeta(sys, 0o777));
      if (o.flags.has('v')) out += `mkdir: created directory '${f}'\n`;
    }
  }
  return errResult(out, errs);
}

function rmdir(args, { sys }) {
  const o = parseOptions('rmdir', args, 'v');
  if (o.err) return result('', o.err, 1);
  if (!o.rest.length) return result('', missing('rmdir'), 1);
  const errs = [];
  for (const f of o.rest) {
    const p = normalize(f, sys.cwd);
    const node = lookup(sys.root, p);
    const parent = lookup(sys.root, parentOf(p));
    if (/(^|\/)\.$/.test(f)) errs.push(`rmdir: failed to remove '${f}': Invalid argument`);
    else if (!node) errs.push(`rmdir: failed to remove '${f}': No such file or directory`);
    else if (node.type !== 'dir') errs.push(`rmdir: failed to remove '${f}': Not a directory`);
    else if (Object.keys(node.children).length) errs.push(`rmdir: failed to remove '${f}': Directory not empty`);
    else if (!canUnlink(sys, parent, node)) errs.push(`rmdir: failed to remove '${f}': Permission denied`);
    else delete parent.children[baseName(p)];
  }
  leaveIfGone(sys);
  return errResult('', errs);
}

const isHomeOrAbove = (sys, p) => p === sys.home || sys.home.startsWith(`${p}/`);

function rmOne(sys, f, flags, block) {
  const recursive = flags.has('r') || flags.has('R');
  const last = f.replace(/\/+$/, '').split('/').pop();
  const p = normalize(f, sys.cwd);
  const node = lookup(sys.root, p);
  const parent = lookup(sys.root, parentOf(p));
  let error = null;
  let out = '';
  let blocked = false;
  if (last === '.' || last === '..') error = `rm: refusing to remove '.' or '..' directory: skipping '${f}'`;
  else if (p === '/' && recursive) error = "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe";
  else if (p === '/') error = "rm: cannot remove '/': Is a directory";
  else if (!node) error = flags.has('f') ? null : `rm: cannot remove '${f}': No such file or directory`;
  else if (node.type === 'dir' && !recursive) error = `rm: cannot remove '${f}': Is a directory`;
  else if (isHomeOrAbove(sys, p)) {
    block(`rm -r ${p} would delete the home directory ${sys.home}`);
    blocked = true;
  }
  else if (!canUnlink(sys, parent, node)) error = `rm: cannot remove '${f}': Permission denied`;
  else {
    delete parent.children[baseName(p)];
    if (flags.has('v')) out = node.type === 'dir' ? `removed directory '${f}'\n` : `removed '${f}'\n`;
  }
  return { out, error, blocked };
}

function rm(args, { sys, block }) {
  const o = parseOptions('rm', args, 'rRfiv');
  if (o.err) return result('', o.err, 1);
  if (!o.rest.length) return o.flags.has('f') ? result() : result('', missing('rm'), 1);
  const errs = [];
  let out = '';
  let refused = false;
  for (const f of o.rest) {
    const done = rmOne(sys, f, o.flags, block);
    out += done.out;
    if (done.error) errs.push(done.error);
    refused ||= done.blocked;
  }
  leaveIfGone(sys);
  const r = result(out, errs.join('\n'), errs.length || refused ? 1 : 0);
  return withNote(r, o.flags.has('i') ? 'In a real terminal, -i asks "rm: remove regular file ...?" and waits for y or n. The game answers yes for you.' : null);
}

function transferError(name, move, src, dest, kind) {
  const messages = {
    missing: move ? `mv: cannot stat '${src}': No such file or directory` : `cp: cannot stat '${src}': No such file or directory`,
    unreadable: `cp: cannot open '${src}' for reading: Permission denied`,
    omitDir: `cp: -r not specified; omitting directory '${src}'`,
    same: `${name}: '${src}' and '${dest}' are the same file`,
    intoSelf: move ? `mv: cannot move '${src}' to a subdirectory of itself, '${dest}'` : `cp: cannot copy a directory, '${src}', into itself, '${dest}'`,
    noParent: move ? `mv: cannot move '${src}' to '${dest}': No such file or directory` : `cp: cannot create regular file '${dest}': No such file or directory`,
    denied: move ? `mv: cannot move '${src}' to '${dest}': Permission denied` : `cp: cannot create regular file '${dest}': Permission denied`,
  };
  return messages[kind];
}

function transferProblem(sys, { srcAbs, node, target, move, recursive }) {
  const par = lookup(sys.root, parentOf(target));
  const existing = lookup(sys.root, target);
  const srcParent = lookup(sys.root, parentOf(srcAbs));
  let kind = null;
  if (!node) kind = 'missing';
  else if (!move && node.type === 'dir' && !recursive) kind = 'omitDir';
  else if (!move && !can(sys, node, 'r')) kind = 'unreadable';
  else if (target === srcAbs) kind = 'same';
  else if (node.type === 'dir' && target.startsWith(`${srcAbs}/`)) kind = 'intoSelf';
  else if (!par || par.type !== 'dir') kind = 'noParent';
  else if (!canChangeEntries(sys, par) || (existing && !move && !can(sys, existing, 'w'))) kind = 'denied';
  else if (move && !canUnlink(sys, srcParent, node)) kind = 'denied';
  return kind;
}

function copyOrMove(name, args, sys, move) {
  const o = parseOptions(name, args, move ? 'ivnf' : 'rRivnf');
  if (o.err) return result('', o.err, 1);
  const rest = [...o.rest];
  if (rest.length < 2) {
    const head = rest.length ? `${name}: missing destination file operand after '${rest[0]}'` : `${name}: missing file operand`;
    return result('', `${head}\nTry '${name} --help' for more information.`, 1);
  }
  const dest = rest.pop();
  const destAbs = normalize(dest, sys.cwd);
  const destNode = lookup(sys.root, destAbs);
  const intoDir = Boolean(destNode) && destNode.type === 'dir';
  if (rest.length > 1 && !intoDir) return result('', `${name}: target '${dest}' is not a directory`, 1);
  const errs = [];
  let out = '';
  for (const src of rest) {
    const srcAbs = normalize(src, sys.cwd);
    const node = lookup(sys.root, srcAbs);
    const target = intoDir ? joinPath(destAbs, baseName(srcAbs)) : destAbs;
    const kind = transferProblem(sys, { srcAbs, node, target, move, recursive: o.flags.has('r') || o.flags.has('R') });
    const existing = lookup(sys.root, target);
    if (kind) errs.push(transferError(name, move, src, dest, kind));
    else if (existing && existing.type === 'dir' && node.type !== 'dir') errs.push(`${name}: cannot overwrite directory '${target}' with non-directory`);
    else if (existing && o.flags.has('n')) continue;
    else {
      const parent = lookup(sys.root, parentOf(target));
      if (move) delete lookup(sys.root, parentOf(srcAbs)).children[baseName(srcAbs)];
      parent.children[baseName(target)] = move ? node : { ...cloneNode(node, sys.now()), owner: sys.user, group: sys.user };
      if (o.flags.has('v')) out += move ? `renamed '${src}' -> '${dest}'\n` : `'${src}' -> '${dest}'\n`;
    }
  }
  if (move) leaveIfGone(sys);
  return errResult(out, errs);
}

function parseSymbolic(mode) {
  const clauses = mode.split(',').map(c => /^([ugoa]*)([+\-=])([rwx]*)$/.exec(c));
  if (clauses.some(c => !c)) return null;
  const shifts = { u: 6, g: 3, o: 0 };
  const bitsOf = { r: 4, w: 2, x: 1 };
  return old => clauses.reduce((m, [, whoRaw, op, perms]) => {
    const who = !whoRaw || whoRaw.includes('a') ? 'ugo' : whoRaw;
    let bits = 0;
    let mask = 0;
    for (const w of who) {
      mask |= 7 << shifts[w];
      for (const p of perms) bits |= bitsOf[p] << shifts[w];
    }
    if (op === '+') return m | bits;
    if (op === '-') return m & ~bits;
    return (m & ~mask) | bits;
  }, old);
}

function chmod(args, { sys }) {
  const recursive = args.includes('-R');
  const rest = args.filter(x => x !== '-R');
  if (!rest.length) return result('', missing('chmod'), 1);
  if (rest.length < 2) return result('', `chmod: missing operand after '${rest[0]}'\nTry 'chmod --help' for more information.`, 1);
  const [mode, ...files] = rest;
  const octal = /^[0-7]{3,4}$/.test(mode) ? parseInt(mode, 8) : null;
  const apply = octal === null ? parseSymbolic(mode) : () => octal;
  if (!apply) return result('', `chmod: invalid mode: '${mode}'\nTry 'chmod --help' for more information.`, 1);
  const errs = [];
  const visit = n => {
    n.mode = apply(n.mode);
    if (recursive && n.type === 'dir') Object.values(n.children).forEach(visit);
  };
  for (const f of files) {
    const node = lookup(sys.root, normalize(f, sys.cwd));
    if (!node) errs.push(`chmod: cannot access '${f}': No such file or directory`);
    else if (!canChmod(sys, node)) errs.push(`chmod: changing permissions of '${f}': Operation not permitted`);
    else visit(node);
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
  cp: (args, { sys }) => copyOrMove('cp', args, sys, false),
  mv: (args, { sys }) => copyOrMove('mv', args, sys, true),
  chmod,
};
