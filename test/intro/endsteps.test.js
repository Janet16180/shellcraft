import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFinale, endingOpen, spellsOf, journeyOf, scoreOf, ENDING_STEPS, RING_ZERO_URL } from '../../src/intro/endsteps.js';
import chapters from '../../src/game/chapters/index.js';

const row = (id, status, act = 1, recap = []) => ({ id, number: 0, act, title: id, recap, status, current: false });

test('the finale is the last chapter cleared with no next chapter', () => {
  const list = [row('awakening', 'cleared'), row('travel', 'cleared', 3)];
  assert.equal(isFinale({ kind: 'chapter', id: 'travel', next: null }, list), true);
  assert.equal(isFinale({ kind: 'chapter', id: 'awakening', next: 'travel' }, list), false);
  assert.equal(isFinale({ kind: 'boss', xp: 30 }, list), false);
});

test('clearing a chapter before one still to come is no finale, even with no next chapter open', () => {
  const list = [row('awakening', 'cleared'), row('later', 'soon')];
  assert.equal(isFinale({ kind: 'chapter', id: 'awakening', next: null }, list), false);
});

test('the ending can be watched again once the last chapter is cleared', () => {
  assert.equal(endingOpen([row('a', 'cleared'), row('b', 'cleared')]), true);
  assert.equal(endingOpen([row('a', 'cleared'), row('b', 'playing')]), false);
  assert.equal(endingOpen([row('a', 'cleared'), row('b', 'soon')]), false);
});

test('the spells of a recap are its commands with their options, and the shell signs it uses, once each', () => {
  const recap = [['du -sh ~/library', 'x'], ['tar -czf a.tgz dir', 'x'], ['tar -tf a.tar', 'x'], ['tar -czf b.tgz dir', 'x']];
  assert.deepEqual(spellsOf(recap), ['du -sh', 'tar -czf', 'tar -tf']);
  assert.deepEqual(spellsOf([['sort inventory.txt | uniq -c', ''], ['echo lantern >> stock.txt', '']]), ['sort', '|', 'uniq -c', 'echo', '>>']);
  assert.deepEqual(spellsOf([['mkdir deep && cd deep', ''], ['cd dry || echo the well is dry', ''], ['sleep 300 &', '']]), ['mkdir', '&&', 'cd', '||', 'echo', 'sleep', '&']);
});

test('spells leave out what is not a command name: paths, assignments and loop words', () => {
  const recap = [['wish=gold', ''], ['./open_gate.sh', ''], ['for ore in *.ore; do echo Smelting $ore; done', ''], ['ls 2> /dev/null', ''], ['cd -', '']];
  assert.deepEqual(spellsOf(recap), ['for', '*', 'echo', 'ls', '2>', 'cd -']);
});

test('sudo keeps the command it runs, and chmod its letters', () => {
  assert.deepEqual(spellsOf([['echo hi | sudo tee -a /etc/motd', ''], ['sudo -l', ''], ['chmod +x run.sh', '']]), ['echo', '|', 'sudo', 'tee -a', 'sudo -l', 'chmod +x']);
});

test('the journey groups the written chapters by act, each with its spells', () => {
  const list = [row('a', 'cleared', 1, [['ls -a', '']]), row('b', 'cleared', 2, [['pwd', '']]), row('c', 'soon', 2)];
  list[0].number = 1;
  list[1].number = 2;
  assert.deepEqual(journeyOf(list), [
    { act: 1, name: 'Act I', chapters: [{ number: 1, title: 'a', spells: ['ls -a'], fresh: ['ls -a'] }] },
    { act: 2, name: 'Act II', chapters: [{ number: 2, title: 'b', spells: ['pwd'], fresh: ['pwd'] }] },
  ]);
});

test('a spell is fresh in the chapter that first used it, and not in the chapters after', () => {
  const list = [row('a', 'cleared', 1, [['ls -l', ''], ['cat x', '']]), row('b', 'cleared', 1, [['cat y', ''], ['ln -s a b', '']])];
  const [first, second] = journeyOf(list)[0].chapters;
  assert.deepEqual(first.fresh, ['ls -l', 'cat']);
  assert.deepEqual(second.fresh, ['ln -s']);
});

test('the real chapters give three acts, every chapter with at least one spell', () => {
  const list = chapters.map((c, i) => ({ id: c.id, number: i + 1, act: c.act, title: c.title, recap: c.recap ?? [], status: c.soon ? 'soon' : 'cleared' }));
  const journey = journeyOf(list);
  assert.deepEqual(journey.map(a => a.name), ['Act I', 'Act II', 'Act III']);
  for (const chapter of journey.flatMap(a => a.chapters)) assert.ok(chapter.spells.length > 0, chapter.title);
});

test('the score is the XP, the rank and how many chapters were cleared', () => {
  const view = { xp: 1234, rank: { title: 'Root Wizard' }, chapters: [row('a', 'cleared'), row('b', 'cleared'), row('c', 'open'), row('d', 'soon')] };
  assert.deepEqual(scoreOf(view), { xp: 1234, rank: 'Root Wizard', cleared: 2, total: 3 });
});

test('the ending steps each have a title, a scene and short plain text', () => {
  assert.ok(ENDING_STEPS.length >= 4);
  assert.equal(new Set(ENDING_STEPS.map(s => s.id)).size, ENDING_STEPS.length);
  for (const step of ENDING_STEPS) {
    assert.ok(step.title, step.id);
    assert.ok(['camp', 'descent', 'recap', 'kernel'].includes(step.scene), step.id);
    for (const p of step.text) assert.ok(p.split(/\s+/).length <= 40, `${step.id}: ${p}`);
  }
});

test('the Ring Zero link is a web address', () => {
  assert.match(RING_ZERO_URL, /^https:\/\//);
});
