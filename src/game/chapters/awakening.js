/**
 * Chapter 1, The Awakening: the prompt, whoami, pwd, ls, cat, clear, man and
 * --help. The boss room hides one true letter from the Guardian among
 * forgeries; its content says which manual to open.
 */
import { put, remove, cd, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { shuffle } from '../rng.js';
import { nodeAt } from '../checks.js';

/**
 * The letters the boss room puts in the player's home. Later chapters remove
 * them when they start.
 *
 * @type {string[]}
 */
export const LETTERS = ['letter1.txt', 'letter2.txt', 'letter3.txt', 'letter4.txt'];

const GUARDIAN = 'The Guardian of Root';
const FORGERS = ['The Guardian of Boot', 'The Guardian of Loot', 'The Guardian of Soot', 'The Guardian of Rot'];

const RIDDLES = {
  whoami: 'prints your user name',
  pwd: 'prints the full path of the directory you are in',
  ls: 'lists what is in a directory',
  cat: 'prints a file on the screen',
  clear: 'wipes the screen',
};

// GNU coreutils answer --help with status 0; bash builtins print help but exit 2, and clear rejects it.
const HAS_HELP = ['whoami', 'ls', 'cat'];

const flatten = text => text.replace(/\s+/g, ' ');

function deedText({ command, how }) {
  return how === 'man'
    ? `open the manual page of the spell that ${RIDDLES[command]}.`
    : `ask the spell that ${RIDDLES[command]} for its quick help.`;
}

function letterText(deed, signature) {
  return `Dear apprentice,

You are awake at last. Now prove that you can study a spell:
${deedText(deed)}

    -- ${signature}
`;
}

function signature(text) {
  const last = text.trimEnd().split('\n').at(-1).trim();
  return last.startsWith('-- ') ? last.slice(3) : '';
}

function deedIn(text) {
  const flat = flatten(text);
  const command = Object.keys(RIDDLES).find(name => flat.includes(`the spell that ${RIDDLES[name]}`));
  return { command, how: flat.includes('manual page') ? 'man' : 'help' };
}

const listsHome = (ctx, record) => ctx.hasPath(record, ctx.home)
  || (record.cwd === ctx.home && record.args.every(arg => arg.startsWith('-')));

function setupBoss(random, { home, user }) {
  const deeds = shuffle(random, Object.keys(RIDDLES)).slice(0, LETTERS.length).map(command => ({
    command,
    how: HAS_HELP.includes(command) && random() < 0.5 ? 'help' : 'man',
  }));
  const real = Math.floor(random() * LETTERS.length);
  const forgers = shuffle(random, FORGERS);
  const patch = LETTERS.map((name, i) => put(`${home}/${name}`,
    file(letterText(deeds[i], i === real ? GUARDIAN : forgers[i]), { owner: user })));
  return { patch, secret: deeds[real] };
}

function solveBoss(obs) {
  const home = nodeAt(obs.tree, obs.home);
  const letter = LETTERS.map(name => home.children[name]).find(node => signature(node.content) === GUARDIAN);
  const { command, how } = deedIn(letter.content);
  return [how === 'man' ? `man ${command}` : `${command} --help`];
}

export default {
  id: 'awakening',
  act: 1,
  title: 'The Awakening',
  setup: (_random, player) => [
    ...restore('readme.txt', player),
    ...LETTERS.map(name => remove(`${player.home}/${name}`)),
    cd(player.home),
  ],
  lesson: `<p>You wake up inside a terminal. The line waiting for you is the <b>prompt</b>:</p>
<pre class="anat"><span class="pu">hero@kernelia</span>:<span class="pp">~</span>$</pre>
<p><b>hero</b> is your user name and <b>kernelia</b> is the machine. After the colon comes the directory you are in: <b>~</b> is short for your home, <code>/home/hero</code>. The <b>$</b> means you are a normal user. Root, the administrator, gets a <b>#</b> instead.</p>
<p>Type a command after the prompt and press <kbd>Enter</kbd>. Commands are case-sensitive: <code>ls</code> works, <code>LS</code> does not.</p>
<ul>
<li><code>whoami</code> prints your user name.</li>
<li><code>pwd</code> prints the full path of the directory you are in. The name means <b>p</b>rint <b>w</b>orking <b>d</b>irectory.</li>
<li><code>ls</code> lists what is in the directory you are in.</li>
<li><code>cat readme.txt</code> prints the file <code>readme.txt</code> on the screen.</li>
<li><code>clear</code> wipes the screen. <kbd>Ctrl</kbd>+<kbd>L</kbd> clears it too.</li>
<li><code>man ls</code> opens the manual page of <code>ls</code>. On a real machine it opens in a viewer: the arrow keys scroll and <kbd>q</kbd> quits.</li>
<li>Many commands also print a short summary when you add <code>--help</code>, with two dashes: <code>ls --help</code>.</li>
</ul>
<p>A word after a command is an <b>argument</b>: it tells the command what to work on. <code>ls forest</code> lists the forest without walking into it, and <code>man ls</code> asks for the manual of <code>ls</code>.</p>`,
  tasks: [
    {
      goal: 'Ask the terminal who you are',
      hints: [
        'Your name is in the prompt, but a command can tell you too.',
        'The command is `whoami`: who am i, written as one word.',
        'whoami',
      ],
      done: ctx => ctx.ran('whoami'),
    },
    {
      goal: 'Find out where you are standing',
      hints: [
        'The prompt shows `~`, a short name. Ask for the full path.',
        '`pwd` means print working directory.',
        'pwd',
      ],
      done: ctx => ctx.ran('pwd'),
    },
    {
      goal: 'Look around your home',
      hints: [
        'What is in this room? Ask for a list.',
        '`ls` lists the directory you are in.',
        'ls',
      ],
      done: ctx => ctx.ran('ls', record => listsHome(ctx, record)),
    },
    {
      goal: 'Read the letter left for you',
      hints: [
        'There is a `.txt` file in your home. Print it on the screen.',
        '`cat` followed by a file name prints that file.',
        'cat readme.txt',
      ],
      done: ctx => ctx.read(`${ctx.home}/readme.txt`),
    },
    {
      goal: 'Open the manual page of a command',
      hints: [
        'Most commands come with a manual. One command opens it.',
        '`man` followed by a command name opens its manual page.',
        'man ls',
      ],
      done: ctx => ctx.ran('man'),
    },
    {
      goal: 'Ask a command for its quick help',
      hints: [
        'Many commands explain themselves if you ask with an option.',
        'Add `--help` after the command name: two dashes, then help.',
        'ls --help',
      ],
      // bash's echo prints --help back instead of answering it.
      done: ctx => ctx.commands.some(record => record.name !== 'echo' && record.args.includes('--help') && record.stdout !== ''),
    },
    {
      goal: 'Wipe the screen clean',
      hints: [
        'The screen is getting full. Start again with an empty one.',
        'The command is the plain English word `clear`.',
        'clear',
      ],
      done: ctx => ctx.ran('clear'),
    },
  ],
  solve: ['whoami', 'pwd', 'ls', 'cat readme.txt', 'man ls', 'ls --help', 'clear'],
  boss: {
    title: 'The Forged Letters',
    briefing: `<p>While you were reading, four letters slid under your door: <code>letter1.txt</code> to <code>letter4.txt</code>. Only one is truly from the Guardian of Root. The other three are forgeries by the Shadow Daemon, who wants to lead you astray.</p>
<p>The Guardian signs exactly as in <code>readme.txt</code>. Find the real letter and do what it asks.</p>`,
    setup: setupBoss,
    hints: [
      'Read every letter, then compare each signature with the one at the end of `readme.txt`.',
      '`ls` shows the letters and `cat` prints them. The real letter asks for a manual page (`man COMMAND`) or for a quick help (`COMMAND --help`).',
      secret => (secret.how === 'man' ? `man ${secret.command}` : `${secret.command} --help`),
    ],
    done: (ctx, secret) => (secret.how === 'man'
      ? ctx.ran('man', record => record.args.includes(secret.command))
      : ctx.ran(secret.command, record => record.args.includes('--help'))),
    solve: solveBoss,
  },
  recap: [
    ['whoami', 'print your user name'],
    ['pwd', 'print the full path of the directory you are in'],
    ['ls', 'list the directory you are in'],
    ['ls forest', 'list another directory'],
    ['cat readme.txt', 'print a file'],
    ['clear', 'wipe the screen (Ctrl+L too)'],
    ['man ls', 'read the manual page of a command'],
    ['ls --help', 'a short summary of a command'],
  ],
  why: `<p>Why does the prompt show your name, the machine and the directory? People often have several terminals open, some on other machines over SSH. The prompt tells you at a glance who you are, where you are, and on which machine your next command will run.</p>
<p>Why type commands instead of clicking? A command is exact and repeatable: you can save it, share it, run it again tomorrow, or run it on a machine with no screen at all. Many servers are run that way.</p>
<p>Why <code>man</code>? The manual lives on the machine itself, so the answer to "what does this option do?" is one command away, even offline. Some minimal systems, like many Docker images, leave the manual pages out to save space.</p>`,
  field: [
    ['hostname', 'print the name of the machine, the part of the prompt after the `@`'],
    ['man -k directory', 'search the short descriptions of the manual pages for a word'],
    ['man man', 'the manual of the manual'],
  ],
  spells: [
    { name: 'whoami', summary: 'Print your user name.', examples: [['whoami', 'prints: `hero`']] },
    { name: 'pwd', summary: 'Print working directory: the full path of where you are.', examples: [['pwd', 'prints: `/home/hero`']] },
    { name: 'ls', summary: 'List what is in a directory.', examples: [['ls', 'the directory you are in'], ['ls forest', 'another directory']] },
    { name: 'cat', summary: 'Print files on the screen (short for concatenate).', examples: [['cat readme.txt', 'print one file'], ['cat -n readme.txt', 'with line numbers']] },
    { name: 'clear', summary: 'Clear the terminal screen. Ctrl+L clears it too.', examples: [['clear', 'start with an empty screen']] },
    { name: 'man', summary: 'Read the manual page of a command.', examples: [['man ls', 'the full manual of ls'], ['ls --help', 'a short summary, printed at once']] },
  ],
};
