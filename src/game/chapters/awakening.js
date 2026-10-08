/**
 * Chapter 1, The Awakening: the prompt, whoami, pwd, ls, cat, clear, man and
 * --help. The boss room leaves a note with a random name in the home: the
 * player finds it with ls and reads it with cat.
 */
import { put, remove, cd, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const listsHome = (ctx, record) => !ctx.flag(record, 'd') && (ctx.hasPath(record, ctx.home)
  || (record.cwd === ctx.home && record.args.every(arg => arg.startsWith('-'))));

function readNear(ctx) {
  const letter = `${ctx.home}/readme.txt`;
  let note = null;
  if (ctx.ran('ls', record => ctx.hasPath(record, letter))) note = 'ls only shows the name. cat prints what is inside: cat readme.txt';
  else if (ctx.ran('cat', record => ctx.paths(record).length > 0 && !ctx.hasPath(record, letter))) note = 'That was another file. The letter is readme.txt.';
  return note;
}

/**
 * The names the boss room can give its note. Each is note_ and three random
 * letters; the list is fixed so the chapters' setups can clear every one.
 *
 * @type {string[]}
 */
export const NOTES = ['note_k7m', 'note_w3r', 'note_f9d', 'note_x4t', 'note_h6p', 'note_c3v', 'note_y7e', 'note_j4n'];

const NOTE_TEXT = `Well done, apprentice!

You found this note with ls and read it with cat.
Those two spells will light your way in the forest.

    -- The Guardian of Root
`;

function setupBoss(random, { home, user }) {
  const note = `${home}/${pick(random, NOTES)}`;
  return { patch: [put(note, file(NOTE_TEXT, { owner: user })), cd(home)], secret: { note } };
}

function bossNear(ctx, { note }) {
  const cats = ctx.commands.filter(record => record.name === 'cat');
  if (cats.length === 0 || ctx.read(note)) return null;
  return cats.some(record => record.status !== 0)
    ? 'There is no file by that name. Run ls and copy the full name that starts with note_.'
    : 'That was another file. The new note\'s name starts with note_: ls shows it.';
}

// The map shows the note only once ls has found it, so the player has to look.
const hiddenNote = ({ note }) => [note];

function solveBoss(obs) {
  const name = Object.keys(nodeAt(obs.tree, obs.home).children).find(child => child.startsWith('note_'));
  return ['ls', `cat ${name}`];
}

export default {
  id: 'awakening',
  act: 1,
  title: 'The Awakening',
  setup: (_random, player) => [
    ...restore('readme.txt', player),
    ...NOTES.map(name => remove(`${player.home}/${name}`)),
    cd(player.home),
  ],
  lesson: `<p>You met the <b>prompt</b> in the intro, and the <b>Replay intro</b> button shows it again: <code>hero@kernelia:~$</code> names you, the machine and the directory you are in, where <code>~</code> is short for your home, <code>/home/hero</code>. The <code>$</code> means you are a normal user; root, the administrator, gets <code>#</code>. Type a command after the prompt and press <kbd>Enter</kbd>. Commands are case-sensitive: <code>ls</code> works, <code>LS</code> does not.</p>
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
      goal: 'Ask the terminal who you are (`whoami`)',
      tip: '`whoami` prints your user name, the name before the @ in the prompt.',
      hints: [
        'Your name is in the prompt, but a command can tell you too.',
        'The command is `whoami`: who am i, written as one word.',
        'whoami',
      ],
      done: ctx => ctx.ran('whoami'),
    },
    {
      goal: 'Find out where you are standing (`pwd`)',
      tip: '`pwd` prints the full path of the directory you are in.',
      hints: [
        'The prompt shows `~`, a short name. Ask for the full path.',
        '`pwd` means print working directory.',
        'pwd',
      ],
      done: ctx => ctx.ran('pwd'),
    },
    {
      goal: 'Look around your home (`ls`)',
      tip: '`ls` on its own lists the directory you are in.',
      hints: [
        'What is in this room? Ask for a list.',
        '`ls` lists the directory you are in.',
        'ls',
      ],
      done: ctx => ctx.ran('ls', record => listsHome(ctx, record)),
      near: ctx => {
        let note = null;
        if (ctx.ran('ls', record => ctx.flag(record, 'd'))) note = 'With -d, ls shows only the directory itself, not what is inside. Run ls with nothing after it.';
        else if (ctx.ran('ls', record => !listsHome(ctx, record))) note = 'That listed another directory. To look around your home, run ls in your home with nothing after it.';
        return note;
      },
    },
    {
      goal: 'Read the letter left for you (`cat`)',
      tip: '`cat` followed by a file name prints that file on the screen.',
      hints: [
        'There is a `.txt` file in your home. Print it on the screen.',
        '`cat` followed by a file name prints that file.',
        'cat readme.txt',
      ],
      done: ctx => ctx.read(`${ctx.home}/readme.txt`),
      near: readNear,
    },
    {
      goal: 'Open the manual page of a command (`man`)',
      tip: '`man` followed by a command name, like `man ls`, opens its manual page.',
      hints: [
        'Most commands come with a manual. One command opens it.',
        '`man` followed by a command name opens its manual page.',
        'man ls',
      ],
      done: ctx => ctx.ran('man'),
    },
    {
      goal: 'Ask a command for its quick help (`--help`)',
      tip: 'Many commands print a short summary when you add `--help`, with two dashes.',
      hints: [
        'Many commands explain themselves if you ask with an option.',
        'Add `--help` after the command name: two dashes, then help.',
        'ls --help',
      ],
      // bash's echo prints --help back instead of answering it.
      done: ctx => ctx.commands.some(record => record.name !== 'echo' && record.args.includes('--help') && record.stdout !== ''),
      near: ctx => (ctx.tried('echo', record => record.args.includes('--help'))
        ? 'echo prints its words back, even --help. Ask another command, like ls --help.' : null),
    },
    {
      goal: 'Wipe the screen clean (`clear`)',
      tip: '`clear` wipes the screen; Ctrl+L does too, but this task wants the command.',
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
    title: 'A New Note',
    briefing: `<p>A new note just arrived in your home. Its name starts with <code>note_</code> and ends with a few random letters. Find it with <code>ls</code>, then read it with <code>cat</code>.</p>`,
    setup: setupBoss,
    hints: [
      'Something new is in your home. `ls` shows everything there.',
      'Look for the name that starts with `note_` in what `ls` prints, then type `cat` and that name.',
      ({ note }) => `cat ${note.slice(note.lastIndexOf('/') + 1)}`,
    ],
    done: (ctx, { note }) => ctx.read(note),
    near: bossNear,
    hidden: hiddenNote,
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
