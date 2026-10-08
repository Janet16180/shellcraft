import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/tower.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const TOWER = `${HOME}/tower`;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [PASSWORD, VAULT, DRAGON, GOLD, GEMS, TEXTS] = chapter.tasks.map(task => task.goal);

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const textOf = result => result.output.map(c => c.text).join('');

function scalesIn(tree, path) {
  const node = nodeAt(tree, path);
  if (node?.type !== 'dir') return path.endsWith('.scale') ? [path] : [];
  return Object.keys(node.children).flatMap(name => scalesIn(tree, `${path}/${name}`));
}

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('new commands and options get a clue in their first goal, the quoted find line is shown in full, and later goals name only the target', () => {
  assert.equal(chapter.tasks.length, 6);
  assert.match(PASSWORD, /`~\/tower\/floor2\/diary\.txt`.*`grep`/);
  assert.match(DRAGON, /`~\/tower\/floor1\/guestbook\.txt`.*`grep` with `-i`/);
  assert.match(GOLD, /`grep` with `-r`.*`~\/tower`/);
  assert.match(GEMS, /`find ~\/tower -name "\*\.gem"`/);
  for (const goal of [VAULT, TEXTS]) assert.doesNotMatch(goal, /`(grep|find)\b/, goal);
});

test('the solve finishes every task on the base world without an error', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
});

test('the tasks may come in any order', async () => {
  const backend = await startChapter(chapter);
  const { done } = await play(chapter, backend, [...chapter.solve].reverse());
  assert.deepEqual(done, chapter.tasks.map(() => true));
});

test('the guestbook writes the dragon in three cases, among other lines', async () => {
  const backend = await startChapter(chapter);
  const text = nodeAt((await backend.observe()).tree, `${TOWER}/floor1/guestbook.txt`).content;
  for (const word of [/\bdragon\b/, /\bDragon\b/, /\bDRAGON\b/]) assert.match(text, word);
  assert.ok(text.split('\n').some(line => line !== '' && !/dragon/i.test(line)));
  assert.doesNotMatch(text, /gold/i, 'gold belongs to the gems only');
});

test('the setup restores a changed tower, adds the guestbook and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, chapter.solve);
  await type(backend, 'rm tower/floor2/diary.txt; echo gone > tower/floor1/guestbook.txt; mkdir tower/floor3/attic; cd /etc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.match(nodeAt(obs.tree, `${TOWER}/floor2/diary.txt`).content, /penguin42/);
  assert.match(nodeAt(obs.tree, `${TOWER}/floor1/guestbook.txt`).content, /DRAGON/);
  assert.equal(nodeAt(obs.tree, `${TOWER}/floor3/attic`), null);
  const { done } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
});

const NEAR_MISSES = [
  [PASSWORD, [], 'cat tower/floor2/diary.txt', 'grep password ~/tower/floor2/diary.txt'],
  [PASSWORD, [], 'grep vault tower/floor2/diary.txt', 'grep password tower/floor2/diary.txt'],
  [PASSWORD, [], 'grep Day tower/floor2/diary.txt', 'grep penguin42 tower/floor2/diary.txt'],
  [PASSWORD, [], 'grep password tower/floor1/note.txt', 'grep -i PASSWORD tower/floor2/diary.txt'],
  [PASSWORD, [], 'grep -r password tower', 'cd tower/floor2; grep password diary.txt'],
  [PASSWORD, [], 'grep password tower/floor2', 'grep -n password tower/floor2/diary.txt'],
  [VAULT, [], 'grep password tower/floor2/diary.txt', 'grep vault ~/tower/floor2/diary.txt'],
  [VAULT, [], 'grep vault tower/floor2', 'grep vault tower/floor2/diary.txt'],
  [VAULT, [], 'cat tower/floor2/diary.txt', 'grep vault tower/floor2/diary.txt'],
  [DRAGON, [], 'grep dragon tower/floor1/guestbook.txt', 'grep -i dragon ~/tower/floor1/guestbook.txt'],
  [DRAGON, [], 'cat tower/floor1/guestbook.txt', 'grep -i DRAGON tower/floor1/guestbook.txt'],
  [DRAGON, [], 'grep -i dragon tower/floor1/note.txt', 'grep -i Dragon tower/floor1/guestbook.txt'],
  [DRAGON, [], 'grep -i a tower/floor1/guestbook.txt', 'grep -in dragon tower/floor1/guestbook.txt'],
  [GOLD, [], 'grep gold tower', 'grep -r gold ~/tower'],
  [GOLD, [], 'grep -r gold tower/floor1', 'grep -r gold tower'],
  [GOLD, [], 'grep gold tower/*/*.gem', 'cd tower; grep -R gold .'],
  [GOLD, [], 'grep -r Day tower', 'grep -ri GOLD tower'],
  [GOLD, ['cd tower'], 'grep -r gold floor1', 'grep -ir gold'],
  [GOLD, ['cd tower/floor1'], 'grep -r gold', 'grep -r gold ..'],
  [GEMS, [], 'find tower', 'find ~/tower -name "*.gem"'],
  [GEMS, [], 'ls -a tower/floor1 tower/floor2 tower/floor3', 'find tower -name "*.gem"'],
  [GEMS, [], 'find ~ -name "*.gem"', 'find tower -name \'*.gem\''],
  [GEMS, [], 'find tower -name "*.txt"', 'find tower -name *.gem'],
  [GEMS, ['cd tower/floor1'], 'find .. -name *.gem', 'find .. -name "*.gem"'],
  [TEXTS, [], 'find tower -name *.txt', 'find ~/tower -name "*.txt"'],
  [TEXTS, [], 'find tower -name "*.gem"', 'find tower -name "*.txt"'],
  [TEXTS, [], 'find tower/floor1 -name "*.txt"', 'cd tower; find . -name "*.txt"'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}, but is by ${JSON.stringify(hit)}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [PASSWORD, [], 'cat tower/floor2/diary.txt', /cat prints the whole diary.*grep password/],
  [PASSWORD, [], 'grep password tower/floor2', /tower\/floor2 is a directory.*-r/],
  [PASSWORD, [], 'grep pasword tower/floor2/diary.txt', /No line matched.*password/],
  [PASSWORD, [], 'grep password tower/floor2/diary.txt', null],
  [VAULT, ['grep password tower/floor2/diary.txt'], 'grep Vault tower/floor2/diary.txt', /No line matched.*vault/],
  [VAULT, ['grep password tower/floor2/diary.txt'], 'cat tower/floor2/diary.txt', /grep vault/],
  [DRAGON, ['grep password tower/floor2/diary.txt', 'grep vault tower/floor2/diary.txt'], 'grep dragon tower/floor1/guestbook.txt', /Dragon or DRAGON.*-i/],
  [DRAGON, ['grep password tower/floor2/diary.txt', 'grep vault tower/floor2/diary.txt'], 'cat tower/floor1/guestbook.txt', /cat prints the whole guestbook/],
  [GOLD, [], 'grep gold tower', /is a directory.*-r/],
  [GOLD, [], 'grep gold tower/*', /is a directory.*-r/],
  [GOLD, [], 'grep -r gold tower/floor1', /not the tower.*~\/tower/],
  [GOLD, ['cd tower/floor1'], 'grep -r gold', /searched ~\/tower\/floor1, not the tower/],
  [GOLD, ['cd tower'], 'grep -r gold', null],
  [GOLD, [], 'grep gold tower/*/*.gem', /-r searches every floor.*hidden/],
  [GOLD, [], 'grep -r gold tower', null],
  [GEMS, [], 'find tower', /every name.*-name "\*\.gem"/],
  [GEMS, [], 'find ~ -name "*.gem"', /more than the tower/],
  [GEMS, ['cd tower/floor1'], 'find .. -name *.gem', /exact name ruby\.gem.*quotes.*"\*\.gem"/],
  [GEMS, ['touch a.gem b.gem'], 'find tower -name *.gem', /exact name a\.gem.*"\*\.gem"/],
  [GEMS, [], 'find tower -name', /needs a pattern/],
  [GEMS, [], 'find tower -name "*.gem"', null],
  [TEXTS, [], 'find tower -name *.txt', /exact name readme\.txt.*"\*\.txt"/],
  [TEXTS, [], 'find tower -name "*.txt"', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('an unquoted pattern that matches names where the player stands reaches find as those names', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'cd tower/floor1');
  const { result } = await type(backend, 'find .. -name *.gem');
  assert.equal(textOf(result), '../floor1/ruby.gem\n');
});

test('the boss room hides one scale deep in a floor, with one NAME line among 60 to 100 others, and brings the player home', async () => {
  const places = new Set();
  const dragons = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.match(secret.scale, /^\/home\/hero\/tower\/floor[123]\/[a-z]+\/[a-z]+\/[acdefhjkmnprtuvwxy34679]{4}\.scale$/);
    assert.deepEqual(scalesIn(obs.tree, TOWER), [secret.scale], `seed ${seed}`);
    const lines = nodeAt(obs.tree, secret.scale).content.split('\n').filter(Boolean);
    assert.ok(lines.length >= 61 && lines.length <= 101, `seed ${seed}: ${lines.length} lines`);
    assert.deepEqual(lines.filter(line => line.includes('NAME')), [`NAME: ${secret.dragon}`]);
    assert.ok(!lines[0].startsWith('NAME') && !lines.at(-1).startsWith('NAME'), 'not at the very top or end');
    assert.match(nodeAt(obs.tree, `${TOWER}/floor1/guestbook.txt`).content, /DRAGON/);
    places.add(secret.scale.split('/').slice(4, 6).join('/'));
    dragons.add(secret.dragon);
  }
  assert.ok(places.size >= 4, [...places].join(', '));
  assert.equal(dragons.size, SEEDS.length);
});

test('the boss is beaten by finding the scale and grepping it for NAME, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    for (const line of lines) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, true], `seed ${seed}: ${lines.join('; ')}`);
  }
});

test('the exact boss hint beats the boss from home, and from inside the tower with a relative path', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
  const { backend, secret } = await startBoss(chapter, 5);
  await type(backend, 'cd tower');
  const relative = secret.scale.slice(`${TOWER}/`.length);
  assert.ok(chapter.boss.done((await type(backend, `grep -i name ${relative}`)).ctx, secret));
});

const BOSS_MISSES = [
  ['grep -r NAME ~/tower', /grep the scale file itself/],
  ['find ~/tower -name "*.scale"', /Found it.*grep/],
  ['grep NAME ~/tower', /is a directory/],
];

for (const [line, note] of BOSS_MISSES) {
  test(`the boss is not beaten by ${JSON.stringify(line)}, and the note says what to do next`, async () => {
    const { backend, secret } = await startBoss(chapter, 7);
    const { ctx } = await type(backend, line);
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

test('reading the whole scale or grepping it for the wrong word does not beat the boss, and says so', async () => {
  const { backend, secret } = await startBoss(chapter, 8);
  const cat = (await type(backend, `cat ${secret.scale}`)).ctx;
  assert.equal(chapter.boss.done(cat, secret), false);
  assertNear(chapter.boss.near(cat, secret), cat, /cat prints every line.*grep NAME/);
  const wrong = (await type(backend, `grep dragon ${secret.scale}`)).ctx;
  assert.equal(chapter.boss.done(wrong, secret), false);
  assertNear(chapter.boss.near(wrong, secret), wrong, /starts with NAME, in capital letters/);
  const ring = (await type(backend, `grep Ring ${secret.scale}`)).ctx;
  assert.equal(chapter.boss.done(ring, secret), false, 'the NAME line must be shown');
});

test('grepping the scale together with a directory does not beat the boss', async () => {
  const { backend, secret } = await startBoss(chapter, 9);
  const { ctx } = await type(backend, `grep -r NAME ${secret.scale} ~/tower/floor1`);
  assert.equal(chapter.boss.done(ctx, secret), false);
});

test('the boss gives no near note for looking around', async () => {
  const { backend, secret } = await startBoss(chapter, 10);
  for (const line of ['ls ~/tower', 'ls -a ~/tower/floor2']) {
    assert.equal(chapter.boss.near((await type(backend, line)).ctx, secret), null, line);
  }
});

test('the scale and its two new directories are kept off the map until an ls lists them', () => {
  const scale = `${TOWER}/floor2/attic/chest/kmpa.scale`;
  assert.deepEqual(chapter.boss.hidden({ scale, dragon: 'Vuxhra' }), [`${TOWER}/floor2/attic`, `${TOWER}/floor2/attic/chest`, scale]);
});

const NOT_COMMANDS = new Set([
  'grep WORD FILE', 'find DIR -name "PATTERN"', 'dragon', 'Dragon', '-i', '-r', '*.gem', '.scale', 'NAME:', '/etc/passwd', '/var/log',
]);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...codeSnippets(chapter.why).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
