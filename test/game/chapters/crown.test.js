import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/crown.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const PASS = { password: 'dragon' };
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [LIST, SYSLOG, WHO, TRAP, TEE, CHOWN, FORGET] = chapter.tasks.map(task => task.goal);

async function run(backend, line) {
  return type(backend, line, line.includes('sudo') ? PASS : {});
}

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await run(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
  assert.equal(chapter.tasks.length, 7);
});

test('new commands get a clue in their first goal, and the password is in the first goal', () => {
  assert.match(LIST, /`sudo -l`.*`dragon`/);
  assert.match(SYSLOG, /`\/var\/log\/syslog`.*`sudo`/);
  assert.match(WHO, /`sudo whoami`/);
  assert.match(TRAP, /`\/etc\/motd`/);
  assert.match(TEE, /`The steward is hero\.`.*`\/etc\/motd`.*sudo tee -a/);
  assert.match(CHOWN, /`~\/crown\/sword\.txt`.*`mira`.*`sudo chown mira`/);
  assert.match(FORGET, /`sudo -k`/);
});

test('the lesson is honest about sudo: your own password, the sudo group, one command, and the redirection trap', () => {
  assert.match(chapter.lesson, /your own password/);
  assert.match(chapter.lesson, /<code>sudo<\/code> group/);
  assert.match(chapter.lesson, /one command/);
  assert.match(chapter.lesson, /<code>tee<\/code>/);
  assert.match(chapter.lesson, /777/);
});

test('the setup makes the player an administrator with the password dragon, and puts the crown at home', async () => {
  const backend = await startChapter(chapter);
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.equal(nodeAt(obs.tree, `${HOME}/crown/sword.txt`).owner, 'hero');
  const out = (await run(backend, 'sudo whoami')).result.output.map(c => c.text).join('');
  assert.match(out, /root/);
});

test('the setup can run again over a finished chapter and its boss room', async () => {
  const { backend } = await startBoss(chapter, 3);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(nodeAt(obs.tree, `${HOME}/crown/sword.txt`).owner, 'hero');
  assert.deepEqual(Object.keys(nodeAt(obs.tree, `${HOME}/crown`).children), ['sword.txt']);
});

test('the solve finishes every task, and fails only where the tasks expect it', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, ['sudo echo hi >> /etc/motd: bash: /etc/motd: Permission denied\n']);
});

const NEAR_MISSES = [
  [LIST, [], 'sudo -k', 'sudo -l'],
  [SYSLOG, [], 'cat /var/log/syslog', 'sudo cat /var/log/syslog'],
  [SYSLOG, [], 'sudo ls /var/log', 'sudo tail /var/log/syslog'],
  [WHO, [], 'whoami', 'sudo whoami'],
  [TRAP, [], 'echo hi >> /etc/motd', 'sudo echo hi >> /etc/motd'],
  [TRAP, [], 'sudo cat /etc/motd', 'sudo echo hi > /etc/motd'],
  [TEE, [], 'echo The steward is hero. | tee -a /etc/motd', 'echo The steward is hero. | sudo tee -a /etc/motd'],
  [TEE, [], 'echo The steward is hero. | sudo tee /etc/motd', null],
  [TEE, [], 'echo hello | sudo tee -a /etc/motd', null],
  [CHOWN, [], 'chown mira ~/crown/sword.txt', 'sudo chown mira ~/crown/sword.txt'],
  [CHOWN, [], 'sudo chown oren ~/crown/sword.txt', 'sudo chown mira:smiths ~/crown/sword.txt'],
  [FORGET, [], 'sudo -l', 'sudo -k'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [SYSLOG, [], 'cat /var/log/syslog', /sudo cat/],
  [WHO, [], 'whoami', /sudo/],
  [TRAP, [], 'echo hi >> /etc/motd', /sudo/],
  [TEE, [], 'echo The steward is hero. | tee -a /etc/motd', /sudo tee/],
  [TEE, [], 'echo The steward is hero. | sudo tee /etc/motd', /-a/],
  [CHOWN, [], 'chown mira ~/crown/sword.txt', /only root/i],
  [CHOWN, [], 'sudo chown oren ~/crown/sword.txt', /mira/],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await run(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('a wrong password three times gets a note that names the password', async () => {
  const backend = await startChapter(chapter);
  const { ctx } = await type(backend, 'sudo -l', { password: ['a', 'b', 'c'] });
  assert.equal(chapter.tasks[GOAL[LIST]].done(ctx), false);
  assert.match(chapter.tasks[GOAL[LIST]].near(ctx), /dragon/);
});

test('the boss order names a random service, keeper and faction, and the config starts wrong', async () => {
  const seen = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    const order = nodeAt(obs.tree, `${HOME}/crown/order.txt`).content;
    assert.ok(order.includes(secret.config) && order.includes(secret.keeper) && order.includes(secret.group));
    const config = nodeAt(obs.tree, secret.config);
    assert.equal(config.owner, 'root');
    assert.notEqual(config.mode & 0o777, 0o640);
    seen.add(`${secret.config}-${secret.keeper}`);
  }
  assert.ok(seen.size >= 6);
});

test('the boss is beaten with sudo chown and sudo chmod 640, found from the observation', async () => {
  for (const seed of SEEDS) {
    const { backend, secret, obs } = await startBoss(chapter, seed);
    let won = false;
    for (const line of chapter.boss.solve(obs)) won = chapter.boss.done((await run(backend, line)).ctx, secret);
    assert.equal(won, true, `seed ${seed}`);
  }
});

test('the exact hint and a chmod beat the boss from anywhere', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    await run(backend, chapter.boss.hints[2](secret));
    const { ctx } = await run(backend, `sudo chmod u=rw,g=r,o= ${secret.config}`);
    assert.ok(chapter.boss.done(ctx, secret), `seed ${seed}`);
  }
});

const BOSS_NOTES = [
  [s => `chown ${s.keeper} ${s.config}`, /sudo/],
  [s => `sudo chown ${s.keeper}:${s.group} ${s.config} && sudo chmod 777 ${s.config}`, /everyone else/],
  [s => `sudo chown ${s.keeper}:${s.group} ${s.config} && sudo chmod 640 ${s.config} && sudo chmod 777 ${s.config.replace(/\/config\.txt$/, '')}`, /directory/],
  [s => `sudo chown ${s.keeper} ${s.config} && sudo chmod 640 ${s.config}`, new RegExp('group')],
  [s => `sudo chown root:${s.group} ${s.config} && sudo chmod 640 ${s.config}`, /owner/],
];

for (const [line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${line({ keeper: 'KEEPER', group: 'GROUP', config: '/srv/X/config.txt' })}`, async () => {
    const { backend, secret } = await startBoss(chapter, 5);
    const { ctx } = await run(backend, line(secret));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

const NOT_COMMANDS = new Set(['dragon', 'sudo', 'root', '/etc/sudoers', '~/crown/order.txt', 'tee', '777', '-a', 'sudo COMMAND', 'chown USER FILE', 'sudo chown mira FILE', 'chown mira:smiths FILE', 'rm -r / tmp', 'config.txt', '/srv']);

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
    assert.equal(notFound((await run(backend, line)).result), false, line);
  }
});
