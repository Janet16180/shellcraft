import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/well.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const WELL = `${HOME}/well`;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [VARIABLE, DOUBLE, SINGLE, STATUS, ERRORS, NULL, BOTH, AND, OR] = chapter.tasks.map(task => task.goal);
const WISHED = ['wish=gold'];

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const textOf = result => result.output.map(c => c.text).join('');

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('new ideas get a clue in their first goal, and every goal names its target', () => {
  assert.equal(chapter.tasks.length, 9);
  assert.match(VARIABLE, /`wish=gold`.*no spaces.*`echo \$wish`/);
  assert.match(DOUBLE, /`echo "I wish for \$wish"`/);
  assert.match(SINGLE, /single quotes/);
  assert.match(STATUS, /`~\/well\/bucket\.txt`.*right after.*`echo \$\?`/);
  assert.match(ERRORS, /`~\/well\/errors\.txt`.*`2>`/);
  assert.match(NULL, /`\/dev\/null`/);
  assert.match(BOTH, /`~\/well`.*`~\/well\/bucket\.txt`.*`~\/well\/list\.txt`.*`\/dev\/null`/);
  assert.match(AND, /`~\/well\/deep`.*`&&`/);
  assert.match(OR, /`~\/well\/dry`.*`the well is dry`.*`\|\|`/);
});

test('the lesson explains variables, both quotes, $?, the two streams, /dev/null, && and ||', () => {
  assert.match(chapter.lesson, /No spaces around the <code>=<\/code>/);
  assert.match(chapter.lesson, /double quotes.*still works.*single quotes.*nothing is special/s);
  assert.match(chapter.lesson, /<code>0<\/code> means it worked, any other number means it failed/);
  assert.match(chapter.lesson, /right after the command.*next command.*sets a new one/s);
  assert.match(chapter.lesson, /stream 1.*stream 2/s);
  assert.match(chapter.lesson, /throws away everything/);
  assert.match(chapter.lesson, /runs <code>B<\/code> only if <code>A<\/code> worked.*only if <code>A<\/code> failed/s);
});

test('the solve finishes every task, and fails only where the tasks expect it', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, [
    "ls ~/well/bucket.txt: ls: cannot access '/home/hero/well/bucket.txt': No such file or directory\n",
    'cd ~/well/dry || echo the well is dry: bash: cd: /home/hero/well/dry: No such file or directory\n',
  ]);
  const obs = await backend.observe();
  assert.equal(nodeAt(obs.tree, `${WELL}/errors.txt`).content, "ls: cannot access '/home/hero/well/bucket.txt': No such file or directory\n");
  assert.equal(nodeAt(obs.tree, `${WELL}/list.txt`).content, '/home/hero/well:\nerrors.txt\nlist.txt\nsign.txt\n');
  assert.equal(obs.cwd, `${WELL}/deep`);
});

test('the lines print what a real bash prints', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'wish=gold');
  assert.equal(textOf((await type(backend, 'echo "I wish for $wish"')).result), 'I wish for gold\n');
  assert.equal(textOf((await type(backend, "echo 'I wish for $wish'")).result), 'I wish for $wish\n');
  await type(backend, 'ls ~/well/bucket.txt');
  assert.equal(textOf((await type(backend, 'echo $?')).result), '2\n');
  assert.equal(textOf((await type(backend, 'echo $?')).result), '0\n');
  assert.equal(textOf((await type(backend, 'ls ~/well/bucket.txt 2> /dev/null')).result), '');
});

test('the setup puts back a well holding only its sign, and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, chapter.solve);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(Object.keys(nodeAt(obs.tree, WELL).children), ['sign.txt']);
});

const NEAR_MISSES = [
  [VARIABLE, [], 'echo $wish', 'wish=gold && echo $wish'],
  [VARIABLE, WISHED, 'echo gold', 'echo $wish'],
  [VARIABLE, WISHED, 'echo wish', 'echo ${wish}'],
  [DOUBLE, WISHED, 'echo "I wish for gold"', 'echo "I wish for $wish"'],
  [DOUBLE, WISHED, 'echo I wish for $wish', 'echo "I wish for $wish"'],
  [DOUBLE, [], 'echo "I wish for $wish"', null],
  [SINGLE, WISHED, 'echo "I wish for $wish"', "echo 'I wish for $wish'"],
  [STATUS, ['ls ~/well'], 'echo $?', null],
  [STATUS, ['ls ~/well/bucket.txt'], 'echo ?', 'echo $?'],
  [ERRORS, [], 'ls ~/well/bucket.txt > ~/well/errors.txt', 'ls ~/well/bucket.txt 2> ~/well/errors.txt'],
  [ERRORS, [], 'ls ~/well/bucket.txt', 'cd ~/well && ls bucket.txt 2> errors.txt'],
  [ERRORS, [], 'ls ~/well/bucket.txt 2> ~/well/oops.txt', 'ls ~/well/bucket.txt 2>> ~/well/errors.txt'],
  [NULL, [], 'ls ~/well/bucket.txt > /dev/null', 'ls ~/well/bucket.txt 2> /dev/null'],
  [NULL, [], 'ls ~/well/bucket.txt', 'ls ~/well/bucket.txt 2>/dev/null'],
  [BOTH, [], 'ls ~/well ~/well/bucket.txt > ~/well/list.txt', 'ls ~/well ~/well/bucket.txt 2> /dev/null > ~/well/list.txt'],
  [BOTH, [], 'ls ~/well ~/well/bucket.txt 2> /dev/null', 'ls ~/well ~/well/bucket.txt > ~/well/list.txt 2> /dev/null'],
  [BOTH, [], 'ls ~/well > ~/well/list.txt 2> /dev/null', 'ls ~/well/bucket.txt ~/well > ~/well/list.txt 2> /dev/null'],
  [AND, [], 'mkdir ~/well/deep', 'mkdir ~/well/deep && cd ~/well/deep'],
  [AND, ['mkdir ~/well/deep'], 'mkdir ~/well/deep && cd ~/well/deep', null],
  [OR, [], 'cd ~/well/dry && echo the well is dry', 'cd ~/well/dry || echo the well is dry'],
  [OR, [], 'echo the well is dry', 'cd ~/well/dry || echo the well is dry'],
  [OR, ['mkdir ~/well/dry'], 'cd ~/well/dry || echo the well is dry', null],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [VARIABLE, [], '$wish=gold', /No \$ when you make a variable/],
  [VARIABLE, [], 'wish = gold', /No spaces around =/],
  [VARIABLE, [], 'echo $wish', /never made.*wish=gold/],
  [VARIABLE, WISHED, 'echo wish', /Without the \$/],
  [VARIABLE, WISHED, 'echo gold', /Print the variable/],
  [VARIABLE, WISHED, 'echo $wish', null],
  [DOUBLE, [], 'echo "I wish for $wish"', /wish is empty/],
  [DOUBLE, WISHED, "echo 'I wish for $wish'", /Single quotes keep.*double quotes/],
  [DOUBLE, WISHED, 'echo "I wish for gold"', /Let the variable fill it in/],
  [DOUBLE, WISHED, 'echo "I wish for $wish"', null],
  [SINGLE, WISHED, 'echo "I wish for $wish"', /Double quotes let.*single quotes/],
  [SINGLE, WISHED, "echo 'I wish for $wish'", null],
  [STATUS, ['ls ~/well'], 'echo $?', /0 means.*worked.*very next line/],
  [STATUS, ['ls ~/well/bucket.txt'], 'echo ?', /\$\? with nothing between/],
  [STATUS, ['ls ~/well/bucket.txt'], 'echo $?', null],
  [ERRORS, [], 'ls ~/well/bucket.txt > ~/well/errors.txt', /> catches only.*2>/],
  [ERRORS, [], 'ls ~/well/bucket.txt 2> ~/well/oops.txt', /somewhere else/],
  [ERRORS, [], 'ls ~/well/bucket.txt', /Add 2> ~\/well\/errors\.txt/],
  [ERRORS, [], 'ls ~/well/bucket.txt 2> ~/well/errors.txt', null],
  [NULL, [], 'ls ~/well/bucket.txt > /dev/null', /needs 2>/],
  [NULL, [], 'ls ~/well/bucket.txt', /Add 2> \/dev\/null/],
  [BOTH, [], 'ls ~/well ~/well/bucket.txt > ~/well/list.txt', /error came to the screen.*2> \/dev\/null/],
  [BOTH, [], 'ls ~/well ~/well/bucket.txt 2> /dev/null', /list came to the screen.*> ~\/well\/list\.txt/],
  [BOTH, [], 'ls ~/well > ~/well/list.txt 2> /dev/null', /both paths/],
  [BOTH, [], 'ls ~/well ~/well/bucket.txt > ~/well/list.txt 2> /dev/null', null],
  [AND, ['mkdir ~/well/deep'], 'mkdir ~/well/deep && cd ~/well/deep', /already there.*rmdir/],
  [AND, [], 'mkdir ~/well/deep', /one line.*&&/],
  [AND, [], 'mkdir ~/well/deep && cd ~/well/deep', null],
  [OR, [], 'cd ~/well/dry && echo the well is dry', /Use \|\|/],
  [OR, ['mkdir ~/well/dry'], 'cd ~/well/dry || echo the well is dry', /rmdir ~\/well\/dry/],
  [OR, [], 'cd ~/well/dry || echo the well is dry', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss room names three random stones on the wall, and one of them is missing', async () => {
  const rooms = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.equal(secret.paths.length, 3);
    assert.ok(secret.paths.includes(secret.missing));
    const wall = nodeAt(obs.tree, `${WELL}/wall.txt`).content;
    for (const path of secret.paths) assert.ok(wall.includes(path.replace(HOME, '~')), `seed ${seed}: ${path}`);
    assert.equal(nodeAt(obs.tree, secret.missing), null);
    const present = secret.paths.filter(path => path !== secret.missing);
    for (const path of present) assert.match(nodeAt(obs.tree, path).content, /^[a-z]+\n$/);
    assert.equal(nodeAt(obs.tree, secret.words), null);
    rooms.add(`${secret.paths.join()}-${secret.missing}`);
  }
  assert.ok(rooms.size >= 10);
});

test('the boss is beaten by reading the wall, then one cat with > and 2> /dev/null, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const lines = chapter.boss.solve(obs);
    const done = [];
    let last = null;
    for (const line of lines) {
      const turn = await type(backend, line);
      done.push(chapter.boss.done(turn.ctx, secret));
      last = turn.result;
    }
    assert.deepEqual(done, [false, true], `seed ${seed}: ${lines.join('; ')}`);
    assert.equal(textOf(last), '', `seed ${seed}`);
  }
});

test('the boss accepts the redirections in either order, and the stones in any order', async () => {
  const { backend, secret } = await startBoss(chapter, 4);
  const paths = [...secret.paths].reverse().map(path => path.replace(HOME, '~')).join(' ');
  assert.ok(chapter.boss.done((await type(backend, `cat ${paths} 2>/dev/null >~/well/words.txt`)).ctx, secret));
});

test('the exact boss hint beats the boss from anywhere', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

const BOSS_NOTES = [
  [paths => `cat ${paths} > ~/well/words.txt`, /error came to the screen.*2> \/dev\/null/],
  [paths => `cat ${paths} 2> /dev/null`, /words came to the screen.*> ~\/well\/words\.txt/],
  [paths => `cat ${paths} 2> ~/well/words.txt`, /2> sent the error into words\.txt/],
  [paths => `cat ${paths}`, /add > ~\/well\/words\.txt.*2> \/dev\/null/],
  [paths => `cat ${paths.split(' ')[0]} > ~/well/words.txt 2> /dev/null`, /all three stones/],
  [() => 'cat ~/well/wall.txt', null],
];

for (const [line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${line('STONES')}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    const paths = secret.paths.map(path => path.replace(HOME, '~')).join(' ');
    const { ctx } = await type(backend, line(paths));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

test('the wall and the stones are kept off the map until an ls lists them', () => {
  const secret = { wall: `${WELL}/wall.txt`, paths: ['/a', '/b', '/c'], missing: '/b', words: `${WELL}/words.txt` };
  assert.deepEqual(chapter.boss.hidden(secret), [`${WELL}/wall.txt`, '/a', '/c']);
});

const NOT_COMMANDS = new Set(['PATH', '=', '$', 'wish', 'gold', '$wish', '0', '$?', '>', '2>', '/dev/null', '2> /dev/null', 'B', 'A', 'A && B', 'A || B', 'I wish for gold', 'I wish for $wish', 'ls A B > list.txt 2> /dev/null', '~/well/wall.txt', '~/well/stones', 'cat', '~/well/words.txt', '&gt; ~/well/words.txt', '2&gt; /dev/null', '> ~/well/words.txt', 'cat ~/well/wall.txt', 'list.txt', 'ls']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  const backend = await startChapter(chapter);
  await type(backend, 'cd ~/well');
  for (const line of lines) {
    assert.equal(notFound((await type(backend, line)).result), false, line);
    await type(backend, 'cd ~/well');
  }
});
