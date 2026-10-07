/**
 * Chapter 11, The Sealed Gate: permissions. ls -l's mode column (owner,
 * group, others; r, w, x), id, reading a script before running it, ./,
 * chmod +x, the numbers of chmod 600, and a directory that is not yours. The
 * boss room puts a second spell with a random name and no permissions at all
 * in the gate: the player gives it 700 and runs it.
 */
import { put, cd, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { resolvePath } from '../checks.js';
import { token } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const DIARY_TEXT = `Day 1. The gate stays shut. The spell beside it will not run.
Day 2. Someone wrote "Check the permissions with ls -l" on the wall. I do not know what it means.
Day 3. I keep this diary here, where anyone can read it. I should fix that.
`;

const RUNE_TEXT = `#!/bin/bash
# The rune of the Inner Gate.
echo "The rune flares, and the inner gate swings open."
echo "Read, write and execute for you; nothing for anyone else."
`;

const gateOf = ctx => `${ctx.home}/gate`;
const spellOf = ctx => `${gateOf(ctx)}/open_gate.sh`;
const diaryOf = ctx => `${gateOf(ctx)}/guard_diary.txt`;
const modeOf = (ctx, path) => (ctx.node(path) ? ctx.node(path).mode & 0o777 : null);
const tilde = path => path.replace(/^\/home\/[^/]+/, '~');
const octal = mode => mode.toString(8).padStart(3, '0');

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;

// A command typed as a path (./open_gate.sh, ~/gate/open_gate.sh): the file it ran.
const ranAsPath = (record, home) => (record.name.includes('/') ? resolvePath(record.name, record.cwd, home) : null);
const runs = (ctx, path, pred = record => record.status === 0) => ctx.commands.some(record => ranAsPath(record, ctx.home) === path && pred(record));
const viaBash = (ctx, path) => ctx.ran('bash', record => ctx.hasPath(record, path)) || ctx.ran('sh', record => ctx.hasPath(record, path));
const listsLong = (ctx, path) => ctx.ran('ls', record => ctx.flag(record, 'l')
  && (ctx.hasPath(record, path) || (ctx.paths(record).length === 0 && record.cwd === path)));
const chmods = (ctx, path) => ctx.ran('chmod', record => ctx.hasPath(record, path));

const spellRunnable = ctx => (modeOf(ctx, spellOf(ctx)) & 0o100) !== 0 && (modeOf(ctx, spellOf(ctx)) & 0o022) === 0;

function setupBoss(random, { home, user }) {
  const rune = `${home}/gate/rune_${token(random, 4)}.sh`;
  const patch = [
    ...restore('gate', { home, user }),
    put(`${home}/gate/guard_diary.txt`, file(DIARY_TEXT, { owner: user, mode: 0o600 })),
    put(rune, file(RUNE_TEXT, { owner: user, mode: 0o000 })),
    cd(home),
  ];
  return { patch, secret: { rune } };
}

const bossDone = (ctx, { rune }) => modeOf(ctx, rune) === 0o700 && runs(ctx, rune);

function bossNear(ctx, { rune }) {
  const mode = modeOf(ctx, rune);
  return bossDone(ctx, { rune }) ? null : firstNote([
    [() => runs(ctx, rune) && mode !== 0o700, `It ran, but its mode is ${octal(mode)}. This room asks for read, write and execute for you, nothing for anyone else: chmod 700.`],
    [() => runs(ctx, rune, record => record.status === 126) && (mode & 0o100) !== 0, 'x lets it run, but bash must also read the file, so it needs r too. chmod 700 gives you read, write and execute.'],
    [() => runs(ctx, rune, record => record.status === 126), 'It has no permissions at all yet: ls -l shows ----------. Give it permissions with chmod first.'],
    [() => viaBash(ctx, rune), 'Run it as a command of its own, with ./ and its name, not through bash.'],
    [() => chmods(ctx, rune) && mode === 0o700, `Its mode is 700 now. Run it: ${tilde(rune)}, or ./ and its name from inside ~/gate.`],
    [() => chmods(ctx, rune) && mode !== 0o700, `Its mode is now ${octal(mode)}. For read, write and execute for you and nothing for others, the digits are 7, 0, 0.`],
  ]);
}

function solveBoss(obs) {
  const gate = `${obs.home}/gate`;
  const rune = Object.keys(nodeAt(obs.tree, gate).children).find(name => name.startsWith('rune_'));
  return ['ls -l ~/gate', `chmod 700 ~/gate/${rune}`, `~/gate/${rune}`];
}

export default {
  id: 'gate',
  act: 2,
  title: 'The Sealed Gate',
  setup: (_random, player) => [
    ...restore('gate', player),
    put(`${player.home}/gate/guard_diary.txt`, file(DIARY_TEXT, { owner: player.user, mode: 0o644 })),
    cd(player.home),
  ],
  effects: ctx => (runs(ctx, spellOf(ctx)) ? [{ kind: 'gate-opened' }] : []),
  lesson: `<p>Every file and directory says who may do what with it. <code>ls -l</code> shows it in the first column:</p>
<pre>-rw-r--r-- 1 hero hero 142 Oct  6 12:00 open_gate.sh</pre>
<ul>
<li>The first character is the type: <code>-</code> for a file, <code>d</code> for a directory.</li>
<li>Then come three groups of three letters: for the <b>owner</b> (the first name after the number, here <code>hero</code>), for the file's <b>group</b> (the second name), and for <b>everyone else</b>.</li>
<li><code>r</code> means read, <code>w</code> means write (change it), <code>x</code> means execute (run it as a program). A <code>-</code> means that permission is missing. So <code>rw-r--r--</code> is: you may read and write; the group and everyone else may only read.</li>
<li><code>id</code> prints who you are and the groups you belong to.</li>
</ul>
<p>A <b>script</b> is a text file of commands. To run a script as a command of its own, it needs the <code>x</code> permission, and you type its path. <code>./</code> means "in this directory", so <code>./open_gate.sh</code> runs the file <code>open_gate.sh</code> that is here. Its name alone is not enough: bash looks for commands only in the directories of <code>$PATH</code> (chapter 10), and this one is not there. A wise mage reads a script with <code>cat</code> before running it.</p>
<p><code>chmod</code> (change mode) changes the permissions, if the file is yours:</p>
<ul>
<li><code>chmod +x FILE</code> adds execute.</li>
<li>With numbers, each group gets one digit, the sum of <code>4</code> read, <code>2</code> write and <code>1</code> execute: <code>7</code> = all three, <code>6</code> = read and write, <code>5</code> = read and execute, <code>4</code> = only read, <code>0</code> = nothing. The three digits are for the owner, the group and everyone else. <code>chmod 600 FILE</code> gives you read and write, and nobody else anything.</li>
</ul>
<p>For a directory, <code>r</code> lets you list it and <code>x</code> lets you go into it. <code>/root</code> is the home of root, the administrator, and its mode is <code>drwx------</code>: only root may enter. On machines where you are an administrator, you type <code>sudo</code> in front of a command to run it as root. Here, hero is not one.</p>`,
  tasks: [
    {
      goal: 'Read the permissions of everything at the gate `~/gate` (`ls -l`: the first column shows who may do what)',
      tip: 'Three groups of `rwx`, for the owner, the group and everyone else, where a `-` means that permission is missing.',
      hints: [
        'The long listing from chapter 7 starts each line with the permissions.',
        'Use `ls` with `-l` and the path of the gate.',
        'ls -l ~/gate',
      ],
      done: ctx => listsLong(ctx, gateOf(ctx)),
      near: ctx => (ctx.ran('ls', record => !ctx.flag(record, 'l') && (ctx.hasPath(record, gateOf(ctx)) || record.cwd === gateOf(ctx))) ? 'Add -l for the long listing: its first column shows the permissions.' : null),
    },
    {
      goal: 'Find out who you are and which groups you are in (`id`)',
      tip: '`id` prints your user, your main group and every group you belong to.',
      hints: [
        'One short command prints your user and your groups.',
        'Type `id`.',
        'id',
      ],
      done: ctx => ctx.ran('id'),
      near: ctx => (ctx.ran('whoami') ? 'whoami prints only your name. id prints your groups too.' : null),
    },
    {
      goal: 'Read the spell `~/gate/open_gate.sh` before you run it',
      tip: 'A script is a text file of commands, so read it before you run it to know what it will do.',
      hints: [
        'It is a text file, so the command that prints files works on it.',
        'Use `cat` and its path.',
        'cat ~/gate/open_gate.sh',
      ],
      done: ctx => ctx.read(spellOf(ctx)),
    },
    {
      goal: 'Go into `~/gate` and try to run the spell with `./open_gate.sh` (`./` means "in this directory"), and read why it refuses',
      tip: 'Without the `x` permission, a file cannot run as a command: bash says Permission denied.',
      hints: [
        'First `cd` into the gate. Then type the spell\'s name with `./` in front.',
        'The `./` tells bash the file is in the directory you are in.',
        './open_gate.sh',
      ],
      done: ctx => runs(ctx, spellOf(ctx), record => record.status === 126),
      near: ctx => firstNote([
        [() => ctx.tried('open_gate.sh'), 'bash looked for open_gate.sh in the directories of $PATH, not here. Put ./ in front: ./open_gate.sh.'],
        [() => viaBash(ctx, spellOf(ctx)), 'bash open_gate.sh reads the file itself, so it needs no x. This task runs it as a command of its own: ./open_gate.sh.'],
        [() => runs(ctx, spellOf(ctx)), 'It already has x, so it ran. Look at its permissions with ls -l.'],
      ]),
    },
    {
      goal: 'Allow the spell `open_gate.sh` to execute (`chmod +x`: `+x` adds the execute permission)',
      tip: 'After `chmod +x`, `ls -l` shows `rwxr-xr-x`: everyone may run it, only you may change it.',
      hints: [
        'The spell is missing one permission: `x`.',
        '`chmod`, then `+x`, then the name of the spell.',
        'chmod +x ~/gate/open_gate.sh',
      ],
      done: ctx => chmods(ctx, spellOf(ctx)) && spellRunnable(ctx),
      near: ctx => (chmods(ctx, spellOf(ctx)) && spellRunnable(ctx) ? null : firstNote([
        [() => chmods(ctx, spellOf(ctx)) && (modeOf(ctx, spellOf(ctx)) & 0o022) !== 0, `That lets others change the spell too (mode ${octal(modeOf(ctx, spellOf(ctx)))}). Use chmod 755: 7 for you, 5 (read and execute) for the rest.`],
        [() => chmods(ctx, spellOf(ctx)), 'ls -l shows no x for you yet. chmod +x adds it.'],
        [() => ctx.tried('chmod', record => record.args.includes('x')), 'Write +x, with the plus: chmod +x open_gate.sh.'],
      ])),
    },
    {
      goal: 'Run the spell `open_gate.sh`, and watch the gate',
      tip: 'With `x` set, the file runs as a command of its own.',
      hints: [
        'Run it the way you tried before. This time it has `x`.',
        'From inside `~/gate`, `./` and its name.',
        './open_gate.sh',
      ],
      done: ctx => runs(ctx, spellOf(ctx)),
      near: ctx => firstNote([
        [() => viaBash(ctx, spellOf(ctx)), 'bash open_gate.sh works even without x. Run it as a command of its own: ./open_gate.sh.'],
        [() => runs(ctx, spellOf(ctx), record => record.status === 126), 'It still has no x for you. Add it with chmod +x first.'],
        [() => ctx.tried('open_gate.sh'), 'Its name alone is not enough: put ./ in front.'],
      ]),
    },
    {
      goal: 'Make the guard\'s diary `~/gate/guard_diary.txt` private: read and write for you, nothing for anyone else (`chmod 600`: 6 = 4 read + 2 write)',
      tip: 'One digit each for the owner, the group and everyone else: `4` read, `2` write, `1` execute, added up.',
      hints: [
        'You need read and write (4 + 2 = 6) for yourself, and 0 for the group and for others.',
        '`chmod`, the three digits, then the path of the diary.',
        'chmod 600 ~/gate/guard_diary.txt',
      ],
      done: ctx => chmods(ctx, diaryOf(ctx)) && modeOf(ctx, diaryOf(ctx)) === 0o600,
      near: ctx => {
        const mode = modeOf(ctx, diaryOf(ctx));
        return !chmods(ctx, diaryOf(ctx)) || mode === 0o600 ? null : firstNote([
          [() => (mode & 0o100) !== 0, `7 adds execute, and a diary is not a program. Read and write is 4 + 2 = 6: chmod 600.`],
          [() => (mode & 0o070) !== 0, `The middle digit is for the group, and it is not 0 yet (mode ${octal(mode)}). Use 600.`],
          [() => (mode & 0o007) !== 0, `The last digit is for everyone else, and it is not 0 yet (mode ${octal(mode)}). Use 600.`],
          [() => (mode & 0o600) !== 0o600, `You need read and write yourself: the first digit is 6. Use 600.`],
        ]);
      },
    },
    {
      goal: 'Try to list the contents of `/root` with `ls`, and read why it refuses',
      tip: '`/root` is the administrator\'s home, and its mode `drwx------` lets only root in.',
      hints: [
        'List it the way you list any directory. It will not work, and that is the point.',
        '`ls` and the path `/root`.',
        'ls /root',
      ],
      done: ctx => ctx.tried('ls', record => record.status !== 0 && ctx.hasPath(record, '/root')),
      near: ctx => firstNote([
        [() => ctx.tried('cd', record => record.status !== 0 && ctx.hasPath(record, '/root')), 'cd is refused too, for the same reason. Now try ls /root.'],
        [() => ctx.ran('ls', record => ctx.hasPath(record, '/root') && ctx.flag(record, 'd')), 'ls -ld shows the mode of /root itself: drwx------. Now try to list what is inside: ls /root.'],
      ]),
    },
  ],
  solve: [
    'ls -l ~/gate',
    'id',
    'cat ~/gate/open_gate.sh',
    'cd ~/gate',
    './open_gate.sh',
    'chmod +x open_gate.sh',
    './open_gate.sh',
    'chmod 600 guard_diary.txt',
    'ls /root',
  ],
  boss: {
    title: 'The Inner Gate',
    briefing: `<p>Behind the gate, a second spell has appeared in <code>~/gate</code>, a file named <code>rune_</code> and four letters, ending in <code>.sh</code>. It has no permissions at all, not even for you. Give it read, write and execute for you, and nothing for anyone else, then run it.</p>`,
    setup: setupBoss,
    hints: [
      'Find its name with `ls -l ~/gate`: its permissions are `----------`.',
      '`chmod` with three digits: read, write and execute is 4 + 2 + 1 = 7 for you, then 0 for the group and 0 for others. After that, run it by its path.',
      ({ rune }) => `chmod 700 ${tilde(rune)}`,
    ],
    done: bossDone,
    near: bossNear,
    hidden: ({ rune }) => [rune],
    solve: solveBoss,
  },
  recap: [
    ['ls -l', 'the first column shows the permissions: owner, group, others'],
    ['id', 'who you are, and your groups'],
    ['cat open_gate.sh', 'read a script before you run it'],
    ['./open_gate.sh', 'run the script that is in this directory'],
    ['chmod +x open_gate.sh', 'allow a file to run as a program'],
    ['chmod 600 guard_diary.txt', 'read and write for you, nothing for others'],
    ['chmod 700 FILE', 'read, write and execute for you, nothing for others'],
  ],
  why: `<p>Why <code>./</code>? Bash does not look in the directory you are in unless you say so. If it did, a file named <code>ls</code> left in some directory could run instead of the real <code>ls</code> when you list it. With <code>./</code>, you always know which file runs.</p>
<p>Why does a script need <code>r</code> as well as <code>x</code>? A script is not a program the processor can run. bash runs it by reading its lines, one by one, so bash must be allowed to read the file.</p>
<p>Why numbers? Each permission is one bit: read is worth 4, write 2, execute 1. Three bits make a digit from 0 to 7, so three digits hold all nine permissions. <code>chmod +x</code> is easier to read; <code>chmod 600</code> sets all nine at once.</p>`,
  field: [
    ['chmod u+x FILE', 'add execute for the owner (`u`) only; `g` is the group, `o` everyone else'],
    ['chmod -w FILE', 'remove write, so you cannot change the file by mistake'],
    ['ls -ld DIR', 'the permissions of a directory itself, not of what it holds'],
    ['umask', 'print which permissions new files and directories are made without'],
    ['sudo COMMAND', 'run one command as root, on a machine where you are an administrator'],
  ],
  spells: [
    { name: 'ls -l', summary: 'Long listing: permissions, owner, group, size, date.', examples: [['ls -l ~/gate', 'the first column: `-rw-r--r--`']] },
    { name: 'id', summary: 'Print your user and your groups.', examples: [['id', 'prints: `uid=1000(hero) gid=1000(hero) groups=1000(hero)`']] },
    { name: './', summary: 'Run a file that is in this directory.', examples: [['./open_gate.sh', 'needs the `x` permission']] },
    { name: 'chmod', summary: 'Change who may read, write or execute a file.', examples: [['chmod +x open_gate.sh', 'add execute'], ['chmod 600 guard_diary.txt', 'read and write for you only'], ['chmod 700 FILE', 'everything for you, nothing for others']] },
  ],
};
