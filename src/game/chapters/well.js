/**
 * Chapter 12, The Well of Echoes: variables, double and single quotes, the
 * exit status $?, the error stream 2>, /dev/null, and the operators && and
 * ||. The boss room names three stones on the well's wall, one of them
 * missing: the player reads them with one cat, saves the words in a file and
 * sends the error to /dev/null.
 */
import { put, remove, cd, dir, file } from '../../backend/spec.js';
import { shuffle, pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const SIGN = `THE WELL OF ECHOES
Shout into the well, and it answers.
Good answers come back up. Errors fall to the bottom.
`;

const STONES = ['amber', 'dawn', 'ember', 'flint', 'frost', 'moss', 'pearl', 'storm'];
const WORDS = ['rise', 'light', 'water', 'stone', 'river', 'quiet', 'spark', 'deep'];
const NULL = '/dev/null';

const wellOf = ctx => `${ctx.home}/well`;
const bucketOf = ctx => `${wellOf(ctx)}/bucket.txt`;
const errorsOf = ctx => `${wellOf(ctx)}/errors.txt`;
const listOf = ctx => `${wellOf(ctx)}/list.txt`;
const deepOf = ctx => `${wellOf(ctx)}/deep`;
const dryOf = ctx => `${wellOf(ctx)}/dry`;

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;
const textIn = (ctx, path) => (ctx.node(path)?.type === 'file' ? ctx.node(path).content : null);
const typed = (ctx, pattern) => pattern.test(ctx.line.trim());
const uses = (ctx, name) => new RegExp(`\\$(${name}\\b|\\{${name}\\})`).test(ctx.line);

const out = (record, ops = ['>', '>>']) => record.redirects.find(r => ops.includes(r.op.replace(/^1/, '')));
const err = record => record.redirects.find(r => r.op === '2>' || r.op === '2>>');
const errTo = (record, path) => err(record)?.target === path;
const echoed = (ctx, text) => ctx.ran('echo', record => record.stdout === `${text}\n`);
const listsBucket = (ctx, pred) => ctx.tried('ls', record => ctx.hasPath(record, bucketOf(ctx)) && record.status !== 0 && pred(record));
const statusPrinted = ctx => (ctx.line.includes('$?') ? ctx.commands.find(r => r.name === 'echo' && /^\d+\n$/.test(r.stdout)) ?? null : null);

const MISTYPED_ASSIGNMENT = [
  [ctx => typed(ctx, /^\$\{?wish\}?\s*=/), 'No $ when you make a variable: $wish asks for its value. Type wish=gold.'],
  [ctx => typed(ctx, /^wish\s+=|^wish=\s/), 'No spaces around =: with spaces, bash runs a command named wish. Type wish=gold.'],
];
const mistypedAssignment = ctx => MISTYPED_ASSIGNMENT.find(([when]) => when(ctx))?.[1] ?? null;

function wellArea(user, extra = {}) {
  return dir({ 'sign.txt': file(SIGN, { owner: user }), ...extra }, { owner: user });
}

function setupBoss(random, { home, user }) {
  const names = shuffle(random, STONES).slice(0, 3);
  const words = shuffle(random, WORDS).slice(0, 3);
  const missing = pick(random, names);
  const stones = Object.fromEntries(names.filter(name => name !== missing)
    .map(name => [`${name}.txt`, file(`${words[names.indexOf(name)]}\n`, { owner: user })]));
  const wall = `Three stones were set in the wall of the well:\n${names.map(name => `~/well/stones/${name}.txt`).join('\n')}\nOne of them has fallen into the water.\n`;
  const well = `${home}/well`;
  const patch = [
    remove(well),
    put(well, wellArea(user, { 'wall.txt': file(wall, { owner: user }), stones: dir(stones, { owner: user }) })),
    cd(home),
  ];
  const paths = names.map(name => `${well}/stones/${name}.txt`);
  return { patch, secret: { wall: `${well}/wall.txt`, paths, missing: `${well}/stones/${missing}.txt`, words: `${well}/words.txt` } };
}

// The words of the stones that are there, each once, in any order.
function rightWords(ctx, { paths, missing }) {
  const text = textIn(ctx, `${ctx.home}/well/words.txt`);
  if (text === null) return false;
  const want = paths.filter(path => path !== missing).map(path => textIn(ctx, path)).sort();
  return JSON.stringify(text.split(/(?<=\n)/).sort()) === JSON.stringify(want);
}

const readsAll = (ctx, { paths }) => ctx.commands.find(record => record.name === 'cat' && paths.every(path => ctx.hasPath(record, path))) ?? null;

function bossDone(ctx, secret) {
  const record = readsAll(ctx, secret);
  return record !== null && out(record)?.target === secret.words && errTo(record, NULL) && rightWords(ctx, secret);
}

function bossNear(ctx, secret) {
  const record = readsAll(ctx, secret);
  const tried = ctx.commands.find(r => r.name === 'cat' && r.redirects.length > 0) ?? null;
  return bossDone(ctx, secret) ? null : firstNote([
    [() => record && errTo(record, secret.words), '2> sent the error into words.txt. The words go with >, the error with 2> /dev/null.'],
    [() => record && out(record)?.target === secret.words && !err(record), 'words.txt is right, but the error came to the screen. Add 2> /dev/null to the same line.'],
    [() => record && errTo(record, NULL) && !out(record), 'The error is gone, but the words came to the screen. Add > ~/well/words.txt to the same line.'],
    [() => record && !out(record) && !err(record), 'One cat reads all three. Now add > ~/well/words.txt for the words and 2> /dev/null for the error.'],
    [() => tried !== null && record === null, 'Give cat all three stones that wall.txt names, in one line, even the missing one.'],
  ]);
}

function solveBoss(obs) {
  const wall = nodeAt(obs.tree, `${obs.home}/well/wall.txt`).content;
  const stones = wall.split('\n').filter(line => line.startsWith('~/well/stones/'));
  return ['cat ~/well/wall.txt', `cat ${stones.join(' ')} > ~/well/words.txt 2> /dev/null`];
}

export default {
  id: 'well',
  act: 2,
  title: 'Well of Echoes',
  setup: (_random, { home, user }) => [
    remove(`${home}/well`),
    put(`${home}/well`, wellArea(user)),
    cd(home),
  ],
  lesson: `<p>The shell remembers things in <b>variables</b>: a name that holds a value. You met one in chapter 10, <code>PATH</code>. You can make your own:</p>
<ul>
<li><code>wish=gold</code> makes a variable named <code>wish</code> that holds <code>gold</code>. No spaces around the <code>=</code>: with spaces, bash would run a command named <code>wish</code>.</li>
<li><code>$wish</code> stands for its value, so <code>echo $wish</code> prints <code>gold</code>. A variable that was never made stands for nothing at all.</li>
<li>Inside <b>double quotes</b>, <code>$</code> still works: <code>echo "I wish for $wish"</code> prints <code>I wish for gold</code>.</li>
<li>Inside <b>single quotes</b>, nothing is special: <code>echo 'I wish for $wish'</code> prints <code>I wish for $wish</code>, exactly as typed.</li>
</ul>
<p>Every command ends with an <b>exit status</b>, a number: <code>0</code> means it worked, any other number means it failed. Bash keeps the status of the last command in <code>$?</code>. Print it with <code>echo $?</code> right after the command you want to check, because the next command, even that <code>echo</code>, sets a new one.</p>
<p>A command has two ways to print: its normal output, <b>stream 1</b>, and its error messages, <b>stream 2</b>. Both appear on your screen, but they are separate:</p>
<ul>
<li><code>></code> sends only stream 1 into a file. Errors still come to the screen.</li>
<li><code>2></code> sends stream 2, the errors, into a file: <code>ls bucket.txt 2> errors.txt</code>.</li>
<li><code>/dev/null</code> is a special file that throws away everything written into it. <code>2> /dev/null</code> makes the errors disappear.</li>
<li>One command can have both: <code>ls A B > list.txt 2> /dev/null</code> saves what it finds and throws the errors away.</li>
</ul>
<p>Two commands can be joined by what happened to the first:</p>
<ul>
<li><code>A && B</code> runs <code>B</code> only if <code>A</code> worked (exit status 0).</li>
<li><code>A || B</code> runs <code>B</code> only if <code>A</code> failed.</li>
</ul>`,
  tasks: [
    {
      goal: 'Make a variable `wish` that holds `gold` (`wish=gold`, with no spaces around `=`), then print its value (`echo $wish`)',
      tip: 'A name, `=`, and a value, with no spaces, makes a variable; `$wish` stands for its value.',
      hints: [
        'Two lines: one makes the variable, the next prints it.',
        'First `wish=gold`, then `echo` with a `$` in front of the name.',
        'echo $wish',
      ],
      done: ctx => uses(ctx, 'wish') && echoed(ctx, 'gold'),
      near: ctx => mistypedAssignment(ctx) ?? firstNote([
        [() => uses(ctx, 'wish') && echoed(ctx, ''), 'wish is empty, because it was never made. First type wish=gold, then echo $wish.'],
        [() => echoed(ctx, 'wish'), 'Without the $, echo prints the word wish. Put $ in front: echo $wish.'],
        [() => echoed(ctx, 'gold') && !uses(ctx, 'wish'), 'That printed the word you typed. Print the variable instead: echo $wish.'],
      ]),
    },
    {
      goal: 'Print `I wish for` and the value of `wish`, inside double quotes (`echo "I wish for $wish"`)',
      tip: 'Inside double quotes, `$wish` still turns into its value.',
      hints: [
        'The whole sentence goes inside one pair of double quotes, with `$wish` at the end.',
        '`echo`, then the sentence in `"` quotes.',
        'echo "I wish for $wish"',
      ],
      done: ctx => uses(ctx, 'wish') && ctx.line.includes('"') && echoed(ctx, 'I wish for gold'),
      near: ctx => mistypedAssignment(ctx) ?? firstNote([
        [() => echoed(ctx, 'I wish for '), 'wish is empty. Make it again with wish=gold, then try this line.'],
        [() => echoed(ctx, 'I wish for $wish'), 'Single quotes keep $wish as it is. Use double quotes " " here.'],
        [() => echoed(ctx, 'I wish for gold') && !uses(ctx, 'wish'), 'That typed gold yourself. Let the variable fill it in: $wish.'],
      ]),
    },
    {
      goal: 'Print the same sentence inside single quotes, and see that `$wish` stays as it is',
      tip: 'Inside single quotes, nothing is special, so a `$` stays a `$`.',
      hints: [
        'Use the line from the last task, with other quotes.',
        'Replace each `"` with `\'`.',
        'echo \'I wish for $wish\'',
      ],
      done: ctx => echoed(ctx, 'I wish for $wish'),
      near: ctx => (echoed(ctx, 'I wish for gold') ? 'Double quotes let $wish turn into its value. Use single quotes \' \' to keep it as it is.' : null),
    },
    {
      goal: 'List `~/well/bucket.txt`, which is not there, and right after it print the exit status (`echo $?`)',
      tip: 'Any status but `0` means the last command failed.',
      hints: [
        'Two lines: the `ls` that fails, then `echo $?` straight after it.',
        'First `ls ~/well/bucket.txt`, then `echo $?`, with nothing in between.',
        'echo $?',
      ],
      done: ctx => statusPrinted(ctx)?.stdout !== undefined && statusPrinted(ctx).stdout !== '0\n',
      near: ctx => firstNote([
        [() => statusPrinted(ctx)?.stdout === '0\n', '0 means the command just before echo worked. Type ls ~/well/bucket.txt first, then echo $? on the very next line.'],
        [() => ctx.ran('echo', record => record.stdout === '?\n' || record.stdout === '$?\n'), 'Write it as $? with nothing between: echo $?.'],
      ]),
    },
    {
      goal: 'List `~/well/bucket.txt` again, and send the error into `~/well/errors.txt` (`2>`: stream 2 is for errors)',
      tip: '`2>` sends error messages into a file, while `>` sends only the normal output.',
      hints: [
        'The error message is printed on stream 2.',
        'Put `2>` and the path of the file after the `ls` command.',
        'ls ~/well/bucket.txt 2> ~/well/errors.txt',
      ],
      done: ctx => listsBucket(ctx, record => errTo(record, errorsOf(ctx))) && (textIn(ctx, errorsOf(ctx)) ?? '').includes('No such file'),
      near: ctx => firstNote([
        [() => listsBucket(ctx, record => out(record)?.target === errorsOf(ctx)), '> catches only the normal output, so the error still came to the screen. Use 2>.'],
        [() => listsBucket(ctx, record => err(record) && !errTo(record, errorsOf(ctx))), 'That sent the error somewhere else. Send it into ~/well/errors.txt.'],
        [() => listsBucket(ctx, record => !err(record)), 'The error came to the screen. Add 2> ~/well/errors.txt to the line.'],
      ]),
    },
    {
      goal: 'List `~/well/bucket.txt` once more, and throw the error away into `/dev/null`',
      tip: '`/dev/null` takes whatever is written into it, and keeps nothing.',
      hints: [
        'The same as the last task, with another place for the error.',
        '`2>` and `/dev/null` after the command.',
        'ls ~/well/bucket.txt 2> /dev/null',
      ],
      done: ctx => listsBucket(ctx, record => errTo(record, NULL)),
      near: ctx => firstNote([
        [() => listsBucket(ctx, record => out(record)?.target === NULL), '> /dev/null throws away only the normal output. The error needs 2>.'],
        [() => listsBucket(ctx, record => !err(record)), 'The error came to the screen. Add 2> /dev/null to the line.'],
      ]),
    },
    {
      goal: 'List both `~/well` and `~/well/bucket.txt` with one `ls`: save what it finds into `~/well/list.txt`, and throw the error into `/dev/null`',
      tip: 'One command can have both: `>` for the output, `2>` for the errors.',
      hints: [
        'Give `ls` both paths. Then add two redirections to the same line.',
        '`> ~/well/list.txt` for what it finds, `2> /dev/null` for the error.',
        'ls ~/well ~/well/bucket.txt > ~/well/list.txt 2> /dev/null',
      ],
      done: ctx => ctx.tried('ls', record => ctx.hasPath(record, wellOf(ctx)) && ctx.hasPath(record, bucketOf(ctx))
        && out(record)?.target === listOf(ctx) && errTo(record, NULL)) && (textIn(ctx, listOf(ctx)) ?? '').includes('sign.txt'),
      near: ctx => {
        const both = record => ctx.hasPath(record, wellOf(ctx)) && ctx.hasPath(record, bucketOf(ctx));
        return firstNote([
          [() => ctx.tried('ls', record => both(record) && !err(record) && out(record)?.target === listOf(ctx)), 'list.txt is saved, but the error came to the screen. Add 2> /dev/null too.'],
          [() => ctx.tried('ls', record => both(record) && errTo(record, NULL) && !out(record)), 'The error is gone, but the list came to the screen. Add > ~/well/list.txt too.'],
          [() => ctx.tried('ls', record => !both(record) && (out(record) || err(record))), 'Give ls both paths: ~/well and ~/well/bucket.txt.'],
        ]);
      },
    },
    {
      goal: 'Make the directory `~/well/deep`, and only if that works, go into it, in one line (`&&`)',
      tip: '`A && B` runs `B` only if `A` worked.',
      hints: [
        'Two commands on one line, joined by `&&`.',
        '`mkdir` the directory, then `&&`, then `cd` into it.',
        'mkdir ~/well/deep && cd ~/well/deep',
      ],
      done: ctx => ctx.line.includes('&&') && ctx.ran('mkdir', record => ctx.hasPath(record, deepOf(ctx))) && ctx.cwd === deepOf(ctx),
      near: ctx => firstNote([
        [() => ctx.line.includes('&&') && ctx.tried('mkdir', record => record.status !== 0 && ctx.hasPath(record, deepOf(ctx))), 'mkdir failed because ~/well/deep is already there, so && skipped the cd. Remove it with rmdir ~/well/deep, then try again.'],
        [() => !ctx.line.includes('&&') && ctx.ran('mkdir', record => ctx.hasPath(record, deepOf(ctx))), 'Do both in one line, joined by &&. Remove it first with rmdir ~/well/deep.'],
      ]),
    },
    {
      goal: 'Try to go into `~/well/dry`, which is not there, and if that fails, print `the well is dry`, in one line (`||`)',
      tip: '`A || B` runs `B` only if `A` failed.',
      hints: [
        'Two commands on one line, joined by `||`.',
        '`cd` into `~/well/dry`, then `||`, then `echo` the words.',
        'cd ~/well/dry || echo the well is dry',
      ],
      done: ctx => ctx.line.includes('||') && ctx.tried('cd', record => record.status !== 0 && ctx.hasPath(record, dryOf(ctx))) && echoed(ctx, 'the well is dry'),
      near: ctx => firstNote([
        [() => ctx.line.includes('&&') && ctx.tried('cd', record => record.status !== 0 && ctx.hasPath(record, dryOf(ctx))), '&& runs the next command only if cd worked. Use || to run it when cd fails.'],
        [() => ctx.ran('cd', record => ctx.hasPath(record, dryOf(ctx))), 'cd worked, because ~/well/dry is there now, so || skipped the echo. Remove it with rmdir ~/well/dry.'],
      ]),
    },
  ],
  solve: [
    'wish=gold',
    'echo $wish',
    'echo "I wish for $wish"',
    'echo \'I wish for $wish\'',
    'ls ~/well/bucket.txt',
    'echo $?',
    'ls ~/well/bucket.txt 2> ~/well/errors.txt',
    'ls ~/well/bucket.txt 2> /dev/null',
    'ls ~/well ~/well/bucket.txt > ~/well/list.txt 2> /dev/null',
    'mkdir ~/well/deep && cd ~/well/deep',
    'cd ~/well/dry || echo the well is dry',
  ],
  boss: {
    title: 'The Fallen Stone',
    briefing: `<p>The wall of the well, <code>~/well/wall.txt</code>, names three stones in <code>~/well/stones</code>, but one of them has fallen into the water and is gone. In one line, read all three with one <code>cat</code>, save what they say into <code>~/well/words.txt</code>, and throw the error about the missing stone into <code>/dev/null</code>.</p>`,
    setup: setupBoss,
    hints: [
      'Read `~/well/wall.txt` first: it lists the three paths.',
      '`cat` the three paths, then `> ~/well/words.txt` for the words and `2> /dev/null` for the error, all in one line.',
      ({ paths }) => `cat ${paths.map(path => path.replace(/^\/home\/[^/]+/, '~')).join(' ')} > ~/well/words.txt 2> /dev/null`,
    ],
    done: bossDone,
    near: bossNear,
    hidden: ({ wall, paths, missing }) => [wall, ...paths.filter(path => path !== missing)],
    solve: solveBoss,
  },
  recap: [
    ['wish=gold', 'make a variable; no spaces around `=`'],
    ['echo "I wish for $wish"', 'double quotes: `$wish` turns into its value'],
    ['echo \'I wish for $wish\'', 'single quotes: everything stays as typed'],
    ['echo $?', 'the exit status of the last command: `0` means it worked'],
    ['ls bucket.txt 2> errors.txt', 'send the errors into a file'],
    ['ls bucket.txt 2> /dev/null', 'throw the errors away'],
    ['mkdir deep && cd deep', 'run the second only if the first worked'],
    ['cd dry || echo the well is dry', 'run the second only if the first failed'],
  ],
  why: `<p>Why two streams? So that errors do not get mixed into the results. When you save a list into a file with <code>></code>, an error message would spoil it, so errors take their own way, to your screen, where you can see them.</p>
<p>Why is the error stream number 2? Every program starts with three open streams, numbered from 0: 0 is the input, 1 the normal output, 2 the errors. <code>></code> is short for <code>1></code>.</p>
<p>Why does <code>0</code> mean success? There is one way for a command to work, and many ways to fail; the other numbers can say which. Scripts use <code>$?</code>, <code>&&</code> and <code>||</code> to decide what to do next, as you will do in the forge.</p>`,
  field: [
    ['2>&1', 'send the errors to wherever stream 1 goes, like `ls A B > all.txt 2>&1`'],
    ['echo ${wish}s', 'braces mark where the name ends: prints `golds`'],
    ['export wish', 'let programs started from this shell see the variable too'],
    ['unset wish', 'remove the variable'],
    ['env', 'list the variables programs get from this shell'],
  ],
  spells: [
    { name: 'NAME=value', summary: 'Make a variable; no spaces around `=`.', examples: [['wish=gold', 'wish now holds gold'], ['echo $wish', 'prints: `gold`']] },
    { name: 'quotes', summary: 'Double quotes let `$` work; single quotes keep everything as typed.', examples: [['echo "I wish for $wish"', 'prints: `I wish for gold`'], ['echo \'I wish for $wish\'', 'prints: `I wish for $wish`']] },
    { name: '$?', summary: 'The exit status of the last command.', examples: [['echo $?', '`0` worked, any other number failed']] },
    { name: '2>', summary: 'Send the error messages into a file.', examples: [['ls bucket.txt 2> errors.txt', 'errors into a file'], ['ls bucket.txt 2> /dev/null', 'errors thrown away']] },
    { name: '&&', summary: 'Run the next command only if this one worked.', examples: [['mkdir deep && cd deep', 'make it, then go in']] },
    { name: '||', summary: 'Run the next command only if this one failed.', examples: [['cd dry || echo the well is dry', 'a message when cd fails']] },
  ],
};
