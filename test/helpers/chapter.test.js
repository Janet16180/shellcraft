import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertChapter, assertChapterList } from './chapter.js';
import { fixtureChapters } from './fixture-chapters.js';

const playable = () => fixtureChapters()[0];

test('a chapter written to the contract passes', () => {
  assert.doesNotThrow(() => assertChapter(playable()));
});

test('a soon placeholder needs only id, act and title', () => {
  assert.doesNotThrow(() => assertChapter({ id: 'unseen', act: 1, title: 'Things Unseen', soon: true }));
  assert.throws(() => assertChapter({ id: 'unseen', act: 1, soon: true }), /title/);
});

test('a bad id or act is rejected', () => {
  assert.throws(() => assertChapter({ ...playable(), id: 'Awakening' }), /id/);
  assert.throws(() => assertChapter({ ...playable(), act: 'I' }), /act/);
});

test('a task without exactly three hints is rejected and named', () => {
  const chapter = playable();
  chapter.tasks[1].hints.pop();
  assert.throws(() => assertChapter(chapter), /task 2: needs exactly 3 hints/);
});

test('a hint with an angle-bracket placeholder is rejected', () => {
  const chapter = playable();
  chapter.tasks[0].hints[2] = 'cat <file>';
  assert.throws(() => assertChapter(chapter), /UPPERCASE/);
});

test('a hint with a real input redirection is accepted', () => {
  const chapter = playable();
  chapter.tasks[0].hints[2] = 'sort < names.txt';
  assert.doesNotThrow(() => assertChapter(chapter));
});

test('missing check functions are rejected', () => {
  const chapter = playable();
  chapter.tasks[0].done = true;
  assert.throws(() => assertChapter(chapter), /done must be a function/);
  const noSolve = playable();
  delete noSolve.boss.solve;
  assert.throws(() => assertChapter(noSolve), /boss: solve/);
});

test('empty lesson text, solve lines or recap are rejected', () => {
  assert.throws(() => assertChapter({ ...playable(), lesson: '  ' }), /lesson/);
  assert.throws(() => assertChapter({ ...playable(), solve: [] }), /solve/);
  assert.throws(() => assertChapter({ ...playable(), recap: [['ls']] }), /recap/);
});

test('a setup that returns a malformed patch is rejected', () => {
  assert.throws(() => assertChapter({ ...playable(), setup: () => [{ op: 'put', path: 'relative' }] }), /absolute/);
  const chapter = playable();
  chapter.boss.setup = () => [];
  assert.throws(() => assertChapter(chapter), /patch, secret/);
});

test('a chapter list with a repeated id or a soon first chapter is rejected', () => {
  const [a, b] = fixtureChapters();
  assert.doesNotThrow(() => assertChapterList(fixtureChapters()));
  assert.throws(() => assertChapterList([a, { ...b, id: 'awakening' }]), /unique/);
  assert.throws(() => assertChapterList([{ id: 'x', act: 1, title: 'X', soon: true }, a]), /first chapter/);
});
