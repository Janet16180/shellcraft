/**
 * Chapter 10, The Descent: the player leaves home for the rest of the system.
 * The root directory /, the settings in /etc, the logs in /var/log, a file
 * they may not read, $PATH, which and type. The boss room installs a new
 * command with a random name in /usr/local/bin and writes its name in the
 * last line of a log: the player reads it with tail and runs it by name.
 */
import { put, remove, cd, dir, file } from '../../backend/spec.js';
import { READERS } from '../checks.js';
import { pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const HOSTNAME = '/etc/hostname';
const PASSWD = '/etc/passwd';
const DPKG = '/var/log/dpkg.log';
const SYSLOG = '/var/log/syslog';
const LOG = '/var/log/guardian.log';
const LOCAL_BIN = '/usr/local/bin';
const PATH_VALUE = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const NAMES = ['glimmer', 'lumen', 'beacon', 'ember', 'halo', 'flare', 'starfall', 'moonbeam'];

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;
const textIn = (tree, path) => (nodeAt(tree, path)?.type === 'file' ? nodeAt(tree, path).content : null);
const lastLines = (text, count) => `${text.slice(0, -1).split('\n').slice(-count).join('\n')}\n`;

// What a fresh Ubuntu 24.04 has in /usr/local: empty directories.
const LOCAL_DIRS = ['bin', 'etc', 'games', 'include', 'lib', 'man', 'sbin', 'share', 'src'];
const usrLocal = (extra = {}) => dir(Object.fromEntries(LOCAL_DIRS.map(name => [name, dir(name === 'bin' ? extra : {})])));

const listsRoot = ctx => ctx.ran('ls', record => ctx.hasPath(record, '/') || (ctx.paths(record).length === 0 && record.cwd === '/'));
const readsLastThree = ctx => ctx.ran('tail', record => ctx.hasPath(record, DPKG)
  && record.stdout === lastLines(textIn(ctx.obs.tree, DPKG) ?? '', 3));
const failedSyslog = ctx => ctx.commands.some(record => READERS.has(record.name) && record.status !== 0 && ctx.hasPath(record, SYSLOG));
const printsPath = ctx => ctx.ran('echo', record => record.stdout === `${PATH_VALUE}\n` && record.stages === 1 && ctx.onScreen(record));

function guardianLog(host, name) {
  const line = (time, text) => `2026-10-08T${time}+00:00 ${host} guardian: ${text}`;
  return [
    line('06:00:01.104221', 'the night watch is over, all gates are closed'),
    line('06:30:12.551087', 'checked the doors of /etc: nothing has changed'),
    line('07:02:44.903318', 'swept the scrap room /tmp'),
    line('07:45:09.217764', 'an apprentice was seen reading in /etc'),
    line('08:15:30.660412', 'the Shadow Daemon stirs, somewhere below'),
    line('08:59:58.330195', `installed a new command: ${name}`),
  ].join('\n').concat('\n');
}

const commandScript = name => `#!/bin/sh
echo "A small light rises from the floor of the dungeon."
echo "The new command ${name} works: you ran it by its name alone."
`;

function setupBoss(random, { home, host = 'kernelia' }) {
  const name = pick(random, NAMES);
  const command = `${LOCAL_BIN}/${name}`;
  const patch = [
    put('/usr/local', usrLocal({ [name]: file(commandScript(name), { mode: 0o755 }) })),
    put(LOG, file(guardianLog(host, name))),
    cd(home),
  ];
  return { patch, secret: { name, command, log: LOG } };
}

const ranByName = (ctx, name) => ctx.ran(name);
const onlyHero = (ctx, record) => {
  const lines = record.stdout.split('\n').filter(Boolean);
  return lines.length > 0 && lines.every(line => line.startsWith(`${ctx.home.split('/').pop()}:`));
};

function bossNear(ctx, { name, command }) {
  return ranByName(ctx, name) ? null : firstNote([
    [() => ctx.tried(`./${name}`), `./${name} runs it from the directory you stand in. Since ${LOCAL_BIN} is in $PATH, type only its name, from anywhere: ${name}.`],
    [() => ctx.ran(command), `That ran it by its full path. Since ${LOCAL_BIN} is in $PATH, type only its name: ${name}.`],
    [() => ctx.ran('which', record => record.args.includes(name)), `which found it in ${LOCAL_BIN}, a directory in $PATH. Now type only its name to run it.`],
    [() => ctx.commands.some(record => record.status === 127 && !record.name.includes('/')), `bash found no command by that name. The last line of ${LOG} names the new command.`],
    [() => ctx.ran('head', record => ctx.hasPath(record, LOG)), 'head prints the oldest lines. The newest line of a log is at its end: use tail.'],
  ]);
}

function solveBoss(obs) {
  const last = textIn(obs.tree, LOG).trim().split('\n').at(-1);
  const name = last.split(' ').at(-1);
  return [`tail -n 1 ${LOG}`, `which ${name}`, name];
}

export default {
  id: 'descent',
  act: 2,
  title: 'The Descent',
  setup: (_random, { home }) => [
    put('/usr/local', usrLocal()),
    remove(LOG),
    cd(home),
  ],
  lesson: `<p>Your home is only one small corner of the machine. The rest of the system lies below and around it, and it belongs to <b>root</b>, the administrator. You can walk through most of it and read many files, but you cannot change them.</p>
<ul>
<li>Every absolute path starts at <code>/</code>, the <b>root directory</b>: the top of the whole filesystem. <code>ls /</code> lists what is there. (Root, the user, and <code>/</code>, the root directory, share the name, but they are two different things.)</li>
<li><code>/etc</code> holds the system's settings, as plain text files you can read with <code>cat</code>. <code>/etc/hostname</code> holds the machine's name. <code>/etc/passwd</code> has one line for each account on the machine, yours too. (Despite its name, it holds no passwords.)</li>
<li><code>/var/log</code> holds <b>logs</b>: files where programs write what they do, one line for each event. New lines go at the end, so <code>tail</code> shows the newest. <code>tail -n 3 FILE</code> prints only the last 3 lines.</li>
<li>Some files are not for you. When you try to read one, the shell says <b>Permission denied</b>. That is not a mistake in your command: the file's owner did not allow you to read it. The next chapter shows how these permissions work.</li>
</ul>
<p>How does the shell find a command? When you type <code>ls</code>, bash looks through a list of directories, in order, for a file named <code>ls</code>, and runs the first one it finds. That list is kept in a <b>variable</b> named <code>PATH</code>: a name that holds a value. A <code>$</code> in front of a name stands for its value, so <code>echo $PATH</code> prints the list, with a <code>:</code> between the directories.</p>
<ul>
<li><code>which ls</code> prints the file that runs when you type <code>ls</code>: it searches the directories in <code>$PATH</code>, as bash does.</li>
<li>A few commands are not files at all: they are part of bash itself, so <code>which</code> finds nothing for them. <code>cd</code> is one. <code>type cd</code> asks bash what <code>cd</code> is.</li>
</ul>`,
  tasks: [
    {
      goal: 'List the very top of the filesystem, the root directory `/` (`ls /`)',
      tip: 'Every absolute path starts at `/`, the root directory: the top of the whole filesystem.',
      hints: [
        'Your home is `/home/hero`. Above `/home` there is only one more directory: `/`.',
        'Give `ls` the path `/` alone.',
        'ls /',
      ],
      done: listsRoot,
      near: ctx => firstNote([
        [() => ctx.ran('ls', record => ctx.paths(record).length === 0 && record.cwd === ctx.home), 'That listed your home. The top of everything is `/` alone: ls /.'],
        [() => ctx.ran('ls', record => ctx.hasPath(record, '/home')), 'That is /home, one step below the top. List / alone.'],
      ]),
    },
    {
      goal: 'Read the machine\'s name in `/etc/hostname` (`/etc` holds the system\'s settings, as text files)',
      tip: 'The settings in `/etc` are plain text, so `cat` reads them like any other file.',
      hints: [
        'The file is called `hostname`, and it lives in `/etc`.',
        'Read it with `cat` and its absolute path.',
        'cat /etc/hostname',
      ],
      done: ctx => ctx.read(HOSTNAME),
      near: ctx => firstNote([
        [() => ctx.ran('hostname'), 'The hostname command prints it too, but this task reads the file where it is kept: cat /etc/hostname.'],
        [() => ctx.ran('ls', record => ctx.hasPath(record, '/etc')), 'That listed /etc. Now read the file hostname in it with cat.'],
      ]),
    },
    {
      goal: 'Find your own account, `hero`, in `/etc/passwd` (one line for each account; `grep` picks yours)',
      tip: '`grep hero` prints only the lines with `hero` in them.',
      hints: [
        '`/etc/passwd` has a line for every account. You want only the line with your name.',
        'Search the file with `grep`, for your user name `hero`.',
        'grep hero /etc/passwd',
      ],
      // Any pattern that picks only your line: hero, ^hero, hero: and so on.
      done: ctx => ctx.ran('grep', record => ctx.hasPath(record, PASSWD) && onlyHero(ctx, record)),
      near: ctx => (ctx.shown(PASSWD) ? 'That printed every account. grep hero /etc/passwd prints only yours.' : null),
    },
    {
      goal: 'Read only the last 3 lines of the package log `/var/log/dpkg.log` (`tail -n 3`: the newest lines are at the end)',
      tip: 'Programs add each new line to the end of their log, so `tail` shows what happened last.',
      hints: [
        'The newest lines of a log are at its end.',
        'Use `tail` with `-n 3` and the path of the log.',
        'tail -n 3 /var/log/dpkg.log',
      ],
      done: readsLastThree,
      near: ctx => (readsLastThree(ctx) ? null : firstNote([
        [() => ctx.ran('tail', record => ctx.hasPath(record, DPKG)), 'That printed a different number of lines. Add -n 3 to tail for the last 3.'],
        [() => ctx.ran('head', record => ctx.hasPath(record, DPKG)), 'head prints the first, oldest lines. The newest are at the end: use tail.'],
        [() => ctx.shown(DPKG), 'That printed the whole log. tail -n 3 prints only its last 3 lines.'],
      ])),
    },
    {
      goal: 'Try to read the system log `/var/log/syslog`, and read why it refuses',
      tip: 'Permission denied means the file\'s owner did not allow you to read it.',
      hints: [
        'Read it the way you read any file. It will not work, and that is the point.',
        'Use `cat` and its path, then read the message.',
        'cat /var/log/syslog',
      ],
      done: failedSyslog,
      near: ctx => (ctx.ran('ls', record => ctx.hasPath(record, '/var/log')) ? 'syslog is in that list. Now try to read it with cat.' : null),
    },
    {
      goal: 'Show the directories where bash looks for commands (`echo $PATH`)',
      tip: 'A `$` in front of a name stands for its value, and `PATH` holds a list of directories joined by `:`.',
      hints: [
        'The list is kept in a variable named `PATH`. `echo` can print its value.',
        'Put `$` in front of the name, so that you get its value.',
        'echo $PATH',
      ],
      done: printsPath,
      near: ctx => firstNote([
        [() => ctx.ran('echo', record => record.args.join(' ') === 'PATH'), 'Without the $, echo prints the word PATH. Put $ in front: echo $PATH.'],
        [() => ctx.tried(PATH_VALUE), 'Alone, bash tried to run the value as a command. Put echo in front: echo $PATH.'],
      ]),
    },
    {
      goal: 'Find which file runs when you type `ls` (`which` searches the directories in `$PATH`)',
      tip: '`which` looks through `$PATH` the way bash does, and prints the first match.',
      hints: [
        '`ls` is a program, kept as a file in one of the directories of `$PATH`.',
        'Type `which`, then the name of the command.',
        'which ls',
      ],
      done: ctx => ctx.ran('which', record => record.args.includes('ls')),
    },
    {
      goal: 'Ask bash what kind of command `cd` is (`type cd`)',
      tip: '`type` asks bash itself, and `cd` is part of bash, so there is no file for `which` to find.',
      hints: [
        'Try `which cd` first: it prints nothing, because there is no file named `cd`.',
        'Ask bash with `type` and the name `cd`.',
        'type cd',
      ],
      done: ctx => ctx.ran('type', record => record.args.includes('cd')),
      near: ctx => (ctx.tried('which', record => record.args.includes('cd')) ? 'which found no file for cd, because cd is part of bash itself. Ask bash: type cd.' : null),
    },
  ],
  solve: [
    'ls /',
    'cat /etc/hostname',
    'grep hero /etc/passwd',
    'tail -n 3 /var/log/dpkg.log',
    'cat /var/log/syslog',
    'echo $PATH',
    'which ls',
    'type cd',
  ],
  boss: {
    title: 'The New Command',
    briefing: `<p>The guardian of the dungeon installed a new command today, and wrote its name in the last line of its log, <code>/var/log/guardian.log</code>. Read the last line of the log, find where the command lives with <code>which</code>, then run it by typing only its name.</p>`,
    setup: setupBoss,
    hints: [
      'Newest lines are at the end of a log: `tail -n 1 /var/log/guardian.log` prints the last one.',
      '`which` and the name show it is in a directory of `$PATH`. Then type the name alone and press Enter.',
      ({ name }) => name,
    ],
    done: (ctx, { name }) => ranByName(ctx, name),
    near: bossNear,
    hidden: ({ log, command }) => [log, command],
    solve: solveBoss,
  },
  recap: [
    ['ls /', 'list the root directory, the top of the filesystem'],
    ['cat /etc/hostname', 'read a setting: the files in `/etc` are text'],
    ['grep hero /etc/passwd', 'find your account: one line for each account'],
    ['tail -n 3 /var/log/dpkg.log', 'the newest lines of a log, at its end'],
    ['echo $PATH', 'the directories where bash looks for commands'],
    ['which ls', 'the file that runs when you type `ls`'],
    ['type cd', 'ask bash what a command is; `cd` is part of bash'],
  ],
  why: `<p>Why is everything a text file? Settings in <code>/etc</code> and logs in <code>/var/log</code> are plain text, so the tools you already know (<code>cat</code>, <code>grep</code>, <code>tail</code>) work on all of them. You do not need a special program for each one.</p>
<p>Why <code>$PATH</code>? Without it you would type <code>/usr/bin/ls</code> every time. With it, bash finds the file for you, and a new program becomes a new command as soon as it is put into one of those directories. Programs the administrator installs by hand usually go in <code>/usr/local/bin</code>.</p>
<p>Why is <code>cd</code> part of bash? Each program runs as its own process, with its own working directory. A <code>cd</code> program could only change its own directory, not your shell's, so <code>cd</code> has to be built into the shell.</p>`,
  field: [
    ['uname -a', 'the name and version of the kernel, and the machine type'],
    ['cat /etc/os-release', 'which Linux distribution and version this is'],
    ['less /var/log/dpkg.log', 'scroll through a long log; `q` quits'],
    ['tail -f FILE', 'keep printing new lines as a log grows; Ctrl+C stops'],
    ['type -a echo', 'every place bash would find a command, builtin first'],
  ],
  spells: [
    { name: '/', summary: 'The root directory: the top of the filesystem.', examples: [['ls /', 'list it']] },
    { name: 'tail -n', summary: 'Print a chosen number of last lines.', examples: [['tail -n 3 /var/log/dpkg.log', 'the 3 newest lines of a log']] },
    { name: '$PATH', summary: 'The directories where bash looks for commands, in order.', examples: [['echo $PATH', 'print the list']] },
    { name: 'which', summary: 'Print the file that runs for a command name.', examples: [['which ls', 'prints: `/usr/bin/ls`']] },
    { name: 'type', summary: 'Ask bash what a command is: a builtin, an alias, or a file.', examples: [['type cd', 'prints: `cd is a shell builtin`']] },
  ],
};
