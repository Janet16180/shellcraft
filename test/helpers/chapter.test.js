import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertChapter, assertChapterList, assertExplainer, sentenceCount } from './chapter.js';
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

test('a boss hint may be a function of the secret, checked with the secret from setup', () => {
  const chapter = playable();
  chapter.boss.hints[2] = secret => `touch ${secret.name}`;
  assert.doesNotThrow(() => assertChapter(chapter));
  chapter.boss.hints[2] = () => '';
  assert.throws(() => assertChapter(chapter), /boss: hint 3 must be non-empty text/);
  chapter.boss.hints[2] = () => 'touch <name>';
  assert.throws(() => assertChapter(chapter), /UPPERCASE/);
});

test('a task hint cannot be a function', () => {
  const chapter = playable();
  chapter.tasks[0].hints[2] = () => 'pwd';
  assert.throws(() => assertChapter(chapter), /task 1: hint 3 must be non-empty text/);
});

test('every task needs a tip of non-empty text, at most 140 characters', () => {
  const withTip = tip => {
    const chapter = playable();
    chapter.tasks[0].tip = tip;
    return chapter;
  };
  assert.doesNotThrow(() => assertChapter(withTip('pwd prints the directory you are in.')));
  assert.throws(() => assertChapter(withTip(undefined)), /task 1: tip must be non-empty text/);
  assert.throws(() => assertChapter(withTip('  ')), /task 1: tip must be non-empty text/);
  assert.throws(() => assertChapter(withTip('x'.repeat(141))), /task 1: tip .*140/);
});

test('near is optional for tasks and the boss, but must be a function when present', () => {
  const chapter = playable();
  chapter.tasks[1].near = () => null;
  chapter.boss.near = () => null;
  assert.doesNotThrow(() => assertChapter(chapter));
  chapter.tasks[1].near = 'close';
  assert.throws(() => assertChapter(chapter), /task 2: near must be a function/);
  const boss = playable();
  boss.boss.near = 'close';
  assert.throws(() => assertChapter(boss), /boss: near must be a function/);
});

test('hidden is optional for the boss, but must be a function of the secret returning paths', () => {
  const chapter = playable();
  chapter.boss.hidden = secret => [`/home/hero/${secret.name ?? 'x'}`];
  assert.doesNotThrow(() => assertChapter(chapter));
  chapter.boss.hidden = 'note';
  assert.throws(() => assertChapter(chapter), /boss: hidden must be a function/);
  chapter.boss.hidden = () => ['relative'];
  assert.throws(() => assertChapter(chapter), /boss: hidden must return absolute paths/);
});

test('missing check functions are rejected', () => {
  const chapter = playable();
  chapter.tasks[0].done = true;
  assert.throws(() => assertChapter(chapter), /done must be a function/);
  const noSolve = playable();
  delete noSolve.boss.solve;
  assert.throws(() => assertChapter(noSolve), /boss: solve/);
});

test('empty lesson text, why, solve lines or recap are rejected', () => {
  assert.throws(() => assertChapter({ ...playable(), lesson: '  ' }), /lesson/);
  assert.throws(() => assertChapter({ ...playable(), why: '' }), /why/);
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

const explainer = () => ({
  id: 'signs',
  title: 'Signs',
  draw: () => '<div></div>',
  steps: [{ title: 'One', text: ['A sign points at a file. Read <code>a.txt</code> with <code>cat</code>.'], diagram: {}, term: [{ type: 'cat a.txt', output: ['hi'] }] }],
});

test('a chapter may declare an explainer that follows the contract', () => {
  assert.doesNotThrow(() => assertChapter({ ...playable(), explainer: explainer() }));
});

test('an explainer caption longer than three sentences is rejected and named', () => {
  const long = explainer();
  long.steps[0].text.push('One. Two.');
  assert.throws(() => assertExplainer(long), /step 1: the caption has 4 sentences/);
});

test('an explainer step without a diagram, or with an unknown sound, is rejected', () => {
  const bare = explainer();
  delete bare.steps[0].diagram;
  assert.throws(() => assertExplainer(bare), /needs a diagram/);
  const loud = explainer();
  loud.steps[0].sound = 'trumpet';
  assert.throws(() => assertExplainer(loud), /sound must be one of/);
});

test('dots inside code do not end a sentence', () => {
  assert.equal(sentenceCount('Run <code>ls -l a.txt</code>. Then read <code>b.txt</code>.'), 2);
});

test('an explainer draw that raises fails the check', () => {
  const broken = explainer();
  broken.draw = () => { throw new Error('no drawing called pie'); };
  assert.throws(() => assertExplainer(broken), /pie/);
});
