import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/descent.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const LOG = '/var/log/guardian.log';
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [ROOT, HOSTNAME, ACCOUNT, NEWEST, DENIED, PATH, WHICH, TYPE] = chapter.tasks.map(task => task.goal);

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

test('new commands get a clue in their first goal, and every goal names its target', () => {
  assert.equal(chapter.tasks.length, 8);
  assert.match(ROOT, /`ls \/`/);
  assert.match(HOSTNAME, /`\/etc\/hostname`/);
  assert.match(ACCOUNT, /`hero`.*`\/etc\/passwd`.*`grep`/);
  assert.match(NEWEST, /`\/var\/log\/dpkg\.log`.*`tail -n 3`/);
  assert.match(DENIED, /`\/var\/log\/syslog`/);
  assert.match(PATH, /`echo \$PATH`/);
  assert.match(WHICH, /`which`/);
  assert.match(TYPE, /`type cd`/);
});

test('the lesson says what /, /etc and /var/log hold, what Permission denied means, and how bash finds a command', () => {
  assert.match(chapter.lesson, /root directory.*top of the whole filesystem/s);
  assert.match(chapter.lesson, /\/etc<\/code> holds the system's settings, as plain text/);
  assert.match(chapter.lesson, /New lines go at the end/);
  assert.match(chapter.lesson, /Permission denied.*did not allow you/s);
  assert.match(chapter.lesson, /list of directories, in order.*PATH/s);
  assert.match(chapter.lesson, /part of bash itself/);
});

test('the solve finishes every task on the base world, and only the syslog line fails', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, ['cat /var/log/syslog: cat: /var/log/syslog: Permission denied\n']);
});

test('the commands print what a real Ubuntu prints', async () => {
  const backend = await startChapter(chapter);
  assert.equal(textOf((await type(backend, 'cat /etc/hostname')).result), 'kernelia\n');
  assert.equal(textOf((await type(backend, 'grep hero /etc/passwd')).result), 'hero:x:1000:1000:Hero,,,:/home/hero:/bin/bash\n');
  assert.equal(textOf((await type(backend, 'echo $PATH')).result), '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n');
  assert.equal(textOf((await type(backend, 'which ls')).result), '/usr/bin/ls\n');
  assert.equal(textOf((await type(backend, 'type cd')).result), 'cd is a shell builtin\n');
  const denied = await type(backend, 'cat /var/log/syslog');
  assert.equal(textOf(denied.result), 'cat: /var/log/syslog: Permission denied\n');
  assert.equal(denied.result.status, 1);
  const which = await type(backend, 'which cd');
  assert.equal(textOf(which.result), '');
  assert.equal(which.result.status, 1);
});

test('the setup leaves an empty /usr/local/bin, removes the guardian log and brings the player home', async () => {
  const { backend } = await startBoss(chapter, 1);
  await type(backend, 'cd /etc');
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(Object.keys(nodeAt(obs.tree, '/usr/local/bin').children), []);
  assert.equal(nodeAt(obs.tree, LOG), null);
});

const NEAR_MISSES = [
  [ROOT, [], 'ls', 'ls /'],
  [ROOT, [], 'ls /home', 'cd / && ls'],
  [ROOT, [], 'ls /etc', 'ls -l /'],
  [HOSTNAME, [], 'hostname', 'cat /etc/hostname'],
  [HOSTNAME, [], 'ls /etc', 'cd /etc && cat hostname'],
  [ACCOUNT, [], 'cat /etc/passwd', 'grep hero /etc/passwd'],
  [ACCOUNT, [], 'grep root /etc/passwd', 'cd /etc && grep hero passwd'],
  [ACCOUNT, [], 'cat /etc/passwd | grep root', 'cat /etc/passwd | grep "hero"'],
  [NEWEST, [], 'tail /var/log/dpkg.log', 'tail -n 3 /var/log/dpkg.log'],
  [NEWEST, [], 'head -n 3 /var/log/dpkg.log', 'tail -3 /var/log/dpkg.log'],
  [NEWEST, [], 'tail -n 2 /var/log/dpkg.log', 'tail -n3 /var/log/dpkg.log'],
  [NEWEST, [], 'cat /var/log/dpkg.log', 'cd /var/log && tail -n 3 dpkg.log'],
  [DENIED, [], 'ls -l /var/log', 'cat /var/log/syslog'],
  [DENIED, [], 'cat /var/log/dpkg.log', 'tail /var/log/syslog'],
  [PATH, [], 'echo PATH', 'echo $PATH'],
  [PATH, [], '$PATH', 'echo "$PATH"'],
  [PATH, [], 'echo $HOME', 'echo $PATH'],
  [WHICH, [], 'which cat', 'which ls'],
  [TYPE, [], 'which cd', 'type cd'],
  [TYPE, [], 'type ls', 'type cd'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}, but is by ${JSON.stringify(hit)}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [ROOT, [], 'ls', /your home.*ls \//],
  [ROOT, [], 'ls /home', /one step below the top/],
  [ROOT, [], 'ls /', null],
  [HOSTNAME, [], 'hostname', /cat \/etc\/hostname/],
  [HOSTNAME, [], 'ls /etc', /read the file hostname/],
  [HOSTNAME, [], 'cat /etc/hostname', null],
  [ACCOUNT, [], 'cat /etc/passwd', /every account.*grep hero/],
  [ACCOUNT, [], 'cat /etc/passwd | grep root', null],
  [NEWEST, [], 'tail /var/log/dpkg.log', /-n 3/],
  [NEWEST, [], 'head -n 3 /var/log/dpkg.log', /oldest.*tail/],
  [NEWEST, [], 'cat /var/log/dpkg.log', /whole log.*tail -n 3/],
  [NEWEST, [], 'tail -n 3 /var/log/dpkg.log', null],
  [DENIED, [], 'ls /var/log', /try to read it/],
  [PATH, [], 'echo PATH', /Without the \$/],
  [PATH, [], '$PATH', /tried to run.*echo/],
  [PATH, [], 'echo $PATH', null],
  [TYPE, [], 'which cd', /part of bash itself.*type cd/],
  [TYPE, [], 'type cd', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss room installs one runnable command with a random name, named in the last line of the log', async () => {
  const names = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.match(secret.name, /^[a-z]+$/);
    assert.deepEqual(Object.keys(nodeAt(obs.tree, '/usr/local/bin').children), [secret.name]);
    assert.equal(nodeAt(obs.tree, secret.command).mode & 0o777, 0o755);
    const lines = nodeAt(obs.tree, LOG).content.trim().split('\n');
    assert.ok(lines.length >= 5);
    assert.match(lines.at(-1), new RegExp(`installed a new command: ${secret.name}$`));
    assert.ok(lines.slice(0, -1).every(line => !line.includes(secret.name)), `seed ${seed}`);
    names.add(secret.name);
  }
  assert.ok(names.size >= 4);
});

test('the boss is beaten by reading the log, which, then the name alone, found from the observation', async () => {
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
    assert.deepEqual(done, [false, false, true], `seed ${seed}: ${lines.join('; ')}`);
    assert.match(textOf(last), new RegExp(`The new command ${secret.name} works`));
  }
});

test('the exact boss hint beats the boss from anywhere', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    const line = chapter.boss.hints[2](secret);
    assert.ok(chapter.boss.done((await type(backend, line)).ctx, secret), `seed ${seed}: ${line}`);
  }
});

test('the boss is not beaten by the full path, and says to type only the name', async () => {
  const { backend, secret } = await startBoss(chapter, 2);
  const { ctx } = await type(backend, secret.command);
  assert.equal(chapter.boss.done(ctx, secret), false);
  assertNear(chapter.boss.near(ctx, secret), ctx, /full path.*only its name/);
});

const BOSS_NOTES = [
  [secret => `which ${secret.name}`, /which found it.*only its name/],
  [() => 'sparkle', /no command by that name.*last line/],
  [() => `head -n 1 ${LOG}`, /oldest lines.*tail/],
  [() => `tail -n 1 ${LOG}`, null],
  [() => 'ls /usr/local/bin', null],
];

for (const [line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${line({ name: 'NAME' })}`, async () => {
    const { backend, secret } = await startBoss(chapter, 3);
    const { ctx } = await type(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

test('the log and the new command are kept off the map until an ls lists them', () => {
  assert.deepEqual(chapter.boss.hidden({ log: LOG, command: '/usr/local/bin/x', name: 'x' }), [LOG, '/usr/local/bin/x']);
});

const NOT_COMMANDS = new Set(['/', '/etc', '/var/log', '/etc/hostname', '/etc/passwd', '/usr/local/bin', '/var/log/guardian.log', 'PATH', 'ls', 'cd', 'which', 'tail', 'cat', 'tail -n 3 FILE', ':', '$PATH', '$']);

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
