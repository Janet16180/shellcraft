import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflate, inflate, utf8, fromUtf8 } from '../../src/backend/deflate.js';

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('inflate gives back exactly the bytes deflate took, for text, runs, random and empty data', () => {
  const random = seeded(7);
  const samples = [
    [],
    [65],
    utf8('hello\n'),
    utf8('abcabcabcabcabc'.repeat(300)),
    Array(20000).fill(0),
    Array.from({ length: 3000 }, () => Math.floor(random() * 256)),
    Array.from({ length: 5000 }, () => Math.floor(random() * 4) + 97),
  ];
  for (const bytes of samples) assert.deepEqual(inflate(deflate(bytes)), [...bytes]);
});

test('deflate makes long runs and repetitive text far smaller, and random bytes no smaller', () => {
  assert.ok(deflate(Array(10240).fill(0)).length / 8 < 60);
  const lines = utf8(Array.from({ length: 500 }, (_, i) => `${i + 1}\n`).join(''));
  assert.ok(deflate(lines).length / 8 < lines.length * 0.6);
  const random = seeded(3);
  const noise = Array.from({ length: 2000 }, () => Math.floor(random() * 256));
  assert.ok(deflate(noise).length / 8 > 1900);
});

test('inflate refuses a damaged or cut stream instead of inventing data', () => {
  const bits = deflate(utf8('the river runs to the sea, the river runs\n'));
  assert.equal(inflate(bits.slice(0, bits.length - 9)), null);
  assert.equal(inflate([]), null);
  assert.equal(inflate([1, 1, 1]), null);
});

test('utf8 and fromUtf8 round-trip any string, a lone surrogate included', () => {
  for (const text of ['', 'plain', 'naïve — 𝄞 emoji 🐉', '\ud800 lone', 'end \udc00']) assert.equal(fromUtf8(utf8(text)), text);
  assert.deepEqual(utf8('é'), [0xc3, 0xa9]);
  assert.equal(fromUtf8([0x80, 0x41]), '\ufffdA');
});
