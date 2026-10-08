import { test } from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../../../src/game/chapters/gate.js';
import { assertChapter } from '../../helpers/chapter.js';
import { nodeAt } from '../../../src/backend/tree.js';
import { PLAYER, startChapter, type, play, startBoss, notFound, codeSnippets, nearTitle, assertNear } from './harness.js';

const HOME = PLAYER.home;
const GATE = `${HOME}/gate`;
const SPELL = `${GATE}/open_gate.sh`;
const DIARY = `${GATE}/guard_diary.txt`;
const INSCRIPTION = `${GATE}/inscription.txt`;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GOAL = Object.fromEntries(chapter.tasks.map((task, i) => [task.goal, i]));
const [PERMS, ID, READ, TRY, ALLOW, RUN, LOCK, PRIVATE, ROOT] = chapter.tasks.map(task => task.goal);
const IN_GATE = ['cd ~/gate'];
const ALLOWED = ['cd ~/gate', 'chmod +x open_gate.sh'];

async function passes(goal, prefix, line) {
  assert.ok(goal in GOAL, `no task named ${goal}`);
  const backend = await startChapter(chapter);
  await play(chapter, backend, prefix);
  const { ctx } = await type(backend, line);
  return chapter.tasks[GOAL[goal]].done(ctx);
}

const textOf = result => result.output.map(c => c.text).join('');
const modeAt = (obs, path) => nodeAt(obs.tree, path).mode & 0o777;

test('the chapter follows the authoring contract', () => {
  assertChapter(chapter);
});

test('new commands get a clue in their first goal, and every goal names its target', () => {
  assert.equal(chapter.tasks.length, 9);
  assert.match(PERMS, /`~\/gate`.*`ls -l`/);
  assert.match(ID, /`id`/);
  assert.match(READ, /`~\/gate\/open_gate\.sh`/);
  assert.match(TRY, /`~\/gate`.*`\.\/open_gate\.sh`.*`\.\/`/);
  assert.match(ALLOW, /`open_gate\.sh`.*`chmod \+x`/);
  assert.match(RUN, /`open_gate\.sh`/);
  assert.doesNotMatch(RUN, /`\.\//);
  assert.match(LOCK, /`~\/gate\/inscription\.txt`.*`chmod a-w`.*`a` = everyone.*`-w` = take away write/);
  assert.match(PRIVATE, /`~\/gate\/guard_diary\.txt`.*`chmod 600`.*4 read \+ 2 write/);
  assert.match(ROOT, /`\/root`.*`ls`/);
});

test('the lesson explains the mode column, ./, the chmod numbers, and why /root is closed', () => {
  assert.match(chapter.lesson, /owner.*group.*everyone else/s);
  assert.match(chapter.lesson, /<code>r<\/code> means read, <code>w<\/code> means write.*<code>x<\/code> means execute/);
  assert.match(chapter.lesson, /<code>\.\/<\/code> means "in this directory"/);
  assert.match(chapter.lesson, /<code>4<\/code> read, <code>2<\/code> write and <code>1<\/code> execute/);
  assert.match(chapter.lesson, /drwx------.*only root may enter/s);
  assert.match(chapter.why, /need <code>r<\/code> as well as <code>x<\/code>/);
  assert.match(chapter.lesson, /two ways/i);
  for (const letter of ['u', 'g', 'o', 'a']) assert.match(chapter.lesson, new RegExp(`<code>${letter}</code>`));
  assert.match(chapter.lesson, /<code>\+<\/code> adds.*<code>-<\/code> takes away/s);
  assert.match(chapter.lesson, /<code>chmod u\+x FILE<\/code>.*<code>chmod 744 FILE<\/code>/s);
  assert.match(chapter.lesson, /<code>chmod go-r FILE<\/code>.*<code>chmod 600 FILE<\/code>/s);
  assert.doesNotMatch(chapter.lesson, /chmod [ugoa]*=/);
});

test('the solve finishes every task, opens the gate on the map, and fails only where the tasks expect it', async () => {
  const backend = await startChapter(chapter);
  const { done, errors } = await play(chapter, backend, chapter.solve);
  assert.deepEqual(done, chapter.tasks.map(() => true));
  assert.deepEqual(errors, [
    './open_gate.sh: bash: ./open_gate.sh: Permission denied\n',
    "ls /root: ls: cannot open directory '/root': Permission denied\n",
  ]);
  const obs = await backend.observe();
  assert.equal(modeAt(obs, SPELL), 0o755);
  assert.equal(modeAt(obs, DIARY), 0o600);
});

test('running the spell plays the gate effect, and trying it without x does not', async () => {
  const backend = await startChapter(chapter);
  await type(backend, 'cd ~/gate');
  assert.deepEqual(chapter.effects((await type(backend, './open_gate.sh')).ctx), []);
  assert.deepEqual(chapter.effects((await type(backend, 'bash open_gate.sh')).ctx), []);
  await type(backend, 'chmod +x open_gate.sh');
  assert.deepEqual(chapter.effects((await type(backend, './open_gate.sh')).ctx), [{ kind: 'gate-opened' }]);
});

test('the commands print what a real Ubuntu prints', async () => {
  const backend = await startChapter(chapter);
  assert.equal(textOf((await type(backend, 'id')).result), 'uid=1000(hero) gid=1000(hero) groups=1000(hero)\n');
  assert.match(textOf((await type(backend, 'ls -l ~/gate')).result), /^-rw-r--r-- 1 hero hero +\d+ .* guard_diary\.txt$/m);
  assert.equal(textOf((await type(backend, 'ls -ld /root')).result).slice(0, 10), 'drwx------');
  await play(chapter, backend, ALLOWED);
  assert.match(textOf((await type(backend, 'ls -l open_gate.sh')).result), /^-rwxr-xr-x /);
  assert.equal(textOf((await type(backend, './open_gate.sh')).result), 'The runes on the gate begin to glow...\n*** The Sealed Gate grinds open! ***\n');
  await type(backend, 'chmod a-w inscription.txt');
  assert.match(textOf((await type(backend, 'ls -l inscription.txt')).result), /^-r--r--r-- /);
  assert.equal(textOf((await type(backend, 'echo x >> inscription.txt')).result), 'bash: inscription.txt: Permission denied\n');
});

test('the setup restores the gate with a readable diary and a spell without x, and brings the player home', async () => {
  const backend = await startChapter(chapter);
  await play(chapter, backend, [...chapter.solve, 'cd /etc']);
  await backend.load(chapter.setup(Math.random, PLAYER));
  const obs = await backend.observe();
  assert.equal(obs.cwd, HOME);
  assert.deepEqual(Object.keys(nodeAt(obs.tree, GATE).children).sort(), ['guard_diary.txt', 'inscription.txt', 'open_gate.sh']);
  assert.equal(modeAt(obs, SPELL), 0o644);
  assert.equal(modeAt(obs, DIARY), 0o644);
  assert.equal(modeAt(obs, INSCRIPTION), 0o644);
});

const NEAR_MISSES = [
  [PERMS, [], 'ls ~/gate', 'ls -l ~/gate'],
  [PERMS, [], 'ls -l', 'cd gate && ls -l'],
  [ID, [], 'whoami', 'id'],
  [READ, [], 'ls -l gate/open_gate.sh', 'cat gate/open_gate.sh'],
  [TRY, IN_GATE, 'open_gate.sh', './open_gate.sh'],
  [TRY, IN_GATE, 'bash open_gate.sh', '~/gate/open_gate.sh'],
  [TRY, ALLOWED, './open_gate.sh', null],
  [ALLOW, IN_GATE, 'chmod x open_gate.sh', 'chmod +x open_gate.sh'],
  [ALLOW, IN_GATE, 'chmod 777 open_gate.sh', 'chmod 755 open_gate.sh'],
  [ALLOW, IN_GATE, 'chmod +x inscription.txt', 'chmod u+x open_gate.sh'],
  [RUN, ALLOWED, 'bash open_gate.sh', './open_gate.sh'],
  [RUN, IN_GATE, './open_gate.sh', null],
  [RUN, ALLOWED, 'open_gate.sh', '~/gate/open_gate.sh'],
  [LOCK, IN_GATE, 'chmod 444 inscription.txt', 'chmod a-w inscription.txt'],
  [LOCK, IN_GATE, 'chmod a-r inscription.txt', 'chmod ugo-w ~/gate/inscription.txt'],
  [LOCK, IN_GATE, 'chmod go-w inscription.txt', 'chmod u-w inscription.txt'],
  [LOCK, IN_GATE, 'chmod a-w guard_diary.txt', 'chmod -w inscription.txt'],
  [LOCK, IN_GATE, 'chmod a+w inscription.txt', 'chmod u-w,g-w,o-w inscription.txt'],
  [PRIVATE, IN_GATE, 'chmod 700 guard_diary.txt', 'chmod 600 guard_diary.txt'],
  [PRIVATE, IN_GATE, 'chmod 660 guard_diary.txt', 'chmod 600 ~/gate/guard_diary.txt'],
  [PRIVATE, IN_GATE, 'chmod 644 guard_diary.txt', 'chmod 600 guard_diary.txt'],
  [PRIVATE, IN_GATE, 'chmod 600 inscription.txt', 'chmod 600 guard_diary.txt'],
  [ROOT, [], 'cd /root', 'ls /root'],
  [ROOT, [], 'ls -ld /root', 'ls -l /root'],
  [ROOT, [], 'ls /home', 'ls /root'],
];

for (const [goal, prefix, miss, hit] of NEAR_MISSES) {
  test(`"${goal}" is not done by ${JSON.stringify(miss)}${hit ? `, but is by ${JSON.stringify(hit)}` : ''}`, async () => {
    assert.equal(await passes(goal, prefix, miss), false);
    if (hit) assert.equal(await passes(goal, prefix, hit), true);
  });
}

const NEAR_NOTES = [
  [PERMS, [], 'ls ~/gate', /Add -l/],
  [PERMS, [], 'ls -l ~/gate', null],
  [ID, [], 'whoami', /id prints your groups/],
  [TRY, IN_GATE, 'open_gate.sh', /\$PATH.*\.\/open_gate\.sh/],
  [TRY, IN_GATE, 'bash open_gate.sh', /needs no x.*\.\/open_gate\.sh/],
  [TRY, ALLOWED, './open_gate.sh', /already has x/],
  [TRY, IN_GATE, './open_gate.sh', null],
  [ALLOW, IN_GATE, 'chmod 777 open_gate.sh', /others change.*777.*chmod 755/],
  [ALLOW, IN_GATE, 'chmod 644 open_gate.sh', /no x for you yet/],
  [ALLOW, IN_GATE, 'chmod x open_gate.sh', /with the plus/],
  [ALLOW, IN_GATE, 'chmod +x open_gate.sh', null],
  [RUN, ALLOWED, 'bash open_gate.sh', /even without x/],
  [RUN, IN_GATE, './open_gate.sh', /no x for you.*chmod \+x/],
  [RUN, ALLOWED, 'open_gate.sh', /\.\/ in front/],
  [RUN, ALLOWED, './open_gate.sh', null],
  [LOCK, IN_GATE, 'chmod 444 inscription.txt', /444 works too.*letters.*chmod a-w/],
  [LOCK, IN_GATE, 'chmod a-r inscription.txt', /took away read.*-w/],
  [LOCK, IN_GATE, 'chmod a+w inscription.txt', /\+ adds.*- takes away.*a-w/],
  [LOCK, IN_GATE, 'chmod a-w guard_diary.txt', /inscription/],
  [LOCK, IN_GATE, 'chmod a-w inscription.txt', null],
  [PRIVATE, IN_GATE, 'chmod 700 guard_diary.txt', /not a program.*600/],
  [PRIVATE, IN_GATE, 'chmod 660 guard_diary.txt', /middle digit is for the group/],
  [PRIVATE, IN_GATE, 'chmod 604 guard_diary.txt', /last digit is for everyone else/],
  [PRIVATE, IN_GATE, 'chmod 400 guard_diary.txt', /first digit is 6/],
  [PRIVATE, IN_GATE, 'chmod 600 guard_diary.txt', null],
  [ROOT, [], 'cd /root', /cd is refused too.*ls \/root/],
  [ROOT, [], 'ls -ld /root', /drwx------.*ls \/root/],
  [ROOT, [], 'ls /root', null],
];

for (const [goal, prefix, line, note] of NEAR_NOTES) {
  test(`"${goal}" ${nearTitle(note)} for ${JSON.stringify(line)}`, async () => {
    const backend = await startChapter(chapter);
    await play(chapter, backend, prefix);
    const { ctx } = await type(backend, line);
    assertNear(chapter.tasks[GOAL[goal]].near?.(ctx) ?? null, ctx, note);
  });
}

test('the boss room puts one rune with a random name and mode 000 in the gate', async () => {
  const runes = new Set();
  for (const seed of SEEDS) {
    const { obs, secret } = await startBoss(chapter, seed);
    assert.equal(obs.cwd, HOME, `seed ${seed}`);
    assert.match(secret.rune, new RegExp(`^${GATE}/rune_[acdefhjkmnprtuvwxy34679]{4}\\.sh$`));
    assert.equal(modeAt(obs, secret.rune), 0o000);
    assert.equal(nodeAt(obs.tree, secret.rune).owner, 'hero');
    assert.deepEqual(Object.keys(nodeAt(obs.tree, GATE).children).filter(name => name.startsWith('rune_')), [secret.rune.split('/').at(-1)]);
    runes.add(secret.rune);
  }
  assert.equal(runes.size, SEEDS.length);
});

test('the boss is beaten by ls -l, chmod 700, then running it, found from the observation', async () => {
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
    assert.match(textOf(last), /inner gate swings open/);
  }
});

test('the boss is also beaten with letters, chmod u+rwx, then running it', async () => {
  const { backend, secret } = await startBoss(chapter, 5);
  await type(backend, `chmod u+rwx ${secret.rune}`);
  assert.ok(chapter.boss.done((await type(backend, secret.rune)).ctx, secret));
});

test('the exact boss hint, then the run its note asks for, beats the boss from anywhere', async () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { backend, secret } = await startBoss(chapter, seed);
    await type(backend, 'cd /etc');
    const { ctx } = await type(backend, chapter.boss.hints[2](secret));
    assertNear(chapter.boss.near(ctx, secret), ctx, /mode is 700 now. Run it/);
    const run = secret.rune.replace(HOME, '~');
    assert.ok(chapter.boss.done((await type(backend, run)).ctx, secret), `seed ${seed}: ${run}`);
  }
});

const BOSS_NOTES = [
  [[], rune => rune, /no permissions at all.*chmod/],
  [[rune => `chmod +x ${rune}`], rune => rune, /Permission denied.*bash must read.*no r.*chmod u\+r.*chmod 700/],
  [[rune => `chmod u+wx ${rune}`], rune => rune, /no r.*chmod u\+r .*rune_.*chmod 700/],
  [[], rune => `chmod u+wx ${rune}`, /now -wx------.*still need r.*chmod u\+r .*rune_/],
  [[], rune => `chmod a+rwx ${rune}`, /now rwxrwxrwx.*group and everyone else.*chmod go-rwx .*rune_/],
  [[], rune => `chmod u+r ${rune}`, /now r--------.*still need wx.*chmod u\+wx/],
  [[rune => `chmod 755 ${rune}`], rune => rune, /It ran, but its mode is 755.*chmod 700/],
  [[rune => `chmod 700 ${rune}`], rune => `bash ${rune}`, /not through bash/],
  [[], rune => `chmod 600 ${rune}`, /mode is now 600.*7, 0, 0/],
  [[], () => 'ls -l ~/gate', null],
];

for (const [prefix, line, note] of BOSS_NOTES) {
  test(`the boss ${nearTitle(note)} for ${[...prefix, line].map(f => f('RUNE')).join('; ')}`, async () => {
    const { backend, secret } = await startBoss(chapter, 3);
    for (const before of prefix) await type(backend, before(secret.rune));
    const { ctx } = await type(backend, line(secret.rune));
    assert.equal(chapter.boss.done(ctx, secret), false);
    assertNear(chapter.boss.near(ctx, secret), ctx, note);
  });
}

test('the rune is kept off the map until an ls lists the gate', () => {
  assert.deepEqual(chapter.boss.hidden({ rune: `${GATE}/rune_xyzw.sh` }), [`${GATE}/rune_xyzw.sh`]);
});

const NOT_COMMANDS = new Set(['-', 'd', 'hero', 'r', 'w', 'x', '4', '2', '1', '7', '6', '5', '0', 'rw-r--r--', 'drwx------', '/root', '$PATH', 'open_gate.sh', 'sudo', 'chmod', 'chmod +x FILE', 'chmod 600 FILE', 'chmod 700 FILE', 'ls -l', 'id', 'u', 'g', 'o', 'a', '+', 'chmod u+x FILE', 'chmod 744 FILE', 'chmod go-r FILE', 'chmod a-w FILE', 'chmod 444 FILE']);

test('every command the chapter shows runs in the simulator', async () => {
  const lines = [
    ...codeSnippets(chapter.lesson).filter(snippet => !NOT_COMMANDS.has(snippet)),
    ...chapter.tasks.map(task => task.hints[2]),
    ...codeSnippets(chapter.boss.briefing).filter(snippet => !NOT_COMMANDS.has(snippet) && !snippet.startsWith('rune_') && snippet !== '.sh' && snippet !== '~/gate'),
    ...chapter.spells.flatMap(spell => spell.examples.map(([line]) => line)).filter(line => !line.includes('FILE')),
    ...chapter.recap.map(([line]) => line).filter(line => !line.includes('FILE')),
  ];
  const backend = await startChapter(chapter);
  await type(backend, 'cd ~/gate');
  for (const line of lines) assert.equal(notFound((await type(backend, line)).result), false, line);
});
