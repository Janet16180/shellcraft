/**
 * The simulator's archive formats: tar and gzip as text that only this
 * module reads.
 *
 * A file's content is text, so an archive is text too. Both formats are
 * opaque to a reader and as long, in UTF-8 bytes, as the real thing would
 * be, or close to it:
 *
 * - tar: per member, a header (its fields as scrambled JSON, then NULs) of
 *   or more where GNU tar needs more for a long name, then the content padded with NULs to a multiple of 512 bytes; then two
 *   zero blocks, all padded to a record of 10240 bytes. Every ASCII
 *   character of the fields and contents goes through a fixed substitution.
 *   Sizes match GNU tar.
 * - gzip: gzip's header (magic, flags, time, the original name), the UTF-8
 *   bytes compressed with DEFLATE (deflate.js) and packed seven bits to a
 *   character, and a trailer with the CRC-32 and length of the original.
 *   Sizes are about an eighth above gzip's.
 *
 * Neither ever contains ESC, so printing an archive cannot drive the terminal.
 */

import { byteLength } from './bytes.js';
import { deflate, inflate, utf8, fromUtf8 } from './deflate.js';

export { byteLength };

const ESC = 0x1b;
const NUL = '\0';
const BLOCK = 512;
const RECORD = 10240;
const NAME_FIELD = 100;
const TYPES = new Set(['file', 'dir', 'symlink']);
const GZIP_MAGIC = '\u001f\u008b\u0008';
const NAME_FLAG = 0x08;
const UNIX = 3;
const TRAILER = 8;
const HEADER = 10;

// A fixed shuffle of the 128 ASCII codes that keeps NUL and ESC in place.
const SCRAMBLE = (() => {
  const free = Array.from({ length: 128 }, (_, i) => i).filter(c => c !== 0 && c !== ESC);
  const shuffled = [...free];
  let seed = 0x5eed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const table = Array.from({ length: 128 }, (_, i) => i);
  free.forEach((c, k) => { table[c] = shuffled[k]; });
  return table;
})();
const UNSCRAMBLE = SCRAMBLE.reduce((back, to, from) => { back[to] = from; return back; }, []);
const mapChars = (text, table) => Array.from(text, c => (c.charCodeAt(0) < 0x80 ? String.fromCharCode(table[c.charCodeAt(0)]) : c)).join('');
const scramble = text => mapChars(text, SCRAMBLE);
const unscramble = text => mapChars(text, UNSCRAMBLE);

const roundUp = (n, size) => Math.ceil(n / size) * size;

// GNU tar's header: one block, plus a ././@LongLink header and the name's
// blocks for each name or link target longer than the 100-byte field.
function headerBytes(path, target, metaBytes) {
  const long = text => (byteLength(text) > NAME_FIELD ? BLOCK + roundUp(byteLength(text) + 1, BLOCK) : 0);
  return Math.max(BLOCK + long(path) + long(target ?? ''), roundUp(metaBytes + 1, BLOCK));
}

const metaOf = m => JSON.stringify({ p: m.path, t: m.type, m: m.mode, o: m.owner, g: m.group, s: m.mtime, n: m.content?.length, l: m.target });

/**
 * Pack members into a tar archive.
 *
 * @param {{path: string, type: 'file'|'dir'|'symlink', mode: number, owner: string, group: string, mtime: number, content?: string, target?: string}[]} members
 *   In archive order; a file has `content`, a link `target`; a directory's path ends with a slash.
 * @returns {string} The archive.
 */
export function packTar(members) {
  const parts = [];
  let bytes = 0;
  for (const m of members) {
    const meta = scramble(metaOf(m));
    const head = headerBytes(m.path, m.target, byteLength(meta));
    const content = m.type === 'file' ? scramble(m.content) : '';
    const body = roundUp(byteLength(content), BLOCK);
    parts.push(meta, NUL.repeat(head - byteLength(meta)), content, NUL.repeat(body - byteLength(content)));
    bytes += head + body;
  }
  parts.push(NUL.repeat(roundUp(bytes + 2 * BLOCK, RECORD) - bytes));
  return parts.join('');
}

function parsed(text) {
  let value = null;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return value !== null && typeof value === 'object' ? value : null;
}

function validMeta(text) {
  const meta = parsed(unscramble(text));
  const names = typeof meta?.p === 'string' && meta.p !== '' && typeof meta.o === 'string' && typeof meta.g === 'string';
  const fields = names && TYPES.has(meta.t) && Number.isInteger(meta.m) && Number.isFinite(meta.s);
  const body = meta?.t === 'file' ? Number.isInteger(meta.n) && meta.n >= 0 : meta?.t !== 'symlink' || typeof meta.l === 'string';
  return fields && body ? meta : null;
}

const allNul = (text, from, to) => to <= text.length && !/[^\0]/.test(text.slice(from, to));

// One member at pos: its fields, its content and where the next one starts, or null.
function readMember(text, pos) {
  const end = text.indexOf(NUL, pos);
  const meta = end > pos ? validMeta(text.slice(pos, end)) : null;
  if (!meta) return null;
  const metaBytes = byteLength(text.slice(pos, end));
  const start = end + headerBytes(meta.p, meta.l, metaBytes) - metaBytes;
  const content = meta.t === 'file' ? text.slice(start, start + meta.n) : '';
  const contentEnd = start + content.length;
  const next = contentEnd + roundUp(byteLength(content), BLOCK) - byteLength(content);
  if (!allNul(text, end, start) || content.length !== (meta.n ?? 0) || !allNul(text, contentEnd, next)) return null;
  const member = { path: meta.p, type: meta.t, mode: meta.m, owner: meta.o, group: meta.g, mtime: meta.s };
  if (meta.t === 'file') member.content = unscramble(content);
  if (meta.t === 'symlink') member.target = meta.l;
  return { member, next };
}

/**
 * Read the members of a tar archive.
 *
 * @param {string} text A file's content.
 * @returns {object[]|null} The members as packTar() takes them, in order, or
 *   null if the text is not a whole tar archive.
 */
export function unpackTar(text) {
  const members = [];
  let pos = 0;
  let ok = text.length > 0;
  while (ok && pos < text.length && text[pos] !== NUL) {
    const read = readMember(text, pos);
    ok = read !== null;
    if (read) {
      members.push(read.member);
      pos = read.next;
    }
  }
  return ok && allNul(text, pos, text.length) ? members : null;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Header and trailer bytes as characters, ESC moved out of the way.
const byteChar = b => (b === ESC ? '\u0100' : String.fromCharCode(b));
const charByte = c => (c === '\u0100' ? ESC : c.charCodeAt(0));
const word32 = n => [0, 8, 16, 24].map(shift => byteChar((n >>> shift) & 0xff)).join('');
const readWord32 = text => [...text].reduce((n, c, i) => n + charByte(c) * 2 ** (8 * i), 0);

const BITS_PER_CHAR = 7;

// The compressed bits, seven to a character, so each character is one byte of the file.
function packBits(bits) {
  const chars = [];
  for (let i = 0; i < bits.length; i += BITS_PER_CHAR) {
    let v = 0;
    for (let k = 0; k < BITS_PER_CHAR; k++) v |= (bits[i + k] ?? 0) << k;
    chars.push(byteChar(v));
  }
  return chars.join('');
}

function unpackBits(text) {
  const bits = [];
  for (const c of text) {
    const v = charByte(c);
    if (v >= 1 << BITS_PER_CHAR) return null;
    for (let k = 0; k < BITS_PER_CHAR; k++) bits.push((v >>> k) & 1);
  }
  return bits;
}

/**
 * Compress text the way gzip does, keeping the original's name and time
 * in the header when given (gzip FILE does; tar -z does not).
 *
 * @param {string} text The original content.
 * @param {{name?: string|null, mtime?: number}} [opts] The original's name and modification time (ms; 0 for none).
 * @returns {string} The compressed content.
 */
export function gzip(text, { name = null, mtime = 0 } = {}) {
  const flags = name === null ? 0 : NAME_FLAG;
  const header = GZIP_MAGIC + byteChar(flags) + word32(Math.floor(mtime / 1000)) + NUL + byteChar(UNIX) + (name === null ? '' : name + NUL);
  const bytes = utf8(text);
  return header + packBits(deflate(bytes)) + word32(crc32(bytes)) + word32(bytes.length);
}

/**
 * @param {string} text A file's content.
 * @returns {boolean} Whether it starts like gzip data.
 */
export const isGzip = text => text.startsWith(GZIP_MAGIC.slice(0, 2));

/**
 * Decompress gzip data.
 *
 * @param {string} text A file's content.
 * @returns {{text: string, name: string|null, mtime: number, size: number, overhead: number}|{error: 'format'|'corrupt'}}
 *   The original text, its stored name and time (ms), its size in bytes and
 *   the bytes of header and trailer; or `format` when it is not gzip data,
 *   `corrupt` when it is damaged.
 */
export function gunzip(text) {
  if (!text.startsWith(GZIP_MAGIC)) return { error: 'format' };
  const named = text.length > HEADER && (charByte(text[3]) & NAME_FLAG) !== 0;
  const nameEnd = named ? text.indexOf(NUL, HEADER) : HEADER - 1;
  const bodyStart = nameEnd + 1;
  if (nameEnd < 0 || text.length < bodyStart + TRAILER) return { error: 'corrupt' };
  const trailer = text.slice(-TRAILER);
  const bits = unpackBits(text.slice(bodyStart, -TRAILER));
  const bytes = bits && inflate(bits);
  const intact = bytes !== null && crc32(bytes) === readWord32(trailer.slice(0, 4)) && bytes.length === readWord32(trailer.slice(4));
  if (!intact) return { error: 'corrupt' };
  return {
    text: fromUtf8(bytes),
    name: named ? text.slice(HEADER, nameEnd) : null,
    mtime: readWord32(text.slice(4, 8)) * 1000,
    size: bytes.length,
    overhead: byteLength(text.slice(0, bodyStart)) + byteLength(trailer),
  };
}

/**
 * The members of a tar archive, gzip-compressed or not.
 *
 * @param {string} text A file's content.
 * @returns {object[]|null} What unpackTar() returns, or null if the text is not a tar archive.
 */
export function archiveMembers(text) {
  const plain = isGzip(text) ? gunzip(text).text : text;
  return plain === undefined ? null : unpackTar(plain);
}
