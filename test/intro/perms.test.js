import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permClass, lettersFor, ladder, mayRead, drawPerms } from '../../src/intro/perms.js';

const PLANS = { mode: '-rw-r-----', owner: 'mira', group: 'smiths', size: 812, name: 'plans.txt' };
const MIRA = { user: 'mira', groups: ['mira', 'smiths'] };
const OREN = { user: 'oren', groups: ['oren', 'smiths'] };
const HERO = { user: 'hero', groups: ['hero'] };
const answers = rungs => rungs.map(r => r.answer);

test('the owner gets the owner letters, even when also in the group', () => {
  assert.equal(permClass(PLANS, MIRA), 'owner');
  assert.equal(lettersFor(PLANS, 'owner'), 'rw-');
});

test('someone in the file\'s group who is not the owner gets the group letters', () => {
  assert.equal(permClass(PLANS, OREN), 'group');
  assert.equal(lettersFor(PLANS, 'group'), 'r--');
});

test('anyone else gets the last three letters', () => {
  assert.equal(permClass(PLANS, HERO), 'other');
  assert.equal(lettersFor(PLANS, 'other'), '---');
});

test('the ladder answers each question in order and never asks past the first yes', () => {
  assert.deepEqual(answers(ladder(PLANS, MIRA)), ['yes', 'not asked', 'not asked']);
  assert.deepEqual(answers(ladder(PLANS, OREN)), ['no', 'yes', 'not asked']);
  assert.deepEqual(answers(ladder(PLANS, HERO)), ['no', 'no', 'yes']);
  assert.deepEqual(ladder(PLANS, OREN).map(r => r.letters), ['rw-', 'r--', '---']);
});

test('the owner of a ---r--r-- file is denied although everyone else may read it', () => {
  const notes = { mode: '----r--r--', owner: 'hero', group: 'hero', size: 40, name: 'notes.txt' };
  assert.equal(permClass(notes, HERO), 'owner');
  assert.equal(mayRead(lettersFor(notes, 'owner')), false);
  assert.equal(mayRead(lettersFor(notes, 'other')), true);
});

test('reading needs an r in the letters that count', () => {
  assert.deepEqual(['rw-', 'r--', '---', '-w-'].map(mayRead), [true, true, false, false]);
});

test('a mode that is not ten characters is a bug in the explainer data', () => {
  assert.throws(() => lettersFor({ ...PLANS, mode: 'rw-r-----' }, 'owner'), /mode/);
});

test('the sets diagram colours the file line and splits its mode into the three sets', () => {
  const html = drawPerms({ show: 'sets', file: PLANS });
  assert.match(html, /<span class="perm-owner">rw-<\/span><span class="perm-group">r--<\/span><span class="perm-other">---<\/span>/);
  assert.match(html, /<span class="perm-owner">mira<\/span> <span class="perm-group">smiths<\/span>/);
  for (const who of ['owner', 'group', 'everyone else']) assert.match(html, new RegExp(who));
});

test('the ladder diagram lights the rung that counts and gives the verdict', () => {
  const html = drawPerms({ show: 'ladder', file: PLANS, people: [OREN] });
  assert.equal((html.match(/class="rung [^"]*\bmatch\b/g) ?? []).length, 1);
  assert.match(html, /class="rung [^"]*\bmatch\b[^"]*" data-cls="group"/);
  assert.match(html, /may read/i);
});

test('the walk diagram has one column per person and one verdict each', () => {
  const html = drawPerms({ show: 'walk', file: PLANS, people: [MIRA, OREN, HERO] });
  assert.equal((html.match(/class="verdict /g) ?? []).length, 3);
  assert.equal((html.match(/class="verdict yes/g) ?? []).length, 2);
});

test('an unknown diagram is a bug in the explainer data', () => {
  assert.throws(() => drawPerms({ show: 'pie', file: PLANS }), /pie/);
});
