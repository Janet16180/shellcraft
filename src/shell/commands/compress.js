/**
 * gzip, gunzip and zcat, following gzip 1.12: FILE becomes FILE.gz (and back)
 * with the original's mode and time; errors are status 1, warnings (a file
 * skipped) status 2, and an error outranks a warning.
 */

import { newFile, addChild, removeChild, joinDisp, linkCounts, sizeOf, byteLength } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { compareNames, baseName } from '../../backend/tree.js';
import { can, canChangeEntries, canUnlink } from '../perms.js';
import { groupNames } from '../accounts.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { result, withNote, needInput } from '../result.js';
import { gzip, gunzip } from '../../backend/archive.js';

const ERROR = 1;
const WARNING = 2;
const LONG = {
  '--stdout': 'c', '--to-stdout': 'c', '--decompress': 'd', '--uncompress': 'd', '--force': 'f', '--keep': 'k',
  '--list': 'l', '--recursive': 'r', '--test': 't', '--verbose': 'v',
};
// Suffixes gunzip removes, and what it puts in their place.
const SUFFIXES = [['.gz', ''], ['.tgz', '.tar'], ['.taz', '.tar'], ['-gz', ''], ['.z', ''], ['-z', ''], ['_z', ''], ['.Z', '']];
const GUNZIP_ERRORS = {
  format: 'not in gzip format', eof: 'unexpected end of file', corrupt: 'invalid compressed data--format violated', crc: 'invalid compressed data--crc error',
};
const TO_TERMINAL = 'compressed data not written to a terminal. Use -f to force compression.\nFor help, type: gzip -h';
const FROM_TERMINAL = 'compressed data not read from a terminal. Use -f to force decompression.\nFor help, type: gzip -h';
const LIST_HEAD = '         compressed        uncompressed  ratio uncompressed_name\n';

const suffixOf = name => SUFFIXES.find(([suffix]) => name.length > suffix.length && name.endsWith(suffix)) ?? null;
const ratio = (num, den) => `${(den === 0 ? 0 : (100 * num) / den).toFixed(1).padStart(5)}%`;
// gzip's ratio leaves out its own header and trailer.
const savedRatio = (original, compressed, overhead) => ratio(original - (compressed - overhead), original);

function fail(acc, text, level = ERROR) {
  acc.errs.push(`gzip: ${text}`);
  if (level === ERROR || acc.status === 0) acc.status = level;
}

// Where a decompressing gzip finds TYPED: the name itself, else with .gz added.
function findCompressed(sys, typed) {
  const given = resolve(sys, typed, { follow: false });
  const withGz = given.error === 'ENOENT' && !suffixOf(typed) ? resolve(sys, `${typed}.gz`, { follow: false }) : null;
  if (withGz && !withGz.error) return { ...withGz, shown: `${typed}.gz` };
  return { ...given, shown: given.error === 'ENOENT' && !suffixOf(typed) ? `${typed}.gz` : typed };
}

// Place the output next to the input, replacing it unless -k.
function place(sys, src, outName, content, opts, acc) {
  const out = resolve(sys, outName, { follow: false });
  const owner = sys.user === 'root' ? src.node.owner : sys.user;
  const group = owner === src.node.owner && (sys.user === 'root' || groupNames(sys).includes(src.node.group)) ? src.node.group : groupNames(sys)[0];
  let done = false;
  if (out.node && !opts.force) {
    fail(acc, `${outName} already exists;\tnot overwritten`, WARNING);
    acc.asked = true;
  } else if (!canChangeEntries(sys, src.parent) || (out.node && !canUnlink(sys, out.parent, out.node))) fail(acc, `${outName}: Permission denied`);
  else {
    addChild(src.parent, baseName(out.abs), newFile(content, { mode: src.node.mode, owner, group, mtime: src.node.mtime }), sys.now());
    if (!opts.keep) removeChild(src.parent, baseName(src.abs), sys.now());
    done = true;
  }
  return done;
}

function compressFile(sys, typed, src, opts, acc) {
  const others = (linkCounts(sys.root).get(src.node) ?? 1) - 1;
  if (suffixOf(typed) && !opts.stdout) {
    if (!opts.recursed) fail(acc, `${typed} already has ${suffixOf(typed)[0]} suffix -- unchanged`, WARNING);
  } else if (others > 0 && !opts.stdout && !opts.force) fail(acc, `${typed} has ${others} other link${others > 1 ? 's' : ''} -- file ignored`, WARNING);
  else if (!can(sys, src.node, 'r')) fail(acc, `${typed}: Permission denied`);
  else {
    const packed = gzip(src.node.content, { name: baseName(src.abs), mtime: src.node.mtime });
    if (opts.stdout) acc.out += packed;
    else if (place(sys, src, `${typed}.gz`, packed, opts, acc) && opts.verbose) {
      acc.errs.push(`${typed}:\t${savedRatio(sizeOf(src.node), byteLength(packed), gunzip(packed).overhead)} -- ${opts.keep ? 'created' : 'replaced with'} ${typed}.gz`);
    }
  }
}

function decompressFile(sys, typed, src, opts, acc) {
  const suffix = suffixOf(typed);
  const g = can(sys, src.node, 'r') ? gunzip(src.node.content) : null;
  if (!suffix && !opts.stdout && !opts.test) {
    if (!opts.recursed) fail(acc, `${typed}: unknown suffix -- ignored`, WARNING);
  } else if (!g) fail(acc, `${typed}: Permission denied`);
  else if (g.error) fail(acc, `${typed}: ${GUNZIP_ERRORS[g.error]}`);
  else if (opts.stdout) acc.out += g.text;
  else if (opts.test) acc.tested = true;
  else {
    const outName = typed.slice(0, -suffix[0].length) + suffix[1];
    if (place(sys, src, outName, g.text, opts, acc) && opts.verbose) {
      acc.errs.push(`${typed}:\t${savedRatio(g.size, sizeOf(src.node), g.overhead)} -- ${opts.keep ? 'created' : 'replaced with'} ${outName}`);
    }
  }
}

function treat(sys, typed, opts, acc) {
  const src = opts.decompress ? findCompressed(sys, typed) : { ...resolve(sys, typed, { follow: false }), shown: typed };
  if (src.error) fail(acc, `${src.shown}: ${errorText(src.error)}`);
  else if (src.node.type === 'symlink') fail(acc, `${src.shown}: Too many levels of symbolic links`);
  else if (src.node.type === 'dir' && opts.recursive) {
    if (!can(sys, src.node, 'r') || !can(sys, src.node, 'x')) fail(acc, `${src.shown}: Permission denied`);
    else for (const name of Object.keys(src.node.children).sort(compareNames)) treat(sys, joinDisp(src.shown, name), { ...opts, recursed: true }, acc);
  } else if (src.node.type === 'dir') fail(acc, `${src.shown} is a directory -- ignored`, WARNING);
  else if (opts.decompress) decompressFile(sys, src.shown, src, opts, acc);
  else compressFile(sys, src.shown, src, opts, acc);
}

function listOne(sys, typed, acc, totals) {
  const src = findCompressed(sys, typed);
  const g = !src.error && src.node.type === 'file' && can(sys, src.node, 'r') ? gunzip(src.node.content) : null;
  if (src.error) fail(acc, `${src.shown}: ${errorText(src.error)}`);
  else if (src.node.type === 'dir') fail(acc, `${src.shown} is a directory -- ignored`, WARNING);
  else if (!g) fail(acc, `${src.shown}: Permission denied`);
  else if (g.error) fail(acc, `${src.shown}: ${GUNZIP_ERRORS[g.error]}`);
  else {
    const compressed = sizeOf(src.node);
    const suffix = suffixOf(src.shown);
    const name = suffix ? src.shown.slice(0, -suffix[0].length) + suffix[1] : src.shown;
    acc.out += `${String(compressed).padStart(19)} ${String(g.size).padStart(19)} ${savedRatio(g.size, compressed, g.overhead)} ${name}\n`;
    Object.assign(totals, { compressed: totals.compressed + compressed, size: totals.size + g.size, overhead: g.overhead, any: true });
  }
}

function list(sys, operands, acc) {
  const totals = { compressed: 0, size: 0, overhead: 0, any: false };
  acc.out = LIST_HEAD;
  for (const typed of operands) listOne(sys, typed, acc, totals);
  if (!totals.any) acc.out = '';
  else if (operands.length > 1) acc.out += `${String(totals.compressed).padStart(19)} ${String(totals.size).padStart(19)} ${savedRatio(totals.size, totals.compressed, totals.overhead)} (totals)\n`;
}

// No file: a filter from standard input to standard output.
function filter(name, opts, { stdin }) {
  let r;
  if (opts.decompress && stdin == null && name !== 'zcat') r = result('', `gzip: ${FROM_TERMINAL}`, ERROR);
  else if (stdin == null) r = needInput(name);
  else if (!opts.decompress) r = result(gzip(stdin));
  else {
    const g = gunzip(stdin);
    r = g.error ? result('', `gzip: stdin: ${GUNZIP_ERRORS[g.error]}`, ERROR) : result(g.text);
  }
  return r;
}

const optionsOf = (name, f) => ({
  decompress: name !== 'gzip' || f.has('d') || f.has('t') || f.has('l'), stdout: name === 'zcat' || f.has('c'), force: f.has('f'),
  keep: f.has('k'), recursive: f.has('r'), verbose: f.has('v'), test: f.has('t'), recursed: false,
});

const compressesToTerminal = (opts, operands, { piped }) => !opts.decompress && !piped && !opts.force
  && (opts.stdout || !operands.length || operands.includes('-'));

function compressor(name, args, ctx) {
  const long = mapLongOptions(name, args, LONG, /^$/);
  const o = long.err || long.unsimulated ? long : parseOptions(name, long.args, 'cdfklrtv');
  const failed = optionFailure(name, o, ERROR);
  if (failed) return failed;
  const opts = optionsOf(name, o.flags);
  if (compressesToTerminal(opts, o.rest, ctx)) return result('', `gzip: ${TO_TERMINAL}`, ERROR);
  if (!o.rest.length || (o.rest.length === 1 && o.rest[0] === '-')) return filter(name, opts, ctx);
  const acc = { out: '', errs: [], status: 0, asked: false };
  if (o.flags.has('l')) list(ctx.sys, o.rest, acc);
  else for (const typed of o.rest) treat(ctx.sys, typed, opts, acc);
  const r = result(acc.out, acc.errs.join('\n'), acc.status);
  const asks = acc.asked && ctx.stdin == null;
  return asks ? withNote(r, 'In a real terminal, gzip asks whether to overwrite (y or n) and waits. The game answers no for you; add -f to overwrite.') : r;
}

export default {
  gzip: (args, ctx) => compressor('gzip', args, ctx),
  gunzip: (args, ctx) => compressor('gunzip', args, ctx),
  zcat: (args, ctx) => compressor('zcat', args, ctx),
};
