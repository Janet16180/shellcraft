import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/forge.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const FORGE = `${HOME}/forge`;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [SHEBANG, APPEND, READ, RUN, GREET, ARG, LOOP, LOOP_SCRIPT] = chapter.tasks.map(task => task.goal);
const HELLO = ["echo '#!/bin/bash' > ~/forge/hello.sh", "echo 'echo Hello from the forge' >> ~/forge/hello.sh"];
const GREET_LINES = ["echo '#!/bin/bash' > ~/forge/greet.sh", "echo 'echo Hello, $1' >> ~/forge/greet.sh"];
const LOOP_LINE = 'for ore in *.ore; do echo Smelting $ore; done';
const LOOP_FILE = ["echo '#!/bin/bash' > ~/forge/loop.sh", `echo '${LOOP_LINE}' >> ~/forge/loop.sh`, 'chmod +x ~/forge/loop.sh'];
const SMELTED = 'Smelting copper.ore\nSmelting iron.ore\nSmelting silver.ore\n';

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
  assert.equal(chapter.tasks.length, 8);
  assert.match(SHEBANG, /`#!\/bin\/bash`.*`~\/forge\/hello\.sh`.*single quotes.*`echo '#!\/bin\/bash' > ~\/forge\/hello\.sh`/);
  assert.match(APPEND, /`echo Hello from the forge`.*`>>`/);
  assert.match(READ, /`cat ~\/forge\/hello\.sh`/);
  assert.match(RUN, /`chmod \+x`.*path/);
  assert.match(GREET, /`~\/forge\/greet\.sh`.*`echo Hello, \$1`.*single quotes/);
  assert.match(ARG, /`Tux`.*`Hello, Tux`/);
  assert.match(LOOP, /`~\/forge\/ore`.*`for ore in \*\.ore; do echo Smelting \$ore; done`/);
  assert.match(LOOP_SCRIPT, /`~\/forge\/loop\.sh`.*`~\/forge\/ore`/);
});

test('the lesson explains scripts, #!, single quotes, chmod, $1, for, and the script\'s own shell', () => {
  assert.match(chapter.lesson, /<code>#!\/bin\/bash<\/code>, says which program reads the file/);
  assert.match(chapter.lesson, /<code>><\/code> for the first line.*<code>>><\/code> for each line after it/s);
  assert.match(chapter.lesson, /<b>single quotes<\/b>.*<code>\$1<\/code> or <code>\$ore<\/code> would be swapped.*<code>!<\/code> makes bash look in your history/s);
  assert.match(chapter.lesson, /<code>\$1<\/code> is <code>Tux<\/code>/);
  assert.match(chapter.lesson, /between <code>do<\/code> and <code>done<\/code>/);
  assert.match(chapter.lesson, /A <code>cd<\/code> inside the script moves the script, not you/);
});

test('the setup makes the forge with three ores, ends the imps, and brings the player home', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${FORGE}/ore`).children).sort(), ['copper.ore', 'iron.ore', 'silver.ore']);
  assert.deepEqual(obs.procs.map(p => p.key).filter(Boolean), ['shell']);
});

test('the solve finishes every task without an error, and the scripts hold what was written', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, []);
  const obs = await backend.observe();
  assert.equal(nodeAt(obs.tree, `${FORGE}/greet.sh`).content, '#!/bin/bash\necho Hello, $1\n');
  assert.equal(nodeAt(obs.tree, `${FORGE}/loop.sh`).content, `#!/bin/bash\n${LOOP_LINE}\n`);
});

test('the scripts print what a real bash prints', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, [...HELLO, ...GREET_LINES, 'chmod +x ~/forge/hello.sh ~/forge/greet.sh']);
  assert.equal(textOf((await type(backend, '~/forge/hello.sh')).result), 'Hello from the forge\n');
  assert.equal(textOf((await type(backend, '~/forge/greet.sh Tux')).result), 'Hello, Tux\n');
  assert.equal(textOf((await type(backend, '~/forge/greet.sh')).result), 'Hello,\n');
  await type(backend, 'cd ~/forge/ore');
  assert.equal(textOf((await type(backend, LOOP_LINE)).result), SMELTED);
  await type(backend, 'cd');
  assert.equal(textOf((await type(backend, LOOP_LINE)).result), 'Smelting *.ore\n');
});

const NEAR_MISSES = [
  [SHEBANG, [], "echo '#!/bin/bash'", "echo '#!/bin/bash' > ~/forge/hello.sh"],
  [APPEND, [HELLO[0]], "echo 'echo Hello from the forge' > ~/forge/hello.sh", HELLO[1]],
  [READ, HELLO.slice(0, 1), 'cat ~/forge/hello.sh', null],
  [RUN, [...HELLO, 'chmod +x ~/forge/hello.sh'], 'hello.sh', '~/forge/hello.sh'],
  [RUN, HELLO, '~/forge/hello.sh', 'chmod +x ~/forge/hello.sh && ~/forge/hello.sh'],
  [RUN, [...HELLO, 'chmod +x ~/forge/hello.sh'], 'bash ~/forge/hello.sh', 'cd ~/forge && ./hello.sh'],
  [GREET, [GREET_LINES[0]], 'echo "echo Hello, $1" >> ~/forge/greet.sh', GREET_LINES[1]],
  [ARG, [...GREET_LINES, 'chmod +x ~/forge/greet.sh'], '~/forge/greet.sh', '~/forge/greet.sh Tux'],
  [ARG, [...GREET_LINES, 'chmod +x ~/forge/greet.sh'], 'echo Hello, Tux', '~/forge/greet.sh Ada'],
  [LOOP, [], LOOP_LINE, `cd ~/forge/ore && ${LOOP_LINE}`],
  [LOOP, ['cd ~/forge/ore'], 'echo Smelting copper.ore', 'for x in *.ore; do echo Smelting $x; done'],
  [LOOP_SCRIPT, LOOP_FILE, '~/forge/loop.sh', 'cd ~/forge/ore && ~/forge/loop.sh'],
  [LOOP_SCRIPT, ['cd ~/forge/ore'], LOOP_LINE, null],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [APPEND, [HELLO[0]], "echo 'echo Hello from the forge' > ~/forge/hello.sh", /> replaced the whole file/],
  [APPEND, HELLO.slice(0, 1), HELLO[0], null],
  [APPEND, HELLO, "echo '#!/bin/bash' >> ~/forge/hello.sh", /#!\/bin\/bash line twice/],
  [RUN, HELLO, '~/forge/hello.sh', /no x yet.*chmod \+x ~\/forge\/hello\.sh/],
  [RUN, [...HELLO, 'chmod +x ~/forge/hello.sh'], 'hello.sh', /Without a path.*~\/forge\/hello\.sh/],
  [RUN, [...HELLO, 'chmod +x ~/forge/hello.sh'], '~/forge/hello.sh', null],
  [GREET, [GREET_LINES[0]], 'echo "echo Hello, $1" >> ~/forge/greet.sh', /Double quotes swapped.*single quotes/],
  [GREET, [GREET_LINES[0]], GREET_LINES[1], null],
  [ARG, GREET_LINES, '~/forge/greet.sh Tux', /no x yet/],
  [ARG, [...GREET_LINES, 'chmod +x ~/forge/greet.sh'], '~/forge/greet.sh', /\$1 was empty.*Tux/],
  [LOOP, [], LOOP_LINE, /No ore here.*cd ~\/forge\/ore/],
  [LOOP, ['cd ~/forge/ore'], 'for ore in *.ore; do echo Smelting $x; done', /loop's variable/],
  [LOOP, ['cd ~/forge/ore'], LOOP_LINE, null],
  [LOOP_SCRIPT, LOOP_FILE.slice(0, 2), 'cd ~/forge/ore && ~/forge/loop.sh', /no x yet/],
  [LOOP_SCRIPT, LOOP_FILE, '~/forge/loop.sh', /started where you are.*cd ~\/forge\/ore/],
  [LOOP_SCRIPT, [LOOP_FILE[0]], `echo "${LOOP_LINE}" >> ~/forge/loop.sh`, /Double quotes swapped/],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss room brings three or four new ores in order, and no smelt.sh yet', async () => {
  const rooms = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME);
    const names = Object.keys(nodeAt(obs.tree, `${FORGE}/ore`).children).sort();
    assert.deepEqual(names, secret.ores.map(name => `${name}.ore`));
    assert.ok(secret.ores.length >= 3 && secret.ores.length <= 4);
    assert.equal(nodeAt(obs.tree, `${FORGE}/smelt.sh`), null);
    rooms.add(secret.ores.join());
  }
  assert.ok(rooms.size >= 10);
});

test('the boss is beaten by writing smelt.sh with its own cd and running it from home', async () => {
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
    assert.deepEqual(done, [false, false, false, false, true], `seed ${seed}`);
    assert.equal(textOf(last), secret.ores.map(name => `Smelting ${name}.ore\n`).join(''));
  }
});

test('the exact boss hint beats the boss from anywhere', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /tmp');
    assert.ok(chapter.boss.done((await type(backend, chapter.boss.hints[2])).ctx, secret), `seed ${seed}`);
  }
});

const NO_CD = ["echo '#!/bin/bash' > ~/forge/smelt.sh", `echo '${LOOP_LINE}' >> ~/forge/smelt.sh`, 'chmod +x ~/forge/smelt.sh'];
const WITH_CD = ["echo '#!/bin/bash' > ~/forge/smelt.sh", "echo 'cd ~/forge/ore' >> ~/forge/smelt.sh", `echo '${LOOP_LINE}' >> ~/forge/smelt.sh`];
const BOSS_NOTES = [
  [WITH_CD, '~/forge/smelt.sh', /no x yet/],
  [NO_CD, '~/forge/smelt.sh', /\*\.ore matches nothing.*cd ~\/forge\/ore before the loop/],
  [NO_CD, 'cd ~/forge/ore && ~/forge/smelt.sh', /you were in ~\/forge\/ore.*from your home/],
  [NO_CD.slice(0, 1), `echo "${LOOP_LINE}" >> ~/forge/smelt.sh`, /Double quotes swapped/],
  [[], LOOP_LINE, null],
];

for (const [prefix, line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${JSON.stringify(line)} after ${prefix.length} lines`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    for (const before of prefix) await type(backend, before);
    const { ctx } = await type(backend, line);
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

const NOT_COMMANDS = new Set(['#!/bin/bash', '>', '>>', '$1', '$ore', '!', 'x', '$2', 'Tux', '*.ore', '.ore', 'do', 'done', 'cd', 'PATH', '#!']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !['~/forge/ore', '~/forge/smelt.sh', 'Smelting'].includes(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  for (const line of lines) {
    const backend = await startChapter(chapter);
    await play(chapter, backend, chapter.solve);
    assert.equal(notFound((await type(backend, line)).result), false, line);
  }
});
