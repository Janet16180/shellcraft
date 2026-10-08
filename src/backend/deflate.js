/**
 * DEFLATE (RFC 1951) over byte arrays, as gzip uses it: LZ77 back references
 * and Huffman codes, one block, fixed or dynamic codes, whichever is shorter.
 * The bit order inside the block is this module's own (Huffman codes are
 * written most significant bit first, everything else least significant bit
 * first, and the caller packs the bits as it likes), so sizes are deflate's
 * while the stream is only read here.
 */

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const END = 256;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const WINDOW = 32768;
const CHAIN = 24;
const KEPT = 48;
const MAX_BITS = 15;
const FIXED = 1;
const DYNAMIC = 2;
const FIXED_LIT = Array.from({ length: 288 }, (_, s) => {
  if (s < 144) return 8;
  if (s < 256) return 9;
  return s < 280 ? 7 : 8;
});
const FIXED_DIST = Array(30).fill(5);

function writer() {
  const bits = [];
  return {
    bits,
    value: (v, n) => { for (let i = 0; i < n; i++) bits.push((v >>> i) & 1); },
    code: (c, n) => { for (let i = n - 1; i >= 0; i--) bits.push((c >>> i) & 1); },
  };
}

function reader(bits) {
  const r = { pos: 0, over: false };
  r.bit = () => {
    if (r.pos >= bits.length) r.over = true;
    return r.over ? 0 : bits[r.pos++];
  };
  r.value = n => {
    let v = 0;
    for (let i = 0; i < n; i++) v |= r.bit() << i;
    return v;
  };
  return r;
}

const indexBelow = (bases, value) => bases.findLastIndex(b => b <= value);

// Code lengths of a Huffman code for these frequencies, none longer than limit.
function codeLengths(freqs, limit) {
  let weights = freqs;
  let lengths = huffman(weights);
  while (Math.max(...lengths) > limit) {
    weights = weights.map(w => (w ? (w >> 1) + 1 : 0));
    lengths = huffman(weights);
  }
  return lengths;
}

function huffman(freqs) {
  const lengths = freqs.map(() => 0);
  let nodes = freqs.flatMap((w, s) => (w > 0 ? [{ w, syms: [s] }] : []));
  if (nodes.length === 1) lengths[nodes[0].syms[0]] = 1;
  while (nodes.length > 1) {
    nodes.sort((a, b) => a.w - b.w);
    const [a, b] = nodes;
    const syms = [...a.syms, ...b.syms];
    for (const s of syms) lengths[s]++;
    nodes = [...nodes.slice(2), { w: a.w + b.w, syms }];
  }
  return lengths;
}

function canonical(lengths) {
  const count = Array(MAX_BITS + 1).fill(0);
  for (const l of lengths) if (l) count[l]++;
  const next = [];
  let code = 0;
  for (let bits = 1; bits <= MAX_BITS; bits++) {
    code = (code + count[bits - 1]) << 1;
    next[bits] = code;
  }
  return lengths.map(l => (l ? next[l]++ : 0));
}

function decoder(lengths) {
  const count = Array(MAX_BITS + 1).fill(0);
  for (const l of lengths) count[l]++;
  count[0] = 0;
  const offsets = [0, 0];
  for (let len = 1; len < MAX_BITS; len++) offsets[len + 1] = offsets[len] + count[len];
  const symbol = [];
  lengths.forEach((l, s) => { if (l) symbol[offsets[l]++] = s; });
  return { count, symbol };
}

function decodeSymbol(r, h) {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len <= MAX_BITS && !r.over; len++) {
    code |= r.bit();
    const count = h.count[len];
    if (code - count < first) return h.symbol[index + (code - first)];
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  return -1;
}

function longestMatch(bytes, i, chains) {
  let best = { length: 0, distance: 0 };
  const list = i + MIN_MATCH <= bytes.length ? chains.get((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]) : undefined;
  const stop = Math.max(0, (list?.length ?? 0) - CHAIN);
  for (let k = (list?.length ?? 0) - 1; k >= stop && best.length < MAX_MATCH; k--) {
    const p = list[k];
    if (i - p > WINDOW) break;
    let length = MIN_MATCH;
    while (i + length < bytes.length && length < MAX_MATCH && bytes[p + length] === bytes[i + length]) length++;
    if (length > best.length) best = { length, distance: i - p };
  }
  return best;
}

function remember(bytes, chains, from, to) {
  for (let p = from; p < to && p + MIN_MATCH <= bytes.length; p++) {
    const key = (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2];
    const list = chains.get(key) ?? [];
    list.push(p);
    if (list.length > KEPT) list.shift();
    chains.set(key, list);
  }
}

function tokenize(bytes) {
  const tokens = [];
  const chains = new Map();
  let i = 0;
  while (i < bytes.length) {
    const { length, distance } = longestMatch(bytes, i, chains);
    const step = length >= MIN_MATCH ? length : 1;
    tokens.push(step > 1 ? { length, distance } : { literal: bytes[i] });
    remember(bytes, chains, i, i + step);
    i += step;
  }
  return tokens;
}

const lengthSymbol = length => 257 + indexBelow(LENGTH_BASE, length);

function frequencies(tokens) {
  const lit = Array(286).fill(0);
  const dist = Array(30).fill(0);
  for (const t of tokens) {
    if ('literal' in t) lit[t.literal]++;
    else {
      lit[lengthSymbol(t.length)]++;
      dist[indexBelow(DIST_BASE, t.distance)]++;
    }
  }
  lit[END] = 1;
  if (!dist.some(Boolean)) dist[0] = 1;
  return { lit, dist };
}

function writeData(w, tokens, litLengths, distLengths) {
  const litCodes = canonical(litLengths);
  const distCodes = canonical(distLengths);
  for (const t of tokens) {
    if ('literal' in t) {
      w.code(litCodes[t.literal], litLengths[t.literal]);
      continue;
    }
    const ls = lengthSymbol(t.length);
    w.code(litCodes[ls], litLengths[ls]);
    w.value(t.length - LENGTH_BASE[ls - 257], LENGTH_EXTRA[ls - 257]);
    const ds = indexBelow(DIST_BASE, t.distance);
    w.code(distCodes[ds], distLengths[ds]);
    w.value(t.distance - DIST_BASE[ds], DIST_EXTRA[ds]);
  }
  w.code(litCodes[END], litLengths[END]);
}

// Code lengths as deflate sends them: runs of zeros (17, 18) and repeats (16) shortened.
function runLengths(lengths) {
  const out = [];
  let i = 0;
  while (i < lengths.length) {
    const l = lengths[i];
    let run = 1;
    while (i + run < lengths.length && lengths[i + run] === l) run++;
    if (l === 0 && run >= 11) out.push({ symbol: 18, extra: Math.min(run, 138) - 11, bits: 7, used: Math.min(run, 138) });
    else if (l === 0 && run >= 3) out.push({ symbol: 17, extra: Math.min(run, 10) - 3, bits: 3, used: Math.min(run, 10) });
    else if (l !== 0 && run >= 4) out.push({ symbol: l, used: 1 }, { symbol: 16, extra: Math.min(run - 1, 6) - 3, bits: 2, used: Math.min(run - 1, 6) });
    else out.push({ symbol: l, used: 1 });
    i += out.at(-1).used + (out.at(-1).symbol === 16 ? 1 : 0);
  }
  return out;
}

function dynamicBlock(tokens) {
  const freqs = frequencies(tokens);
  const litLengths = codeLengths(freqs.lit, MAX_BITS);
  const distLengths = codeLengths(freqs.dist, MAX_BITS);
  const hlit = Math.max(257, litLengths.findLastIndex(Boolean) + 1);
  const hdist = Math.max(1, distLengths.findLastIndex(Boolean) + 1);
  const runs = runLengths([...litLengths.slice(0, hlit), ...distLengths.slice(0, hdist)]);
  const clFreqs = Array(19).fill(0);
  for (const r of runs) clFreqs[r.symbol]++;
  const clLengths = codeLengths(clFreqs, 7);
  const clCodes = canonical(clLengths);
  const hclen = Math.max(4, CODE_LENGTH_ORDER.findLastIndex(s => clLengths[s]) + 1);
  const w = writer();
  w.value(1, 1);
  w.value(DYNAMIC, 2);
  w.value(hlit - 257, 5);
  w.value(hdist - 1, 5);
  w.value(hclen - 4, 4);
  for (const s of CODE_LENGTH_ORDER.slice(0, hclen)) w.value(clLengths[s], 3);
  for (const r of runs) {
    w.code(clCodes[r.symbol], clLengths[r.symbol]);
    if (r.bits) w.value(r.extra, r.bits);
  }
  writeData(w, tokens, litLengths.slice(0, hlit), distLengths.slice(0, hdist));
  return w.bits;
}

function fixedBlock(tokens) {
  const w = writer();
  w.value(1, 1);
  w.value(FIXED, 2);
  writeData(w, tokens, FIXED_LIT, FIXED_DIST);
  return w.bits;
}

/**
 * Compress bytes.
 *
 * @param {number[]|Uint8Array} bytes The data.
 * @returns {number[]} The compressed stream as bits (0 or 1), in order.
 */
export function deflate(bytes) {
  const tokens = tokenize(bytes);
  const fixed = fixedBlock(tokens);
  const dynamic = dynamicBlock(tokens);
  return dynamic.length < fixed.length ? dynamic : fixed;
}

function readDynamicCodes(r) {
  const hlit = r.value(5) + 257;
  const hdist = r.value(5) + 1;
  const hclen = r.value(4) + 4;
  const clLengths = Array(19).fill(0);
  for (const s of CODE_LENGTH_ORDER.slice(0, hclen)) clLengths[s] = r.value(3);
  const cl = decoder(clLengths);
  const lengths = [];
  while (lengths.length < hlit + hdist && !r.over) {
    const s = decodeSymbol(r, cl);
    if (s < 0) return null;
    if (s < 16) lengths.push(s);
    else if (s === 16 && lengths.length) lengths.push(...Array(3 + r.value(2)).fill(lengths.at(-1)));
    else if (s === 17) lengths.push(...Array(3 + r.value(3)).fill(0));
    else if (s === 18) lengths.push(...Array(11 + r.value(7)).fill(0));
    else return null;
  }
  return lengths.length === hlit + hdist ? { lit: lengths.slice(0, hlit), dist: lengths.slice(hlit) } : null;
}

function readData(r, lit, dist) {
  const out = [];
  let symbol = decodeSymbol(r, lit);
  while (symbol !== END && symbol >= 0 && !r.over) {
    if (symbol < END) out.push(symbol);
    else {
      const li = symbol - 257;
      const length = LENGTH_BASE[li] + r.value(LENGTH_EXTRA[li] ?? 0);
      const di = decodeSymbol(r, dist);
      const distance = DIST_BASE[di] + r.value(DIST_EXTRA[di] ?? 0);
      if (li >= LENGTH_BASE.length || !(distance <= out.length)) return null;
      for (let k = 0; k < length; k++) out.push(out[out.length - distance]);
    }
    symbol = decodeSymbol(r, lit);
  }
  return symbol === END && !r.over ? out : null;
}

/**
 * Decompress what deflate() made.
 *
 * @param {number[]} bits The compressed stream.
 * @returns {number[]|null} The bytes, or null if the stream is damaged.
 */
export function inflate(bits) {
  const r = reader(bits);
  const final = r.value(1);
  const type = r.value(2);
  const codes = type === DYNAMIC ? readDynamicCodes(r) : { lit: FIXED_LIT, dist: FIXED_DIST };
  const valid = final === 1 && (type === FIXED || type === DYNAMIC) && codes !== null;
  return valid ? readData(r, decoder(codes.lit), decoder(codes.dist)) : null;
}

/**
 * Encode text as UTF-8; a lone surrogate takes three bytes, so any string comes back whole.
 *
 * @param {string} text Any text.
 * @returns {number[]} The bytes.
 */
export function utf8(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    const low = text.charCodeAt(i + 1);
    if (c >= 0xd800 && c < 0xdc00 && low >= 0xdc00 && low < 0xe000) {
      c = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00);
      i++;
    }
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return bytes;
}

/**
 * Decode what utf8() made; a byte that starts no sequence reads as U+FFFD.
 *
 * @param {number[]} bytes The bytes.
 * @returns {string} The text.
 */
export function fromUtf8(bytes) {
  const units = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let size = 1;
    if (b >= 0xf0) size = 4;
    else if (b >= 0xe0) size = 3;
    else if (b >= 0xc0) size = 2;
    const tail = bytes.slice(i + 1, i + size);
    const ok = tail.length === size - 1 && tail.every(t => (t & 0xc0) === 0x80) && (b < 0x80 || b >= 0xc0);
    const first = [0, 0x7f, 0x1f, 0x0f, 0x07][size] & b;
    const code = ok ? tail.reduce((c, t) => (c << 6) | (t & 63), first) : 0xfffd;
    units.push(String.fromCodePoint(code));
    i += ok ? size : 1;
  }
  return units.join('');
}
