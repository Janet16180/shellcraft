/**
 * The ending, played once the last chapter is cleared: its steps as data,
 * and the pure pieces the player shows (the commands learned in each act,
 * the final score). Every sentence is meant to be plain, short and true.
 */

import { actName } from '../ui/panels.js';

// TODO(lead): replace with the address of the Ring Zero repository or page before publishing.
export const RING_ZERO_URL = 'https://github.com/';

/**
 * The steps of the ending. Fields: id, title (text), text (paragraphs, trusted HTML: code, b, em
 * only), scene (what the stage shows: 'camp', 'descent', 'recap' or 'kernel'), sound (one cue).
 */
export const ENDING_STEPS = [
  {
    id: 'road',
    title: 'The end of the road',
    scene: 'camp',
    sound: 'page',
    text: [
      'You packed your things into one archive. The road ends here, at a stairway going down.',
      'You can find your way around a Linux system now: its files, its people and its programs.',
    ],
  },
  {
    id: 'down',
    title: 'Down to the kernel',
    scene: 'descent',
    sound: 'step',
    text: [
      'Below every file and every program is the <b>kernel</b>, the core of Linux. It starts programs, reads and writes files, and checks every permission.',
      'On a PC, the kernel runs at the processor\'s most trusted level, called <b>ring&nbsp;0</b>.',
    ],
  },
  {
    id: 'learned',
    title: 'What you learned',
    scene: 'recap',
    sound: 'discover',
    text: ['Three acts of commands, all of them real. They work the same in bash on any Linux machine.'],
  },
  {
    id: 'score',
    title: 'Your score',
    scene: 'kernel',
    sound: 'level',
    text: ['Every task, boss and chapter you finished is counted here.'],
  },
  {
    id: 'next',
    title: 'Next: Ring Zero',
    scene: 'kernel',
    sound: 'page',
    text: [
      'Ring Zero is the next game. You play it on a real Linux machine, and it goes deeper: processes, signals, files held open, and what the kernel does with them.',
      'Or play Shellcraft again from the start.',
    ],
  },
];

/**
 * Whether a game event is the end of the game: the last chapter of the list cleared,
 * with no chapter after it.
 *
 * @param {{kind: string, id?: string, next?: string|null}} event A session event.
 * @param {{id: string}[]} chapters The View's chapter list.
 * @returns {boolean} True for the finale.
 */
export function isFinale(event, chapters) {
  return event.kind === 'chapter' && event.next === null && chapters.at(-1)?.id === event.id;
}

/**
 * Whether the ending may be watched again: the last chapter is cleared.
 *
 * @param {{status: string}[]} chapters The View's chapter list.
 * @returns {boolean} True once the game was finished.
 */
export function endingOpen(chapters) {
  return chapters.at(-1)?.status === 'cleared';
}

const OPERATORS = new Set(['|', '||', '&&', '&', '>', '>>', '2>', '<', '!!']);
const SEPARATORS = new Set(['|', '||', '&&', '&']);
const KEYWORDS = new Set(['do', 'done', 'then', 'fi', 'else', 'in']);
const NAME = /^[a-z][a-z0-9_-]*$/;
const OPTION = /^(--?[a-zA-Z][\w-]*|[-+][a-zA-Z0-9]*)$/;

const startsCommand = (word, expect) => expect && NAME.test(word) && !KEYWORDS.has(word);
const sudoRuns = (current, word) => current?.length === 1 && current[0] === 'sudo' && NAME.test(word);

// One word of a recap line: a sign of the shell, an option of the command being read, the name of
// the next command, or anything else (a path, an argument), which ends the command.
function readWord(state, word) {
  const { current } = state;
  if (OPERATORS.has(word)) {
    state.flush();
    state.found.push(word);
    state.expect = SEPARATORS.has(word);
  } else if (current && OPTION.test(word)) current.push(word);
  else if (sudoRuns(current, word) || startsCommand(word, state.expect)) {
    state.flush();
    state.current = [word];
    state.expect = false;
  } else {
    state.flush();
    if (!KEYWORDS.has(word)) state.expect = false;
    if (word.includes('*')) state.found.push('*');
  }
}

// One recap line read word by word: a command name and the options right after it, the shell's
// signs (pipes, redirections, && and ||, &), and a wildcard. A semicolon ends a command.
function lineSpells(line) {
  const state = { found: [], current: null, expect: true };
  state.flush = () => {
    if (state.current) state.found.push(state.current.join(' '));
    state.current = null;
  };
  for (const raw of line.trim().split(/\s+/)) {
    const ends = raw.endsWith(';');
    const word = ends ? raw.slice(0, -1) : raw;
    if (word) readWord(state, word);
    if (ends) {
      state.flush();
      state.expect = true;
    }
  }
  state.flush();
  return state.found;
}

/**
 * The spells of a chapter's recap: each command with its options, and the
 * shell's signs, in order of first use, once each.
 *
 * @param {string[][]} recap [command line, meaning] pairs.
 * @returns {string[]} Like ['tar -czf', 'tar -tf', '|'].
 */
export function spellsOf(recap) {
  return [...new Set(recap.flatMap(([line]) => lineSpells(line)))];
}

/**
 * The player's journey: the written chapters grouped by act, each with the
 * spells of its recap and those of them no earlier chapter used (fresh).
 *
 * @param {{number: number, act: number, title: string, recap: string[][], status: string}[]} chapters The View's chapter list.
 * @returns {{act: number, name: string, chapters: {number: number, title: string, spells: string[], fresh: string[]}[]}[]}
 *   Acts in order.
 */
export function journeyOf(chapters) {
  const written = chapters.filter(c => c.status !== 'soon');
  const seen = new Set();
  const rows = written.map(({ number, act, title, recap }) => {
    const spells = spellsOf(recap);
    const fresh = spells.filter(spell => !seen.has(spell));
    spells.forEach(spell => seen.add(spell));
    return { act, chapter: { number, title, spells, fresh } };
  });
  const acts = [...new Set(written.map(c => c.act))];
  return acts.map(act => ({ act, name: `Act ${actName(act)}`, chapters: rows.filter(r => r.act === act).map(r => r.chapter) }));
}

/**
 * The final score.
 *
 * @param {{xp: number, rank: {title: string}, chapters: {status: string}[]}} view The session View.
 * @returns {{xp: number, rank: string, cleared: number, total: number}} XP, rank, chapters cleared of those written.
 */
export function scoreOf({ xp, rank, chapters }) {
  const written = chapters.filter(c => c.status !== 'soon');
  return { xp, rank: rank.title, cleared: written.filter(c => c.status === 'cleared').length, total: written.length };
}
