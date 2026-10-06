/**
 * The animated intro, as data so a fact-checker can read every sentence.
 *
 * The intro runs its lines on a private backend loaded with WORLD, so the
 * output and the map come from the same simulator as the game. Each step may
 * type one line; going Back replays the lines of the earlier steps.
 *
 * Step fields:
 * - id, title: a unique name and the caption heading (trusted HTML: code for commands,
 *   because the pixel title font blurs c into o).
 * - text: caption paragraphs, trusted HTML (p-level content: code, kbd, b, em).
 * - type: a line to type and run when the step opens.
 * - focus: for the prompt steps, the piece of the prompt being explained.
 * - parts: the typed line split into its words, each with its role.
 * - keys: key names and what they do.
 * - light: whether the room is lit (it stays dark until ls looks around).
 * - scroll: show the file the line printed as an unrolled scroll.
 * - say: a speech bubble for the hero.
 * - ring: the door or item the line is about ('..' for the way back), ringed on the map.
 * - yourTurn: the line the player is asked to type in the real terminal.
 *
 * Every sentence is meant to be true on Ubuntu 24.04 with bash 5.2.
 */

import { cd, dir, file, put } from '../backend/spec.js';

const HOME = '/home/hero';
const OWN = { owner: 'hero' };

export const README = `Welcome to Kernelia, hero.
This scroll is the file readme.txt in your home directory.
Doors are directories. Walk through one with cd.
`;

/** The intro's world, added to the backend's empty home: one door and one scroll. */
export const WORLD = [
  put(`${HOME}/forest`, dir({
    cave: dir({}, OWN),
    'mushroom.txt': file('A glowing mushroom. It hums quietly.\n', OWN),
  }, OWN)),
  put(`${HOME}/readme.txt`, file(README, OWN)),
  cd(HOME),
];

/** The pieces of the prompt, in order, with the role each one plays and its label. */
export const PROMPT_PIECES = [
  { text: 'hero', role: 'user', label: 'user' },
  { text: '@', role: null, label: '' },
  { text: 'kernelia', role: 'host', label: 'machine' },
  { text: ':', role: null, label: '' },
  { text: '~', role: 'cwd', label: 'directory' },
  { text: '$', role: 'sigil', label: 'regular user' },
];

export const STEPS = [
  {
    id: 'welcome',
    title: 'This is a terminal',
    text: [
      'You type a command, press <kbd>Enter</kbd>, and the computer answers in text.',
      'The map shows the directory you are in. In this tour it stays dark until you look around.',
    ],
    light: false,
  },
  {
    id: 'prompt-user',
    title: 'The prompt: who you are',
    focus: 'user',
    text: [
      'The line the terminal waits on is the <b>prompt</b>. Its first word, <code>hero</code>, is your user name.',
      'Every file and every running program on Linux belongs to a user.',
    ],
    light: false,
  },
  {
    id: 'prompt-host',
    title: 'The prompt: which machine',
    focus: 'host',
    text: [
      'After the <code>@</code> comes <code>kernelia</code>, the name of the machine you are logged in to (its hostname).',
      'It matters when you work on several machines at once: the prompt tells you which one you are typing into.',
    ],
    light: false,
  },
  {
    id: 'prompt-cwd',
    title: 'The prompt: where you are',
    focus: 'cwd',
    text: [
      'After the colon comes the directory you are in. <code>~</code> (a tilde) is short for your home directory, <code>/home/hero</code>.',
      'When you move, this part of the prompt changes with you.',
    ],
    light: false,
  },
  {
    id: 'prompt-sigil',
    title: 'The prompt: what you may do',
    focus: 'sigil',
    text: [
      'The <code>$</code> at the end means you are a regular user. When root, the administrator, uses the shell, the prompt ends with <code>#</code> instead.',
      'Your commands go after it.',
    ],
    light: false,
  },
  {
    id: 'ls',
    title: 'Look around with <code>ls</code>',
    type: 'ls',
    text: [
      '<code>ls</code> lists the files and directories where you are (names that start with a dot stay hidden unless you ask). The room lights up: each <b>door</b> is a directory and each <b>item</b> is a file.',
      'Here <code>forest</code> is a directory and <code>readme.txt</code> is a file.',
    ],
    light: true,
  },
  {
    id: 'cd-forest',
    title: 'Walk through a door with <code>cd</code>',
    type: 'cd forest',
    ring: 'forest',
    say: 'Into the forest!',
    text: [
      '<code>cd</code> changes directory. You walked through the door into <code>forest</code>, and the prompt now shows <code>~/forest</code>.',
      'When <code>cd forest</code> works it prints nothing. Silence means success for many Linux commands.',
    ],
    light: true,
  },
  {
    id: 'cd-up',
    title: 'Take the way out with <code>cd ..</code>',
    type: 'cd ..',
    ring: '..',
    text: [
      '<code>..</code> (two dots) is the parent directory: the one this directory sits in. The parent of <code>~/forest</code> is your home, so you are back where you started.',
    ],
    light: true,
  },
  {
    id: 'cat',
    title: 'Read a file with <code>cat</code>',
    type: 'cat readme.txt',
    ring: 'readme.txt',
    scroll: true,
    text: [
      '<code>cat</code> prints the contents of a file in the terminal. The name comes from concatenate: give it several files and it prints them one after another.',
    ],
    light: true,
  },
  {
    id: 'anatomy',
    title: 'Command, option, argument',
    type: 'ls -l forest',
    parts: [['ls', 'command'], ['-l', 'option'], ['forest', 'argument']],
    text: [
      'Spaces split a line into words. The first word is the <b>command</b>.',
      'An <b>option</b> usually starts with a dash and changes how the command works. <code>-l</code> asks <code>ls</code> for its long format: one line per entry, with its permissions, owner, size and the date it was last modified.',
      'An <b>argument</b> tells the command what to work on. Here <code>ls</code> lists <code>forest</code> instead of the directory you are in.',
    ],
    light: true,
  },
  {
    id: 'keys',
    title: 'Keys that save typing',
    keys: [
      ['Enter', 'runs the line you typed.'],
      ['Tab', 'completes a name. Type <code>cd fo</code> and press Tab: bash fills in <code>forest/</code>.'],
      ['Up', 'brings back the line you ran before. Press it again to go further back.'],
      ['man', '<code>man ls</code> shows the manual of <code>ls</code>. On a real system it opens in a pager: press <kbd>q</kbd> to leave.'],
      ['hint', '<code>hint</code> is not a Linux command. It is this game\'s helper: the first hint for a step is free, the next two lower the XP that step pays.'],
    ],
    text: [
      'A few keys and commands do most of the work. You do not need to remember them now: the Spellbook keeps every command you learn.',
    ],
    light: true,
  },
  {
    id: 'your-turn',
    title: 'Your turn',
    yourTurn: 'whoami',
    text: [
      'The real terminal is yours now. Type <code>whoami</code> and press <kbd>Enter</kbd>: it prints your user name.',
      'Then read the Quest panel. It tells you what to do next.',
    ],
    light: true,
  },
];
