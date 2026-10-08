import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawLinks } from '../../src/intro/links.js';

const DATA = { inode: 1847, lines: ['A map to the old well.'] };
const timing = { at: i => [1.5, 3.25][i], end: 4 };
const count = (html, re) => (html.match(re) ?? []).length;

test('every name is a signpost and the data shows its inode and its text', () => {
  const html = drawLinks({ show: 'signs', signs: [{ name: 'scroll.txt' }, { name: 'copy.txt' }], data: DATA });
  assert.equal(count(html, /class="sign[ "]/g), 2);
  assert.equal(count(html, /class="arrow[ "]/g), 2);
  assert.match(html, /inode 1847/);
  assert.match(html, /A map to the old well\./);
});

test('a signpost added by a line appears when that line has run', () => {
  const html = drawLinks({ show: 'signs', signs: [{ name: 'scroll.txt' }, { name: 'copy.txt', added: 1 }], data: DATA }, timing);
  assert.match(html, /class="sign-row new" style="--d:3\.25s/);
});

test('a removed signpost is left as a crossed-out outline with no arrow to the data', () => {
  const html = drawLinks({ show: 'signs', signs: [{ name: 'scroll.txt', removed: 0 }, { name: 'copy.txt' }], data: DATA }, timing);
  assert.match(html, /class="sign-row gone"/);
  assert.match(html, /<s>scroll\.txt<\/s>/);
});

test('a line written through one name shows in the data', () => {
  const html = drawLinks({ show: 'signs', signs: [{ name: 'copy.txt' }], data: { ...DATA, added: { line: 'Turn left at the oak.', at: 1 } } }, timing);
  assert.match(html, /class="added"[^>]*>Turn left at the oak\./);
});

test('a symlink points at a name, and that name at the directory', () => {
  const html = drawLinks({ show: 'symlink', link: 'portal', target: '/home/hero/forest/cave/deep', dir: 'deep' });
  assert.match(html, /portal/);
  assert.match(html, /\/home\/<wbr>hero\/<wbr>forest\/<wbr>cave\/<wbr>deep/);
  assert.match(html, /deep\//);
  assert.doesNotMatch(html, /broken/);
});

test('a symlink whose target name moved is drawn broken, with the data under its new name', () => {
  const html = drawLinks({ show: 'symlink', link: 'portal', target: '/home/hero/forest/cave/deep', dir: 'deep', moved: { to: 'deeper', at: 0 }, broken: 1 }, timing);
  assert.match(html, /class="ex-links symlink broken"/);
  assert.match(html, /deeper\//);
});

test('the teleport scene has the portal, both places and the hero', () => {
  const html = drawLinks({ show: 'teleport', link: 'portal', from: '~', to: '~/forest/cave/deep', item: 'ancient_key.txt', at: 0 }, timing);
  for (const part of ['portal', '~/forest/cave/deep', 'ancient_key.txt', 'walker']) assert.ok(html.includes(part), part);
});

test('the recap table turns yes and no into marks and keeps other cells as written', () => {
  const html = drawLinks({ show: 'table', head: ['Hard link', 'Soft link'], rows: [['Points at', 'the data', 'a name'], ['Survives', 'yes', 'no']] });
  assert.equal(count(html, /<tr/g), 3);
  assert.match(html, /<span class="chip yes">yes<\/span>/);
  assert.match(html, /<span class="chip no">no<\/span>/);
  assert.match(html, /<td[^>]*>the data<\/td>/);
});

test('an unknown drawing is a bug in the explainer data', () => {
  assert.throws(() => drawLinks({ show: 'maze' }), /maze/);
});

test('the inode lights up when a line shows it', () => {
  const html = drawLinks({ show: 'signs', signs: [{ name: 'scroll.txt' }], data: { ...DATA, mark: 0 } }, timing);
  assert.match(html, /class="inode marked" style="--d:1\.50s"/);
});
