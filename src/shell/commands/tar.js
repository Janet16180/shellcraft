/**
 * tar, following GNU tar 1.35: create (-c), extract (-x) and list (-t)
 * archives, plain or gzip-compressed (-z), in a file (-f) or through a pipe.
 * Archives are files whose text src/backend/archive.js writes and reads.
 *
 * Members are stored in name order (GNU tar's --sort=name; by default it
 * follows the order of the directory on disk). A file stored twice is stored
 * twice, where GNU tar would store a hard link the second time.
 */

import { newDir, newFile, newSymlink, addChild, removeChild, normalize, joinDisp, sizeOf } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { writeFile } from '../redirect.js';
import { compareNames, baseName, joinPath } from '../../backend/tree.js';
import { can, canChangeEntries, canUnlink } from '../perms.js';
import { groupNames } from '../accounts.js';
import { compileGlob } from '../glob.js';
import { REAL_OPTIONS } from '../real-options.js';
import { result, withNote } from '../result.js';
import { modeString } from './ls.js';
import { GUNZIP_ERRORS } from './compress.js';
import { packTar, unpackTar, gzip, gunzip, isGzip } from '../../backend/archive.js';

const FAILURE = 2;
const USAGE_ERROR = 64;
const TRY = "Try 'tar --help' or 'tar --usage' for more information.";
const EXITING = 'tar: Exiting with failure status due to previous errors';
const FATAL = 'tar: Error is not recoverable: exiting now';
const MODE_LETTERS = { c: 'create', x: 'extract', t: 'list' };
const WITH_VALUE = 'fC';
const LONG = {
  '--create': 'c', '--extract': 'x', '--get': 'x', '--list': 't', '--gzip': 'z', '--gunzip': 'z', '--ungzip': 'z', '--verbose': 'v',
  '--file': 'f', '--directory': 'C', '--exclude': 'exclude', '--sort': 'sort',
};
const LONG_VALUE = new Set(['--file', '--directory', '--exclude', '--sort']);
const SORTS = new Set(['none', 'name', 'inode']);
// GNU tar pads the owner/group and size columns of a long listing to this width, growing it as needed.
const UGS_WIDTH = 18;
const realShort = letter => REAL_OPTIONS.tar.short.includes(letter);

function parseLetter(o, letter, value) {
  if (Object.hasOwn(MODE_LETTERS, letter)) o.modes.add(letter);
  else if (letter === 'v') o.verbose++;
  else if (letter === 'z') o.gzip = true;
  else if (letter === 'f') o.file = value;
  else if (letter === 'C') o.items.push({ dir: value });
  else if (realShort(letter)) o.unsimulated ??= `-${letter}`;
  else o.err ??= `tar: invalid option -- '${letter}'\n${TRY}`;
}

// A cluster of short options; f and C take the rest of it or the next word.
function parseCluster(o, args, i) {
  let next = i;
  const word = args[i];
  for (let j = 1; j < word.length && !o.err; j++) {
    const letter = word[j];
    if (!WITH_VALUE.includes(letter)) {
      parseLetter(o, letter, null);
      continue;
    }
    const value = word.slice(j + 1) || args[++next];
    if (value === undefined) o.err = `tar: option requires an argument -- '${letter}'\n${TRY}`;
    else parseLetter(o, letter, value);
    break;
  }
  return next;
}

// A long option, or an unambiguous start of one (`--cre`), as GNU's argp allows.
function longName(typed) {
  const known = [...new Set([...REAL_OPTIONS.tar.long, ...Object.keys(LONG)])].sort();
  const matches = known.includes(typed) ? [typed] : known.filter(name => name.startsWith(typed));
  let found = { name: matches[0] ?? null, err: null };
  if (!matches.length) found = { name: null, err: 'unrecognized' };
  else if (matches.length > 1) found = { name: null, err: `tar: option '${typed}' is ambiguous; possibilities: ${matches.map(m => `'${m}'`).join(' ')}\n${TRY}` };
  return found;
}

function parseLong(o, args, i) {
  const [typed, ...rest] = args[i].split('=');
  const { name, err } = longName(typed);
  const inline = rest.length ? rest.join('=') : null;
  let next = i;
  if (err === 'unrecognized') o.err = `tar: unrecognized option '${args[i]}'\n${TRY}`;
  else if (err) o.err = err;
  else if (!Object.hasOwn(LONG, name)) o.unsimulated ??= name;
  else if (!LONG_VALUE.has(name)) parseLetter(o, LONG[name], null);
  else {
    const value = inline ?? args[++next];
    if (value === undefined) o.err = `tar: option '${name}' requires an argument\n${TRY}`;
    else if (name === '--exclude') o.excludes.push(value);
    else if (name === '--sort') o.err = SORTS.has(value) ? null : `tar: invalid argument '${value}' for '--sort'\n${TRY}`;
    else parseLetter(o, LONG[name], value);
  }
  return next;
}

// The old form without a dash (`tar czf a.tgz dir`): letters first, their values from the words after.
function oldStyle(o, args) {
  const rest = args.slice(1);
  for (const letter of args[0]) {
    const value = WITH_VALUE.includes(letter) ? rest.shift() : null;
    if (value === undefined) o.err ??= `tar: option requires an argument -- '${letter}'\n${TRY}`;
    else parseLetter(o, letter, value);
  }
  return rest;
}

function parseTar(args) {
  const o = { modes: new Set(), verbose: 0, gzip: false, file: null, items: [], excludes: [], err: null, unsimulated: null };
  const words = args.length && !args[0].startsWith('-') ? oldStyle(o, args) : args;
  let ended = false;
  for (let i = 0; i < words.length && !o.err; i++) {
    const w = words[i];
    if (ended || w === '-' || !w.startsWith('-')) o.items.push({ name: w });
    else if (w === '--') ended = true;
    else if (w.startsWith('--')) i = parseLong(o, words, i);
    else i = parseCluster(o, words, i);
  }
  return o;
}

function usageProblem(o) {
  let r = null;
  if (o.err) r = result('', o.err, o.err.includes('more than one') ? FAILURE : USAGE_ERROR);
  else if (o.unsimulated) r = withNote(result('', '', FAILURE), `tar ${o.unsimulated} is a real option, but this game does not simulate it.`);
  else if (o.modes.size === 0) r = result('', `tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\n${TRY}`, FAILURE);
  else if (o.modes.size > 1) r = result('', `tar: You may not specify more than one '-Acdtrux', '--delete' or  '--test-label' option\n${TRY}`, FAILURE);
  else if (o.modes.has('c') && !o.items.some(item => 'name' in item)) r = result('', `tar: Cowardly refusing to create an empty archive\n${TRY}`, FAILURE);
  return r;
}

// -C after the last name changes nothing; GNU tar says so and fails at the end.
function trailingDirs(o) {
  const last = o.items.findLastIndex(item => 'name' in item);
  const trailing = last < 0 ? [] : o.items.slice(last + 1);
  if (!trailing.length) return [];
  return ['tar: The following options were used after non-option arguments.  These options are positional and affect only arguments that follow them.  Please, rearrange them properly.',
    ...trailing.map(item => `tar: -C \u2018${item.dir}\u2019 has no effect`)];
}

const twoDigits = n => String(n).padStart(2, '0');
const dateOf = ms => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${twoDigits(d.getUTCMonth() + 1)}-${twoDigits(d.getUTCDate())} ${twoDigits(d.getUTCHours())}:${twoDigits(d.getUTCMinutes())}`;
};

// One line of tar -tv; width carries the growing owner/size column between lines.
function longLine(m, width) {
  const size = String(m.type === 'file' ? sizeOf({ type: 'file', content: m.content }) : 0);
  const pad = m.owner.length + 1 + m.group.length + size.length;
  width.value = Math.max(width.value, pad);
  const name = m.type === 'symlink' ? `${m.path} -> ${m.target}` : m.path;
  return `${modeString(m)} ${m.owner}/${m.group} ${size.padStart(width.value - pad + size.length)} ${dateOf(m.mtime)} ${name}`;
}

function report(acc, m) {
  if (!acc.verbose) return;
  const line = acc.verbose > 1 ? longLine(m, acc.width) : m.path;
  if (acc.verboseToErr) acc.errs.push(line);
  else acc.out += `${line}\n`;
}

function finish(acc, status = 0) {
  const failed = acc.failed || status !== 0;
  const errs = acc.failed ? [...acc.errs, EXITING] : acc.errs;
  return result(acc.out, errs.join('\n'), failed ? FAILURE : 0);
}

// GNU tar's safer_name_suffix: no leading slashes, nothing up to a `..`.
function memberName(typed, acc) {
  let name = typed.replace(/\/{2,}/g, '/');
  if (name.startsWith('/')) {
    name = name.replace(/^\/+/, '');
    if (!acc.warned.has('/')) acc.errs.push("tar: Removing leading `/' from member names");
    acc.warned.add('/');
  }
  const parts = name.split('/');
  const up = parts.lastIndexOf('..');
  if (up >= 0) {
    const prefix = `${parts.slice(0, up + 1).join('/')}/`;
    if (!acc.warned.has(prefix)) acc.errs.push(`tar: Removing leading \`${prefix}' from member names`);
    acc.warned.add(prefix);
    name = parts.slice(up + 1).join('/');
  }
  name = name.replace(/\/+$/, '');
  return name || '.';
}

function excluded(name, patterns) {
  const tails = name.split('/').map((_, i, parts) => parts.slice(i).join('/'));
  return patterns.some(p => tails.some(tail => p.test(tail)));
}

function addMember(sys, path, shown, name, acc) {
  const r = resolve(sys, path, { follow: false });
  const { node } = r;
  const fields = node && { mode: node.mode & 0o7777, owner: node.owner, group: node.group, mtime: node.mtime };
  if (excluded(name, acc.excludes)) return;
  if (r.error) acc.fail(`tar: ${shown}: Cannot stat: ${errorText(r.error)}`);
  else if (node === acc.archive) acc.errs.push(`tar: ${shown}: archive cannot contain itself; not dumped`);
  else if (node.type === 'symlink') acc.store({ path: name, type: 'symlink', ...fields, target: node.target });
  else if (!can(sys, node, 'r')) acc.fail(`tar: ${shown}: Cannot open: Permission denied`);
  else if (node.type === 'file') acc.store({ path: name, type: 'file', ...fields, content: node.content });
  else if (!can(sys, node, 'x')) acc.fail(`tar: ${shown}: Cannot open: Permission denied`);
  else {
    acc.store({ path: `${name}/`, type: 'dir', ...fields });
    for (const child of Object.keys(node.children).sort(compareNames)) {
      addMember(sys, joinPath(r.abs, child), joinDisp(shown, child), `${name === '.' ? '.' : name}/${child}`, acc);
    }
  }
}

function openForWriting(sys, file, ctx) {
  let opened = { stdout: false, error: null };
  if (file === null || file === '-') opened = ctx.piped ? { stdout: true, error: null } : { error: 'tar: Refusing to write archive contents to terminal (missing -f option?)' };
  else {
    const failed = writeFile(sys, file, '');
    opened = failed ? { error: `tar: ${file}: Cannot open: ${failed}` } : { stdout: false, error: null, node: resolve(sys, file).node };
  }
  return opened;
}

function create(sys, o, ctx, acc) {
  const opened = openForWriting(sys, o.file, ctx);
  if (opened.error) return result('', `${opened.error}\n${FATAL}`, FAILURE);
  const members = [];
  Object.assign(acc, { archive: opened.node ?? null, verboseToErr: opened.stdout, store: m => { members.push(m); report(acc, m); } });
  let dir = sys.cwd;
  for (const item of o.items) {
    if ('dir' in item) {
      dir = normalize(item.dir, dir);
      const d = resolve(sys, dir);
      const problem = d.error ?? (d.node.type === 'dir' ? null : 'ENOTDIR');
      if (problem) return result(acc.out, [...acc.errs, `tar: ${item.dir}: Cannot open: ${errorText(problem)}`, FATAL].join('\n'), FAILURE);
      continue;
    }
    const path = item.name.startsWith('/') || dir === sys.cwd ? item.name : joinPath(dir, item.name);
    addMember(sys, path, item.name, memberName(item.name, acc), acc);
  }
  const tar = packTar(members);
  const text = o.gzip ? gzip(tar) : tar;
  if (opened.stdout) acc.out += text;
  else Object.assign(opened.node, { content: text, mtime: sys.now() });
  return finish(acc);
}

function readSource(sys, o, stdin) {
  let source = { text: null, error: null };
  const r = o.file === null || o.file === '-' ? null : resolve(sys, o.file);
  if (!r && stdin == null) source.error = 'tar: Refusing to read archive contents from terminal (missing -f option?)';
  else if (!r) source.text = stdin;
  else if (r.error) source.error = `tar: ${o.file}: Cannot open: ${errorText(r.error)}`;
  else if (r.node.type === 'dir') source.error = `tar: ${o.file}: Cannot read: Is a directory\ntar: At beginning of tape, quitting now`;
  else if (!can(sys, r.node, 'r')) source.error = `tar: ${o.file}: Cannot open: Permission denied`;
  else source = { text: r.node.content, error: null };
  return source;
}

// The members of the archive, or the result that ends tar.
function readArchive(sys, o, stdin) {
  const source = readSource(sys, o, stdin);
  if (source.error) return { stop: result('', `${source.error}\n${FATAL}`, FAILURE) };
  const compressed = isGzip(source.text);
  const g = compressed ? gunzip(source.text) : null;
  let problem = null;
  if (o.gzip && !compressed) problem = 'not in gzip format';
  else if (g?.error) problem = GUNZIP_ERRORS[g.error];
  if (problem) return { stop: result('', `gzip: stdin: ${problem}\ntar: Child returned status 1\n${FATAL}`, FAILURE) };
  const members = unpackTar(g ? g.text : source.text);
  return members ? { members } : { stop: result('', `tar: This does not look like a tar archive\n${EXITING}`, FAILURE) };
}

// The members the names select (all when none are named), and the names nothing matched.
function select(members, names) {
  const clean = names.map(n => n.replace(/\/+$/, '') || n);
  const matches = (m, n) => m.path === n || m.path.startsWith(`${n}/`);
  return {
    chosen: clean.length ? members.filter(m => clean.some(n => matches(m, n))) : members,
    missing: clean.filter(n => !members.some(m => matches(m, n))),
  };
}

function finalMeta(sys, m) {
  const root = sys.user === 'root';
  return { mode: root ? m.mode : m.mode & ~sys.umask, owner: root ? m.owner : sys.user, group: root ? m.group : groupNames(sys)[0], mtime: m.mtime };
}

// The member's directory, made as tar makes missing ones, or null after an error.
function parentFor(sys, base, rel, acc) {
  const parts = rel.split('/');
  let dir = base;
  for (const part of parts.slice(0, -1)) {
    const here = joinPath(dir, part);
    const r = resolve(sys, here);
    const parent = resolve(sys, dir).node;
    if (r.error === 'ENOENT' && parent && canChangeEntries(sys, parent)) {
      addChild(parent, part, newDir({}, { mode: 0o777 & ~sys.umask, owner: sys.user, group: groupNames(sys)[0], mtime: sys.now() }), sys.now());
    } else if (r.error || r.node.type !== 'dir') {
      acc.fail(`tar: ${here.slice(base.length + 1)}: Cannot mkdir: ${errorText(r.error === 'ENOENT' ? 'EACCES' : r.error ?? 'ENOTDIR')}`);
      acc.fail(`tar: ${rel}: Cannot open: No such file or directory`);
      return null;
    }
    dir = here;
  }
  const d = resolve(sys, dir);
  return d.error ? null : d.node;
}

function blockedMessage(m, rel) {
  if (m.type === 'dir') return `tar: ${rel}: Cannot mkdir: Permission denied`;
  return m.type === 'symlink' ? `tar: ${rel}: Cannot create symlink to \u2018${m.target}\u2019: Permission denied` : `tar: ${rel}: Cannot open: Permission denied`;
}

function newMember(m, meta) {
  if (m.type === 'file') return newFile(m.content, meta);
  return m.type === 'symlink' ? newSymlink(m.target, meta) : newDir({}, { ...meta, mode: 0o700 });
}

function placeMember(sys, parent, rel, m, acc) {
  const name = baseName(`/${rel}`);
  const existing = parent.children[name];
  const meta = finalMeta(sys, m);
  const blocked = !canChangeEntries(sys, parent) || (existing && existing.type !== 'dir' && !canUnlink(sys, parent, existing));
  if (m.type === 'dir' && existing?.type === 'dir') acc.dirs.push([existing, meta]);
  else if (blocked) acc.fail(blockedMessage(m, rel));
  else if (existing?.type === 'dir') acc.fail(`tar: ${rel}: Cannot open: Is a directory`);
  else {
    if (existing) removeChild(parent, name, sys.now());
    const node = addChild(parent, name, newMember(m, meta), sys.now());
    if (m.type === 'dir') acc.dirs.push([node, meta]);
  }
}

function extract(sys, members, base, acc) {
  for (const m of members) {
    report(acc, m);
    const rel = m.path.replace(/\/+$/, '');
    const parent = rel === '.' ? null : parentFor(sys, base, rel, acc);
    if (parent) placeMember(sys, parent, rel, m, acc);
  }
  // Like tar, set each directory's mode and time once everything inside it is in place.
  for (const [node, meta] of acc.dirs.reverse()) Object.assign(node, { mode: meta.mode, mtime: meta.mtime });
}

function baseDir(sys, o) {
  let dir = sys.cwd;
  for (const item of o.items) {
    if ('name' in item) break;
    dir = normalize(item.dir, dir);
    const d = resolve(sys, dir);
    const problem = d.error ?? (d.node.type === 'dir' ? null : 'ENOTDIR');
    if (problem) return { error: `tar: ${item.dir}: Cannot open: ${errorText(problem)}\n${FATAL}` };
  }
  return { dir };
}

function readOrExtract(sys, o, ctx, acc) {
  const read = readArchive(sys, o, ctx.stdin);
  if (read.stop) return read.stop;
  const base = baseDir(sys, o);
  if (base.error) return result('', base.error, FAILURE);
  const { chosen, missing } = select(read.members, o.items.filter(item => 'name' in item).map(item => item.name));
  if (o.modes.has('t')) for (const m of chosen) report(acc, m);
  else extract(sys, chosen, base.dir, acc);
  for (const name of missing) acc.fail(`tar: ${name}: Not found in archive`);
  return finish(acc);
}

function tar(args, ctx) {
  const { sys } = ctx;
  const o = parseTar(args);
  const problem = usageProblem(o);
  if (problem) return problem;
  const acc = {
    out: '', errs: trailingDirs(o), failed: false, warned: new Set(), dirs: [], width: { value: UGS_WIDTH },
    verbose: o.verbose, verboseToErr: false,
    excludes: o.excludes.map(p => compileGlob(p)),
  };
  // Listing prints every name; with -v, the long form.
  if (o.modes.has('t')) acc.verbose = o.verbose > 0 ? 2 : 1;
  acc.fail = text => {
    acc.errs.push(text);
    acc.failed = true;
  };
  acc.failed = acc.errs.length > 0;
  return o.modes.has('c') ? create(sys, o, ctx, acc) : readOrExtract(sys, o, ctx, acc);
}

export default { tar };
