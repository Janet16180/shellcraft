import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/junkyard.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const JUNK = `${HOME}/junk`;
const BOOTS = 'old_boots.txt';
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [LOOK, APPLE, BONES, CRATE, TRY, SWEEP, CART] = chapter.tasks.map(task => task.goal);

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const junkNames = obs => Object.keys(nodeAt(obs.tree, JUNK).children).sort();

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('new commands get a clue in their first goal, and later goals name only the target', () => {
  assert.match(APPLE, /`rm` removes a file/);
  assert.match(CRATE, /`rmdir` removes an empty directory/);
  assert.match(SWEEP, /`rm -r`: `-r` means recursive/);
  for (const goal of chapter.tasks.map(task => task.goal)) assert.match(goal, /`~\/junk[^`]*`/, goal);
  for (const goal of [LOOK, BONES, CART]) assert.doesNotMatch(goal, /`(ls|rm|rmdir)\b/, goal);
});

test('the solve finishes every task, and its only error is the rmdir refusal the task asks for', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, ["rmdir junk/cobwebs: rmdir: failed to remove 'junk/cobwebs': Directory not empty\n"]);
  assert.deepEqual(junkNames(await backend.observe()), [BOOTS]);
});

test('the setup rebuilds the junkyard on a changed world and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, [...chapter.solve, 'mkdir junk/box', 'touch junk/box/stone.txt', 'rm junk/old_boots.txt', 'cd /etc']);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(junkNames(obs), ['broken_cart', 'cobwebs', 'empty_crate', 'fish_bones.txt', BOOTS, 'rotten_apple.txt']);
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${JUNK}/broken_cart`).children).sort(), ['plank.txt', 'wheel.txt']);
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${JUNK}/empty_crate`).children), []);
});

const NEAR_MISSES = [
  [LOOK, [], 'ls', 'ls junk'],
  [LOOK, [], 'ls junk/cobwebs', 'ls ~/junk/'],
  [LOOK, [], 'cd junk', 'cd junk; ls'],
  [LOOK, [], 'ls -d junk', 'ls -la junk'],
  [APPLE, [], 'cat junk/rotten_apple.txt', 'rm junk/rotten_apple.txt'],
  [APPLE, [], 'mv junk/rotten_apple.txt .', 'rm ~/junk/rotten_apple.txt'],
  [APPLE, [], 'rm junk/old_boots.txt', 'rm -i ~/junk/rotten_apple.txt'],
  [BONES, [], 'rm junk/rotten_apple.txt', 'rm junk/fish_bones.txt'],
  [BONES, [], 'rm junk/fish_bones', 'rm ~/junk/fish_bones.txt'],
  [CRATE, [], 'rm junk/empty_crate', 'rmdir junk/empty_crate'],
  [CRATE, [], 'rm -r junk/empty_crate', 'rmdir ~/junk/empty_crate/'],
  [TRY, [], 'rmdir junk/empty_crate', 'rmdir junk/cobwebs'],
  [TRY, [], 'rm junk/cobwebs', 'rmdir ~/junk/cobwebs'],
  [TRY, [], 'rmdir junk/old_boots.txt', 'rmdir ~/junk/broken_cart'],
  [TRY, ['rm -r junk/cobwebs'], 'rmdir junk/cobwebs', 'rmdir junk/broken_cart'],
  [SWEEP, [], 'rm junk/cobwebs', 'rm -r junk/cobwebs'],
  [SWEEP, [], 'rmdir junk/cobwebs', 'rm -R ~/junk/cobwebs'],
  [SWEEP, [], 'rm -r junk/broken_cart', 'rm -rf junk/cobwebs/'],
  [CART, [], 'rm junk/broken_cart', 'rm -r junk/broken_cart'],
  [CART, [], 'rm -r junk/cobwebs', 'rm -r ~/junk/broken_cart/'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}, but is by ${JSON.stringify(hit)}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [LOOK, [], 'rm junk/old_boots.txt', /boots are gone.*Restart chapter/],
  [LOOK, [], 'ls', null],
  [APPLE, [], 'mv junk/rotten_apple.txt .', /touch.*rm/],
  [APPLE, [], 'cat junk/rotten_apple.txt', null],
  [BONES, [], 'rm junk/old_boots.txt junk/fish_bones', /boots are gone.*Restart chapter/],
  [CRATE, [], 'rm junk/empty_crate', /Is a directory.*rmdir/],
  [CRATE, [], 'rm -r junk/empty_crate', /mkdir ~\/junk\/empty_crate.*rmdir/],
  [CRATE, [], 'ls junk', null],
  [TRY, [], 'rm -r junk/cobwebs junk/broken_cart', /mkdir ~\/junk\/box.*rmdir ~\/junk\/box/],
  [TRY, [], 'rm -r junk/cobwebs', null],
  [SWEEP, [], 'rm junk/cobwebs', /-r/],
  [SWEEP, ['rmdir junk/cobwebs'], 'rmdir junk/cobwebs', /rmdir refuses.*rm -r/],
  [SWEEP, [], 'rm junk/cobwebs/spider.txt junk/cobwebs/web1.txt junk/cobwebs/web2.txt; rmdir junk/cobwebs', /mkdir ~\/junk\/cobwebs.*rm -r/],
  [SWEEP, [], 'rm -r junk', /boots are gone/],
  [CART, [], 'rm junk/broken_cart', /-r/],
  [CART, [], 'rmdir junk/broken_cart', /-r/],
  [CART, [], 'ls junk/broken_cart', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the rmdir task stays possible when both full directories are gone, as its note says', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, ['rm -r junk/cobwebs junk/broken_cart', 'mkdir ~/junk/box; touch ~/junk/box/stone.txt']);
  assert.equal(chapter.tasks[GOAL[TRY]].done((await type(backend, 'rmdir ~/junk/box')).ctx), true);
});

test('every lost item can be made again and then removed the taught way, as the notes say', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, ['mv junk/rotten_apple.txt .', 'rm -r junk/empty_crate', 'rm junk/cobwebs/spider.txt junk/cobwebs/web1.txt junk/cobwebs/web2.txt; rmdir junk/cobwebs']);
  const steps = [
    [APPLE, 'touch ~/junk/rotten_apple.txt', 'rm ~/junk/rotten_apple.txt'],
    [CRATE, 'mkdir ~/junk/empty_crate', 'rmdir ~/junk/empty_crate'],
    [SWEEP, 'mkdir ~/junk/cobwebs; touch ~/junk/cobwebs/web.txt', 'rm -r ~/junk/cobwebs'],
  ];
  for (const [goal, make, remove] of steps) {
    await type(backend, make);
    assert.equal(chapter.tasks[GOAL[goal]].done((await type(backend, remove)).ctx), true, goal);
  }
});

const kindOf = node => {
  let kind = 'file';
  if (node.type === 'dir') kind = Object.keys(node.children).length === 0 ? 'empty' : 'full';
  return kind;
};

test('the boss room leaves the boots and three new items with random names in the junkyard, and brings the player home', async () => {
  const names = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.match(secret.file, /^\/home\/hero\/junk\/junk_[acdefhjkmnprtuvwxy34679]{3}\.txt$/);
    assert.match(secret.crate, /^\/home\/hero\/junk\/crate_[acdefhjkmnprtuvwxy34679]{3}$/);
    assert.match(secret.pile, /^\/home\/hero\/junk\/pile_[acdefhjkmnprtuvwxy34679]{3}$/);
    const items = [secret.file, secret.crate, secret.pile].map(path => path.slice(JUNK.length + 1));
    assert.deepEqual(junkNames(obs), [BOOTS, ...items].sort(), `seed ${seed}`);
    assert.deepEqual([secret.file, secret.crate, secret.pile].map(path => kindOf(nodeAt(obs.tree, path))), ['file', 'empty', 'full']);
    assert.ok(Object.keys(nodeAt(obs.tree, secret.pile).children).length >= 2, `seed ${seed}`);
    assert.equal(nodeAt(obs.tree, `${JUNK}/${BOOTS}`).content, 'Worn but sturdy leather boots. Keep these!\n');
    items.forEach(name => names.add(name));
  }
  assert.ok(names.size >= 24, [...names].join(', '));
});

test('the boss room clears leftovers of an unfinished chapter and brings back lost boots', async () => {
  const backend = await startChapter(chapter, 2);
  await play(chapter, backend, ['mkdir junk/box', 'rm junk/old_boots.txt', 'cd junk']);
  const room = chapter.boss.setup(() => 0.7, PLAYER);
  await backend.load(room.patch);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(junkNames(obs), [BOOTS, ...[room.secret.file, room.secret.crate, room.secret.pile].map(path => path.slice(JUNK.length + 1))].sort());
});

test('the boss is beaten by looking, then removing the three new items, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    for (const line of lines) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, false, false, true], `seed ${seed}: ${lines.join('; ')}`);
  }
});

test('the items may be removed in any order', async () => {
  const { backend, secret } = await startBoss(chapter, 3);
  for (const line of [`rm -r ${secret.pile}`, `rmdir ${secret.crate}`]) assert.equal(chapter.boss.done((await type(backend, line)).ctx, secret), false, line);
  assert.equal(chapter.boss.done((await type(backend, `rm ${secret.file}`)).ctx, secret), true);
});

test('a junkyard with something else left in it does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 4);
  const { ctx } = await type(backend, `rm ${secret.file}; rmdir ${secret.crate}; rm -r ${secret.pile}; touch junk/new.txt`);
  assert.equal(chapter.boss.done(ctx, secret), false);
});

const BOSS_NOTES = [
  ['removing the boots too', secret => `rm junk/${BOOTS}; rm ${secret.file}; rmdir ${secret.crate}; rm -r ${secret.pile}`, /boots are gone.*Restart chapter/],
  ['removing the whole junkyard', () => 'rm -r junk', /boots are gone.*Restart chapter/],
  ['writing over the boots', secret => `echo boots > junk/${BOOTS}; rm ${secret.file}; rmdir ${secret.crate}; rm -r ${secret.pile}`, /no longer holds.*Restart chapter/],
  ['plain rm on the empty directory', secret => `rm ${secret.crate}`, /rmdir.*rm -r/],
  ['plain rm on the full directory', secret => `rm ${secret.pile}`, /rmdir.*rm -r/],
  ['rmdir on the full directory', secret => `rmdir ${secret.pile}`, /not empty.*rm -r/],
  ['looking around', () => 'ls ~/junk', null],
  ['removing the file', secret => `rm ${secret.file}`, null],
];

for (const [what, line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${what}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    const { ctx } = await type(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

test('the exact boss hint beats the boss from home', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.match(line, /^rm ~\/junk\/junk_\w+\.txt; rmdir ~\/junk\/crate_\w+; rm -r ~\/junk\/pile_\w+$/);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

test('the new items are kept off the map until an ls lists the junkyard', () => {
  const secret = { file: `${JUNK}/junk_abc.txt`, crate: `${JUNK}/crate_abc`, pile: `${JUNK}/pile_abc`, boots: '' };
  assert.deepEqual(chapter.boss.hidden(secret), [secret.file, secret.crate, secret.pile]);
});

const NOT_COMMANDS = new Set(['~/junk', BOOTS, 'y', 'n']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
