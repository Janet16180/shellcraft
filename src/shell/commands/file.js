/**
 * file, following file 5.45: one line per name saying what it holds,
 * judged from its type, mode and first bytes. The simulator knows the kinds
 * a beginner meets: text, scripts, gzip data, tar archives, programs,
 * directories, links and /dev/null.
 */

import { sizeOf } from '../fs.js';
import { resolve, errorText } from '../paths.js';
import { can } from '../perms.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { result } from '../result.js';
import { gunzip, isGzip, unpackTar } from '../../backend/archive.js';

const USAGE = `Usage: file [-bcCdEhikLlNnprsSvzZ0] [--apple] [--extension] [--mime-encoding]
            [--mime-type] [-e <testname>] [-F <separator>]  [-f <namefile>]
            [-m <magicfiles>] [-P <parameter=value>] [--exclude-quiet]
            <file> ...
       file -C [-m <magicfiles>]
       file [--help]`;
const LONG = { '--brief': 'b', '--dereference': 'L', '--no-dereference': 'h' };
const ELF = 'ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// file's longest ordinary line; a longer one is mentioned.
const LONG_LINE = 300;
// Bytes that make text binary for file: controls other than \a\b\t\n\v\f\r and ESC, and DEL.
const binaryChar = code => code <= 0x06 || (code >= 0x0e && code <= 0x1a) || (code >= 0x1c && code <= 0x1f) || code === 0x7f;
const hasChar = (text, test) => Array.prototype.some.call(text, c => test(c.charCodeAt(0)));
const INTERPRETERS = { bash: 'Bourne-Again shell script', sh: 'POSIX shell script', python: 'Python script', python3: 'Python script', perl: 'Perl script text' };

const two = n => String(n).padStart(2, '0');
// The C library's asctime, in UTC: `Thu Oct  8 14:50:56 2026`.
function asctime(ms) {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} ${d.getUTCFullYear()}`;
}

// A made-up build id per program, as stable as a real binary's.
function buildId(name) {
  let h = 0x811c9dc5;
  const words = [];
  for (let k = 0; k < 5; k++) {
    for (const ch of `${name}#${k}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    words.push(h.toString(16).padStart(8, '0'));
  }
  return words.join('');
}

function gzipText(content) {
  const g = gunzip(content);
  const parts = ['gzip compressed data'];
  if (g.name) parts.push(`was "${g.name}"`);
  if (g.mtime) parts.push(`last modified: ${asctime(g.mtime)}`);
  parts.push('from Unix');
  if (!g.error) parts.push(`original size modulo 2^32 ${g.size}`);
  return parts.join(', ');
}

function scriptKind(content) {
  if (!content.startsWith('#!')) return null;
  const words = content.slice(2, content.indexOf('\n') < 0 ? undefined : content.indexOf('\n')).trim().split(/\s+/);
  const program = words[0].split('/').pop() === 'env' && words[1] ? words[1] : words[0].split('/').pop();
  return INTERPRETERS[program] ?? `a ${words.join(' ')} script`;
}

function textKind(content) {
  if (hasChar(content, binaryChar)) return 'data';
  const encoding = hasChar(content, code => code > 0x7f) ? 'Unicode text, UTF-8 text' : 'ASCII text';
  const script = scriptKind(content);
  const parts = [script ? `${script}, ${encoding} executable` : encoding];
  const longest = Math.max(...content.split('\n').map(line => line.length));
  if (longest > LONG_LINE) parts.push(`with very long lines (${longest})`);
  if (!content.includes('\n')) parts.push('with no line terminators');
  else if (content.includes('\r\n')) parts.push('with CRLF line terminators');
  if (content.includes('\u001b')) parts.push('with escape sequences');
  return parts.join(', ');
}

// What the content of a regular file one may read is.
function contentKind(node) {
  const { content } = node;
  const members = isGzip(content) ? null : unpackTar(content);
  let kind;
  if (content.startsWith('\u007fELF')) kind = `${ELF}, BuildID[sha1]=${buildId(node.bin ?? '')}, for GNU/Linux 3.2.0, stripped`;
  else if (sizeOf(node) === 0) kind = 'empty';
  else if (sizeOf(node) === 1) kind = 'very short file (no magic)';
  else if (isGzip(content)) kind = gzipText(content);
  else if (members?.length) kind = 'POSIX tar archive (GNU)';
  else kind = textKind(content);
  return kind;
}

// setuid, setgid and sticky, in file's odd punctuation.
function withModeWords(node, kind) {
  const words = [[0o4000, 'setuid'], [0o2000, 'setgid'], [0o1000, 'sticky']].filter(([bit]) => node.mode & bit).map(([, w]) => w);
  if (!words.length) return kind;
  if (kind.startsWith('ELF')) return `${words.join(' ')} ${kind}`;
  return /text/.test(kind) && node.type === 'file' && kind !== 'empty' ? `${words.join(' ')} , ${kind}` : `${words.join(', ')}, ${kind}`;
}

function describe(sys, name, follow) {
  const r = resolve(sys, name, { follow });
  const { node } = r;
  let kind;
  if (r.error) kind = `cannot open \`${name}' (${errorText(r.error)})`;
  else if (node.type === 'symlink') kind = `${resolve(sys, name).error ? 'broken ' : ''}symbolic link to ${node.target}`;
  else if (node.dev === 'null') kind = 'character special (1/3)';
  else if (node.type === 'dir') kind = withModeWords(node, 'directory');
  else if (!can(sys, node, 'r')) kind = 'regular file, no read permission';
  else kind = withModeWords(node, contentKind(node));
  return kind;
}

function fileCommand(args, { sys }) {
  const long = mapLongOptions('file', args, LONG, /^$/);
  const o = long.err || long.unsimulated ? long : parseOptions('file', long.args, 'bLh');
  const failed = optionFailure('file', o, 1);
  if (failed) return failed;
  if (!o.rest.length) return result('', USAGE, 1);
  const follow = o.flags.has('L');
  const width = Math.max(...o.rest.map(name => name.length + 1));
  const lines = o.rest.map(name => {
    const kind = describe(sys, name, follow);
    return o.flags.has('b') ? kind : `${`${name}:`.padEnd(width)} ${kind}`;
  });
  return result(lines.map(line => `${line}\n`).join(''));
}

export default { file: fileCommand };
