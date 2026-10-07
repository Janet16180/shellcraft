import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/daemon.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [PS, PS_AUX, PGREP, GREEDY, POLITE, NINE, ROOT] = chapter.tasks.map(task => task.goal);

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const textOf = result => result.output.map(c => c.text).join('');
const keysOf = obs => obs.procs.map(p => p.key).filter(Boolean);

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('new commands get a clue in their first goal, and every goal names its target', () => {
  assert.equal(chapter.tasks.length, 7);
  assert.match(PS, /`ps`/);
  assert.match(PS_AUX, /`ps aux`/);
  assert.match(PGREP, /`pgrep imp`/);
  assert.match(GREEDY, /`greedy_imp`.*`%CPU`.*`ps aux`.*`kill`.*`2420`/);
  assert.match(POLITE, /`stubborn_imp`.*2431.*plain `kill`/);
  assert.match(NINE, /`ps aux`.*signal 9.*`kill -9`/);
  assert.match(ROOT, /`kill -9`.*PID `1`.*`root`/);
});

test('the lesson explains processes, PIDs, the ps aux columns, pgrep, TERM, KILL and root', () => {
  assert.match(chapter.lesson, /<b>process<\/b>.*<b>PID<\/b>/s);
  assert.match(chapter.lesson, /<code>USER<\/code>.*<code>PID<\/code>.*<code>%CPU<\/code>.*<code>COMMAND<\/code>/s);
  assert.match(chapter.lesson, /finds <code>greedy_imp<\/code> too/);
  assert.match(chapter.lesson, /signal 15, <code>TERM<\/code>: a polite request/);
  assert.match(chapter.lesson, /signal 9, <code>KILL<\/code>, which no program can catch or ignore/);
  assert.match(chapter.lesson, /only signal your own processes/);
  assert.match(chapter.lesson, /On a real machine, PIDs change/);
});

test('the setup starts three imps with fixed PIDs in the den, and puts the player there', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, `${HOME}/den`);
  assert.ok(nodeAt(obs.tree, `${HOME}/den/nest.txt`));
  const imps = Object.fromEntries(obs.procs.filter(p => p.key && p.key !== 'shell').map(p => [p.key, [p.pid, p.cmd, p.user]]));
  assert.deepEqual(imps, { imp: [2412, 'imp', 'hero'], greedy: [2420, 'greedy_imp', 'hero'], stubborn: [2431, 'stubborn_imp', 'hero'] });
  assert.ok(obs.procs.find(p => p.key === 'greedy').cpu > 50);
});

test('the setup can run again over a finished chapter and its boss room', async () => {
  const { backend } = await startBoss(chapter, 3);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.deepEqual(keysOf(obs).sort(), ['greedy', 'imp', 'shell', 'stubborn']);
});

test('the solve finishes every task, and fails only where the tasks expect it', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, ['kill -9 1: bash: kill: (1) - Operation not permitted\n']);
  assert.deepEqual(keysOf(await backend.observe()).sort(), ['imp', 'shell']);
});

test('ps shows only the terminal, ps aux shows the imps, pgrep imp prints three PIDs', async () => {
  const backend = await startChapter(chapter);
  const ps = textOf((await type(backend, 'ps')).result);
  assert.match(ps, /bash\n/);
  assert.doesNotMatch(ps, /imp/);
  assert.match(textOf((await type(backend, 'ps aux')).result), /hero +2420 88\.6 .* greedy_imp\n/);
  assert.equal(textOf((await type(backend, 'pgrep imp')).result), '2412\n2420\n2431\n');
});

test('the stubborn imp survives a plain kill, which prints nothing and succeeds', async () => {
  const backend = await startChapter(chapter);
  const { result, ctx } = await type(backend, 'kill 2431');
  assert.equal(textOf(result), '');
  assert.equal(result.commands[0].status, 0);
  assert.ok(ctx.proc('stubborn'));
});

const NEAR_MISSES = [
  [PS, [], 'ps aux', 'ps'],
  [PS_AUX, [], 'ps', 'ps aux'],
  [PS_AUX, [], 'ps -ef', 'ps axu'],
  [PGREP, [], 'pgrep cron', 'pgrep imp'],
  [GREEDY, [], 'kill 2412', 'kill 2420'],
  [GREEDY, [], 'kill greedy_imp', 'kill -9 2420'],
  [POLITE, [], 'kill -9 2431', 'kill 2431'],
  [POLITE, [], 'kill -15 2420', 'kill -TERM 2431'],
  [NINE, [], 'kill 2431', 'kill -9 2431'],
  [NINE, [], 'kill -9 2420', 'kill -KILL 2431'],
  [NINE, [], 'kill -s TERM 2431', 'kill -s KILL 2431'],
  [ROOT, [], 'kill -9 2431', 'kill -9 1'],
  [ROOT, [], 'kill 999', 'kill 1'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [PS_AUX, [], 'ps -ef', /without the %CPU column/],
  [PS_AUX, [], 'ps aux', null],
  [GREEDY, [], 'kill greedy_imp', /needs the PID.*kill 2420/],
  [GREEDY, [], 'kill 2412', /quiet imp.*2420/],
  [GREEDY, [], 'kill 2420', null],
  [POLITE, [], 'kill -9 2431', /Restart chapter/],
  [POLITE, [], 'kill stubborn_imp', /kill 2431/],
  [POLITE, [], 'kill 2431', null],
  [NINE, [], 'kill 2431', /Add -9/],
  [NINE, [], 'kill -9 2431', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the map hears about kills: a burst when a process ends, a flash when it ignores the signal', async () => {
  const backend = await startChapter(chapter);
  assert.deepEqual(chapter.effects((await type(backend, 'kill 2420')).ctx), [{ kind: 'proc-killed', key: 'greedy' }]);
  assert.deepEqual(chapter.effects((await type(backend, 'kill 2431')).ctx), [{ kind: 'proc-defied', key: 'stubborn' }]);
  assert.deepEqual(chapter.effects((await type(backend, 'kill -9 1')).ctx), []);
  assert.deepEqual(chapter.effects((await type(backend, 'ps')).ctx), []);
});

test('the boss room hides the daemon under a random imp name and PID, among three imps', async () => {
  const rooms = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, `${HOME}/den`);
    assert.deepEqual(keysOf(obs).sort(), ['daemon', 'imp-a', 'imp-b', 'imp-c', 'shell'], `seed ${seed}`);
    const daemon = obs.procs.find(p => p.key === 'daemon');
    assert.equal(daemon.pid, secret.pid);
    assert.equal(daemon.cmd, secret.name);
    assert.match(daemon.cmd, /_imp$/);
    const others = obs.procs.filter(p => p.key?.startsWith('imp-'));
    assert.ok(others.every(p => p.cpu < 2 && p.cmd.endsWith('_imp') && p.cmd !== daemon.cmd));
    assert.ok(daemon.cpu > 90);
    rooms.add(`${secret.name}-${secret.pid}`);
  }
  assert.ok(rooms.size >= 10);
});

test('the boss is beaten with ps aux, a kill it ignores, then kill -9, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    const done = [];
    for (const line of chapter.boss.solve(obs)) done.push(chapter.boss.done((await type(backend, line)).ctx, secret));
    assert.deepEqual(done, [false, false, true], `seed ${seed}`);
  }
});

test('the boss also falls to pkill -9 with its name, and the exact hint beats it from anywhere', async () => {
  const one = await startBoss(chapter, 2);
  assert.ok(chapter.boss.done((await type(one.backend, `pkill -9 ${one.secret.name}`)).ctx, one.secret));
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    assert.ok(chapter.boss.done((await type(backend, chapter.boss.hints[2](secret))).ctx, secret), `seed ${seed}`);
  }
});

const BOSS_NOTES = [
  [({ pid }) => `kill ${pid}`, /ignored the polite signal.*signal 9/],
  [({ name }) => `kill ${name}`, /needs the PID/],
  [() => 'ps aux', null],
];

for (const [line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${line({ pid: 'PID', name: 'NAME' })}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    const { ctx } = await type(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

test('the boss says so when a decoy imp is ended instead', async () => {
  const { backend, secret, obs } = await startBoss(chapter, 6);
  const decoy = obs.procs.find(p => p.key === 'imp-b');
  const { ctx } = await type(backend, `kill ${decoy.pid}`);
  assert.equal(chapter.boss.done(ctx, secret), false);
  assert.match(chapter.boss.near(ctx, secret), /ordinary imp.*almost all of the CPU/);
});

const NOT_COMMANDS = new Set(['~/den', 'bash', 'USER', 'PID', '%CPU', 'COMMAND', 'imp', 'greedy_imp', 'TERM', 'KILL', 'root', 'INT', 'cron', 'sshd', '/root']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...codeSnippets(chapter.why).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)),
    ...chapter.recap.map(([line]) => line),
  ];
  for (const line of lines) {
    const backend = await startChapter(chapter);
    assert.equal(notFound((await type(backend, line)).result), false, line);
  }
});
