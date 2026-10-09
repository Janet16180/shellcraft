import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spriteSVG } from '../../src/intro/sprite.js';

const TINY = { pal: 'ink', rows: ['kk.', '.yy'] };

test('a sprite becomes a crisp SVG one unit per pixel, scaled by its size', () => {
  const svg = spriteSVG(TINY, { scale: 4 });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 3 2" width="12" height="8"[^>]*shape-rendering="crispEdges"/);
  assert.match(svg, /aria-hidden="true"/);
});

test('runs of one colour in a row are one rectangle, and dots are left empty', () => {
  const svg = spriteSVG(TINY);
  assert.deepEqual([...svg.matchAll(/<rect [^>]*>/g)].map(m => m[0]), [
    '<rect x="0" y="0" width="2" height="1" fill="#0b0a12"/>',
    '<rect x="1" y="1" width="2" height="1" fill="#ffd348"/>',
  ]);
});

test('colours can be swapped by letter, to dress the same hero as someone else', () => {
  assert.match(spriteSVG(TINY, { colours: { y: '#123456' } }), /fill="#123456"/);
});

test('extra rows can be stacked under the sprite, like the hero\'s legs', () => {
  assert.match(spriteSVG(TINY, { below: ['k.k'] }), /viewBox="0 0 3 3"/);
});

test('a class name is added for styling', () => {
  assert.match(spriteSVG(TINY, { cls: 'hero' }), /class="sprite hero"/);
});
