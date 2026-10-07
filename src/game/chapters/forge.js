/**
 * Chapter 14, Forge Your Own Spell: shell scripts. The #!/bin/bash line,
 * writing script lines with echo in single quotes (> then >>), chmod +x and
 * running by path, $1, a for loop over *.ore, and the rule that a script runs
 * in a shell of its own that starts where you are. The boss writes a script
 * that cds into the ore pile itself, so it works from anywhere.
 */
import { put, remove, stop, cd, dir, file } from '../../backend/spec.js';
import { shuffle } from '../rng.js';
import { resolvePath } from '../checks.js';

const SIGN = `THE FORGE
Here, commands are hammered into scripts:
files that run many commands with one name.
`;

const ORES = ['copper', 'iron', 'silver'];
const BOSS_ORES = ['cobalt', 'gold', 'mithril', 'nickel', 'obsidian', 'quartz', 'tin', 'zinc'];
const SHEBANG = '#!/bin/bash';
const HELLO_LINE = 'echo Hello from the forge';
const GREET_LINE = 'echo Hello, $1';
const LOOP = 'for ore in *.ore; do echo Smelting $ore; done';
const OLD_KEYS = ['imp', 'greedy', 'stubborn', 'daemon', 'imp-a', 'imp-b', 'imp-c'];

const forgeOf = ctx => `${ctx.home}/forge`;
const oreOf = ctx => `${forgeOf(ctx)}/ore`;
const script = (ctx, name) => `${forgeOf(ctx)}/${name}`;

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;
const textIn = (ctx, path) => (ctx.node(path)?.type === 'file' ? ctx.node(path).content : null);
const lines = (...rows) => rows.map(row => `${row}\n`).join('');
const smelted = names => names.map(name => `Smelting ${name}.ore\n`).join('');

// The records of a line that ran the script at `path`, typed by any path that leads there.
const runsOf = (ctx, path) => ctx.commands.filter(record => record.name.includes('/') && resolvePath(record.name, record.cwd, ctx.home) === path);
const ranScript = (ctx, path, pred = () => true) => runsOf(ctx, path).some(record => record.status === 0 && pred(record));
const deniedScript = (ctx, path) => runsOf(ctx, path).some(record => record.status === 126);

// Whether the file holds `row` with its $ words already swapped for their values (empty or not).
function swapped(row, text) {
  if (!row.includes('$')) return false;
  const escaped = row.split(/\$\w+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`^${escaped.join('[^ ;]*')}$`);
  return text.split('\n').some(line => line !== row && pattern.test(line));
}

// A note for a script file that is being written line by line.
function writingNote(ctx, path, want) {
  const text = textIn(ctx, path);
  const name = path.slice(path.lastIndexOf('/') + 1);
  return firstNote([
    [() => text !== null && !text.startsWith(`${SHEBANG}\n`) && want.slice(1).some(row => text.startsWith(`${row}\n`)), `> replaced the whole file, so the ${SHEBANG} line is gone. Write it again with >, then add the next line with >>.`],
    [() => text !== null && text.split('\n').filter(row => row === SHEBANG).length > 1, `${name} has the ${SHEBANG} line twice. Write it again with > to start over.`],
    [() => text !== null && want.some(row => swapped(row, text)), 'Double quotes swapped the $ word for its value while writing. Use single quotes so the file keeps it as typed.'],
  ]);
}

const orePile = (user, ores) => dir(Object.fromEntries(ores.map(name => [`${name}.ore`, file(`raw ${name}\n`, { owner: user })])), { owner: user });
const forgeArea = (user, ores) => dir({ 'sign.txt': file(SIGN, { owner: user }), ore: orePile(user, ores) }, { owner: user });

function setupBoss(random, { home, user }) {
  const ores = shuffle(random, BOSS_ORES).slice(0, 3 + Math.floor(random() * 2)).sort();
  const forge = `${home}/forge`;
  return {
    patch: [
      remove(`${forge}/ore`),
      put(`${forge}/ore`, orePile(user, ores)),
      remove(`${forge}/smelt.sh`),
      cd(home),
    ],
    secret: { ores, script: `${forge}/smelt.sh`, ore: `${forge}/ore` },
  };
}

function bossDone(ctx, { ores, script: path, ore }) {
  return ranScript(ctx, path, record => record.cwd !== ore && record.stdout === smelted(ores));
}

function bossNear(ctx, secret) {
  const { script: path, ore } = secret;
  const text = textIn(ctx, path) ?? '';
  return bossDone(ctx, secret) ? null : firstNote([
    [() => deniedScript(ctx, path), 'Permission denied: it has no x yet. chmod +x ~/forge/smelt.sh first.'],
    [() => ranScript(ctx, path, record => record.cwd === ore), 'That worked, because you were in ~/forge/ore. Run it from your home directory too: the script must cd there itself.'],
    [() => ranScript(ctx, path) && !text.includes('cd '), 'From here, *.ore matches nothing: a script starts where you are. Add the line cd ~/forge/ore before the loop.'],
    [() => ranScript(ctx, path), 'The script ran, but did not print Smelting and the name for every ore. Read it with cat ~/forge/smelt.sh.'],
    [() => writingNote(ctx, path, [SHEBANG, 'cd ~/forge/ore', LOOP]) !== null, writingNote(ctx, path, [SHEBANG, 'cd ~/forge/ore', LOOP])],
  ]);
}

const BOSS_LINE = `echo '${SHEBANG}' > ~/forge/smelt.sh && echo 'cd ~/forge/ore' >> ~/forge/smelt.sh && echo '${LOOP}' >> ~/forge/smelt.sh && chmod +x ~/forge/smelt.sh && ~/forge/smelt.sh`;

export default {
  id: 'forge',
  act: 2,
  title: 'Forge Your Own Spell',
  setup: (_random, { home, user }) => [
    ...OLD_KEYS.map(stop),
    remove(`${home}/forge`),
    put(`${home}/forge`, forgeArea(user, ORES)),
    cd(home),
  ],
  lesson: `<p>A <b>script</b> is a text file full of commands. When you run it, bash runs its lines one after another, as if you typed them. Scripts are how you make your own spells.</p>
<ul>
<li>The first line, <code>#!/bin/bash</code>, says which program reads the file: here, bash.</li>
<li>You can write a script line by line with <code>echo</code>: <code>></code> for the first line, which makes the file new, and <code>>></code> for each line after it, which adds to the end.</li>
<li>Put each line in <b>single quotes</b>, so it goes into the file exactly as you typed it. In double quotes, <code>$1</code> or <code>$ore</code> would be swapped for their value now, while you write, and a <code>!</code> makes bash look in your history instead. Check what you wrote with <code>cat</code>.</li>
<li>Give the script <code>x</code> with <code>chmod +x</code>, as you did at the gate, and run it by its path: <code>~/forge/hello.sh</code>.</li>
</ul>
<p>A script can take words, like any command. Inside it, <code>$1</code> is the first word you typed after its name, <code>$2</code> the second: run <code>~/forge/greet.sh Tux</code>, and <code>$1</code> is <code>Tux</code>.</p>
<p>A <b>loop</b> runs the same commands for each item of a list:</p>
<ul>
<li><code>for ore in *.ore; do echo Smelting $ore; done</code></li>
<li><code>*.ore</code> becomes the list of every name ending in <code>.ore</code>. For each one, <code>$ore</code> holds the name, and the commands between <code>do</code> and <code>done</code> run.</li>
</ul>
<p>One last rule: a script runs in a new shell of its own, which starts in the directory you are in. A <code>cd</code> inside the script moves the script, not you.</p>`,
  tasks: [
    {
      goal: 'Write the first line of a script, `#!/bin/bash`, into `~/forge/hello.sh`, in single quotes (`echo \'#!/bin/bash\' > ~/forge/hello.sh`)',
      tip: 'The `#!` line names the program that reads the script, and single quotes keep the `!` from meaning anything to bash.',
      hints: [
        '`echo` prints the line, and `>` sends it into the file.',
        'Put `#!/bin/bash` in single quotes `\'`, then `> ~/forge/hello.sh`.',
        `echo '${SHEBANG}' > ~/forge/hello.sh`,
      ],
      done: ctx => (textIn(ctx, script(ctx, 'hello.sh')) ?? '').startsWith(`${SHEBANG}\n`),
      near: ctx => writingNote(ctx, script(ctx, 'hello.sh'), [SHEBANG, HELLO_LINE]),
    },
    {
      goal: 'Add a second line, `echo Hello from the forge`, to the end of `~/forge/hello.sh` with `>>`',
      tip: '`>>` adds to the end of a file, while `>` would replace the whole file.',
      hints: [
        'The same as the last line, with the new line in the quotes and `>>`.',
        '`echo`, the line in single quotes, then `>> ~/forge/hello.sh`.',
        `echo '${HELLO_LINE}' >> ~/forge/hello.sh`,
      ],
      done: ctx => textIn(ctx, script(ctx, 'hello.sh')) === lines(SHEBANG, HELLO_LINE),
      near: ctx => writingNote(ctx, script(ctx, 'hello.sh'), [SHEBANG, HELLO_LINE]),
    },
    {
      goal: 'Read the script back, to check both lines (`cat ~/forge/hello.sh`)',
      tip: 'Reading a script back with `cat` catches a lost line or a wrong quote before you run it.',
      hints: [
        'You know the command that prints a file.',
        '`cat` and the path of the script.',
        'cat ~/forge/hello.sh',
      ],
      done: ctx => ctx.read(script(ctx, 'hello.sh')) && textIn(ctx, script(ctx, 'hello.sh')) === lines(SHEBANG, HELLO_LINE),
    },
    {
      goal: 'Make `~/forge/hello.sh` runnable (`chmod +x`), then run it by its path',
      tip: 'A script needs `x` to run, and its path, because `~/forge` is not in `PATH`.',
      hints: [
        'Two steps, as at the gate: `chmod +x`, then the path alone.',
        'Join them with `&&`, so it runs only if `chmod` worked.',
        'chmod +x ~/forge/hello.sh && ~/forge/hello.sh',
      ],
      done: ctx => ranScript(ctx, script(ctx, 'hello.sh'), record => record.stdout === 'Hello from the forge\n'),
      near: ctx => firstNote([
        [() => deniedScript(ctx, script(ctx, 'hello.sh')), 'Permission denied: it has no x yet. chmod +x ~/forge/hello.sh first.'],
        [() => ctx.tried('hello.sh'), 'Without a path, bash looks only in PATH. Type its path: ~/forge/hello.sh.'],
      ]),
    },
    {
      goal: 'Write `~/forge/greet.sh`: first `#!/bin/bash`, then the line `echo Hello, $1` (in single quotes, so the file keeps `$1`)',
      tip: '`$1` in a script is the first word typed after the script\'s name.',
      hints: [
        'Two `echo` lines, as for `hello.sh`: `>` for the first, `>>` for the second.',
        `First \`echo '${SHEBANG}' > ~/forge/greet.sh\`, then the \`$1\` line with \`>>\`.`,
        `echo '${GREET_LINE}' >> ~/forge/greet.sh`,
      ],
      done: ctx => textIn(ctx, script(ctx, 'greet.sh')) === lines(SHEBANG, GREET_LINE),
      near: ctx => writingNote(ctx, script(ctx, 'greet.sh'), [SHEBANG, GREET_LINE]),
    },
    {
      goal: 'Make `greet.sh` runnable, and run it with the word `Tux` after it, so it prints `Hello, Tux`',
      tip: 'The words after a script\'s name become `$1`, `$2` and so on, inside it.',
      hints: [
        'As for `hello.sh`, with one word after the path.',
        '`chmod +x`, then `~/forge/greet.sh Tux`.',
        'chmod +x ~/forge/greet.sh && ~/forge/greet.sh Tux',
      ],
      done: ctx => ranScript(ctx, script(ctx, 'greet.sh'), record => record.args.length > 0 && record.stdout === `Hello, ${record.args[0]}\n`),
      near: ctx => firstNote([
        [() => deniedScript(ctx, script(ctx, 'greet.sh')), 'Permission denied: it has no x yet. chmod +x ~/forge/greet.sh first.'],
        [() => ranScript(ctx, script(ctx, 'greet.sh'), record => record.args.length === 0), '$1 was empty, because no word came after the name. Add Tux: ~/forge/greet.sh Tux.'],
      ]),
    },
    {
      goal: 'Go into `~/forge/ore`, and smelt every ore there with a loop (`for ore in *.ore; do echo Smelting $ore; done`)',
      tip: 'A `for` loop runs the commands between `do` and `done` once for every item, with the item in the variable.',
      hints: [
        'First `cd ~/forge/ore`, so `*.ore` finds the ores.',
        '`for ore in *.ore;` then `do echo Smelting $ore;` then `done`, all on one line.',
        LOOP,
      ],
      done: ctx => ctx.line.includes('for ') && ctx.commands.filter(r => r.name === 'echo').map(r => r.stdout).join('') === smelted(ORES),
      near: ctx => firstNote([
        [() => ctx.line.includes('for ') && ctx.ran('echo', r => r.stdout === 'Smelting *.ore\n'), 'No ore here, so *.ore stayed as it is. cd ~/forge/ore first.'],
        [() => ctx.line.includes('for ') && ctx.ran('echo', r => r.stdout === 'Smelting\n'), 'The name after $ must be the loop\'s variable: for ore in ... uses $ore.'],
      ]),
    },
    {
      goal: 'Put the loop into a script, `~/forge/loop.sh` (the `#!/bin/bash` line, then the loop), make it runnable, and run it while you are in `~/forge/ore`',
      tip: 'A script starts in the directory you are in, so its `*.ore` matches the ores where you stand.',
      hints: [
        'Write it as you wrote `hello.sh`: two `echo` lines in single quotes, `>` then `>>`.',
        'Then `chmod +x ~/forge/loop.sh`, and from `~/forge/ore`, run `~/forge/loop.sh`.',
        '~/forge/loop.sh',
      ],
      done: ctx => ranScript(ctx, script(ctx, 'loop.sh'), record => record.cwd === oreOf(ctx) && record.stdout === smelted(ORES)),
      near: ctx => firstNote([
        [() => deniedScript(ctx, script(ctx, 'loop.sh')), 'Permission denied: it has no x yet. chmod +x ~/forge/loop.sh first.'],
        [() => ranScript(ctx, script(ctx, 'loop.sh'), record => record.cwd !== oreOf(ctx)), 'The script started where you are, and there is no ore here. cd ~/forge/ore, then run it again.'],
        [() => writingNote(ctx, script(ctx, 'loop.sh'), [SHEBANG, LOOP]) !== null, writingNote(ctx, script(ctx, 'loop.sh'), [SHEBANG, LOOP])],
      ]),
    },
  ],
  solve: [
    `echo '${SHEBANG}' > ~/forge/hello.sh`,
    `echo '${HELLO_LINE}' >> ~/forge/hello.sh`,
    'cat ~/forge/hello.sh',
    'chmod +x ~/forge/hello.sh && ~/forge/hello.sh',
    `echo '${SHEBANG}' > ~/forge/greet.sh`,
    `echo '${GREET_LINE}' >> ~/forge/greet.sh`,
    'chmod +x ~/forge/greet.sh && ~/forge/greet.sh Tux',
    'cd ~/forge/ore',
    LOOP,
    `echo '${SHEBANG}' > ~/forge/loop.sh`,
    `echo '${LOOP}' >> ~/forge/loop.sh`,
    'chmod +x ~/forge/loop.sh',
    '~/forge/loop.sh',
  ],
  boss: {
    title: 'The Smelting Spell',
    briefing: `<p>New ore has arrived in <code>~/forge/ore</code>. Forge the last spell: a script <code>~/forge/smelt.sh</code> that prints <code>Smelting</code> and the name of every ore there, one line each. It must work from anywhere, so run it from your home directory.</p>`,
    setup: setupBoss,
    hints: [
      'A script starts in the directory you are in, so from home `*.ore` finds nothing. The script must go to the ore itself.',
      'Three lines: `#!/bin/bash`, then `cd ~/forge/ore`, then the loop. Write them with `echo` in single quotes, then `chmod +x` and run it.',
      BOSS_LINE,
    ],
    done: bossDone,
    near: bossNear,
    solve: () => [
      `echo '${SHEBANG}' > ~/forge/smelt.sh`,
      'echo \'cd ~/forge/ore\' >> ~/forge/smelt.sh',
      `echo '${LOOP}' >> ~/forge/smelt.sh`,
      'chmod +x ~/forge/smelt.sh',
      '~/forge/smelt.sh',
    ],
  },
  recap: [
    [`echo '${SHEBANG}' > ~/forge/hello.sh`, 'start a script: the first line names bash'],
    [`echo '${HELLO_LINE}' >> ~/forge/hello.sh`, 'add a line; single quotes keep it as typed'],
    ['chmod +x ~/forge/hello.sh', 'make it runnable'],
    ['~/forge/greet.sh Tux', 'run it by its path; `Tux` becomes `$1`'],
    [LOOP, 'run the same command for every ore'],
  ],
  why: `<p>Why <code>#!</code>? When a file with <code>x</code> is run, Linux reads its first two bytes. <code>#!</code> means "give this file to the program named on this line". For bash, <code>#</code> starts a comment, so it skips that line.</p>
<p>Why does a script need its path? Bash looks for bare names only in the directories of <code>PATH</code>, as you saw in the descent. Put your scripts in a directory on <code>PATH</code>, and you can run them by name, like any other command.</p>
<p>Why doesn't the script's <code>cd</code> move you? It runs in a child shell, a copy of bash with its own current directory. When the script ends, its shell ends, and you are where you were.</p>
<p>You can now find your way, read and change files, search, pipe, set permissions, handle processes and write scripts. That is the ground floor of Linux. Ring Zero starts where this ends: deeper into the system, with fewer hints.</p>`,
  field: [
    ['nano ~/forge/smelt.sh', 'edit a script in a text editor, instead of line by line'],
    ['alias forge=\'cd ~/forge\'', 'a short name for a command you type often'],
    ['~/.bashrc', 'a script bash runs each time it starts: a home for your aliases'],
    ['if [ -f ~/forge/smelt.sh ]; then echo ready; fi', 'run commands only when a test is true'],
    ['bash -x ~/forge/smelt.sh', 'run a script and show each line before it runs'],
  ],
  spells: [
    { name: '#!/bin/bash', summary: 'The first line of a bash script.', examples: [[`echo '${SHEBANG}' > ~/forge/hello.sh`, 'start a new script']] },
    { name: '$1', summary: 'Inside a script: the first word after its name.', examples: [['~/forge/greet.sh Tux', '`$1` is `Tux`']] },
    { name: 'for', summary: 'Run commands once for each item of a list.', examples: [[LOOP, 'every `.ore` name, one at a time']] },
  ],
};
