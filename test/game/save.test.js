import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, V1_SAVE_KEY, freshSave, parseSave, serializeSave } from '../../src/game/save.js';

const FRESH = { chapter: null, cleared: [], xp: 0, sound: false, introSeen: false, progress: null };
const PROGRESS = { chapter: 'forest', phase: 'quest', tasks: [true, false], hints: [3, 1], bossHints: 0 };
const v2 = fields => JSON.stringify({ version: 2, chapter: 'forest', cleared: ['awakening'], xp: 40, sound: true, introSeen: true, ...fields });

test('the saves live under the v2 key, with the v1 key kept for migration', () => {
  assert.equal(SAVE_KEY, 'shellcraft-save-v2');
  assert.equal(V1_SAVE_KEY, 'shellcraft-save-v1');
});

test('a fresh save has no progress, sound off and the intro unseen', () => {
  assert.deepEqual(freshSave(), FRESH);
  assert.notEqual(freshSave(), freshSave());
});

test('with nothing stored the player starts fresh', () => {
  assert.deepEqual(parseSave({ v2: null, v1: null }), { save: FRESH, status: 'new' });
});

test('a valid v2 save is resumed as stored', () => {
  assert.deepEqual(parseSave({ v2: v2(), v1: null }), {
    save: { chapter: 'forest', cleared: ['awakening'], xp: 40, sound: true, introSeen: true, progress: null },
    status: 'resumed',
  });
});

test('a v2 save written by serializeSave reads back the same', () => {
  const save = { chapter: 'awakening', cleared: [], xp: 10, sound: false, introSeen: true, progress: null };
  assert.deepEqual(parseSave({ v2: serializeSave(save), v1: null }).save, save);
  const playing = { ...save, chapter: 'forest', progress: PROGRESS };
  assert.deepEqual(parseSave({ v2: serializeSave(playing), v1: null }).save, playing);
  const boss = { ...save, progress: { chapter: 'awakening', phase: 'boss', tasks: [true], hints: [0], bossHints: 2 } };
  assert.deepEqual(parseSave({ v2: serializeSave(boss), v1: null }).save, boss);
});

test('duplicate cleared ids are dropped', () => {
  assert.deepEqual(parseSave({ v2: v2({ cleared: ['awakening', 'awakening'] }), v1: null }).save.cleared, ['awakening']);
});

test('a v2 save that is not JSON is damaged and the player starts fresh', () => {
  assert.deepEqual(parseSave({ v2: '{"version":2,', v1: null }), { save: FRESH, status: 'damaged' });
});

test('a v2 save with a wrong field is damaged', () => {
  const broken = [
    'null', '[]', '42',
    v2({ version: 3 }),
    v2({ chapter: 7 }),
    v2({ cleared: 'awakening' }),
    v2({ cleared: [1] }),
    v2({ xp: -5 }),
    v2({ xp: 1.5 }),
    v2({ xp: '40' }),
    v2({ sound: 'yes' }),
    v2({ introSeen: undefined }),
  ];
  for (const text of broken) assert.equal(parseSave({ v2: text, v1: null }).status, 'damaged', text);
});

test('a v2 save wins over a v1 save, even when damaged', () => {
  const v1 = JSON.stringify({ chapter: 3, maxChapter: 3, xp: 200, sound: true });
  assert.equal(parseSave({ v2: v2(), v1 }).status, 'resumed');
  assert.equal(parseSave({ v2: 'oops', v1 }).status, 'damaged');
});

test('a v1 save is migrated: chapter indexes become ids and earlier chapters count as cleared', () => {
  const v1 = JSON.stringify({ chapter: 6, maxChapter: 6, xp: 380, sound: true });
  assert.deepEqual(parseSave({ v2: null, v1 }), {
    save: {
      chapter: 'tower',
      cleared: ['awakening', 'forest', 'unseen', 'camp', 'junkyard', 'library'],
      xp: 380,
      sound: true,
      introSeen: false,
      progress: null,
    },
    status: 'migrated',
  });
});

test('every v1 chapter index maps to its v2 id', () => {
  const ids = ['awakening', 'forest', 'unseen', 'camp', 'junkyard', 'library', 'tower', 'market', 'gate', 'daemon'];
  ids.forEach((id, index) => {
    const v1 = JSON.stringify({ chapter: index, maxChapter: index, xp: 0, sound: false });
    assert.equal(parseSave({ v2: null, v1 }).save.chapter, id);
  });
});

test('a damaged v1 save starts fresh and says so', () => {
  const broken = ['nope', JSON.stringify({ chapter: 10, maxChapter: 0, xp: 0, sound: false }), JSON.stringify({ chapter: 0, maxChapter: -1, xp: 0, sound: false }), JSON.stringify({ chapter: 0, maxChapter: 0, xp: 0 })];
  for (const text of broken) assert.deepEqual(parseSave({ v2: null, v1: text }), { save: FRESH, status: 'damaged' }, text);
});

test('a v2 save written before chapter progress was saved reads as no progress', () => {
  assert.equal(parseSave({ v2: v2(), v1: null }).save.progress, null);
});

test('damaged chapter progress damages the save', () => {
  const broken = [
    'nope',
    { ...PROGRESS, chapter: 3 },
    { ...PROGRESS, phase: 'done' },
    { ...PROGRESS, tasks: 'all' },
    { ...PROGRESS, tasks: [1, 0] },
    { ...PROGRESS, hints: [4, 0] },
    { ...PROGRESS, hints: [1.5, 0] },
    { ...PROGRESS, hints: [0] },
    { ...PROGRESS, bossHints: -1 },
    { ...PROGRESS, bossHints: undefined },
  ];
  for (const progress of broken) assert.equal(parseSave({ v2: v2({ progress }), v1: null }).status, 'damaged', JSON.stringify(progress));
});

test('serializeSave writes the version with the fields', () => {
  const save = { chapter: 'forest', cleared: ['awakening'], xp: 40, sound: true, introSeen: true, progress: PROGRESS };
  assert.deepEqual(JSON.parse(serializeSave(save)), { version: 2, ...save });
});
