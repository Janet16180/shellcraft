/**
 * The check context: what chapter checks see of one line. It reads only the
 * backend port's data (CommandRecords and Observations), so checks work the
 * same with the simulator or a real bash.
 */
import { nodeAt } from '../backend/tree.js';

/** Commands that read a file's content. */
export const READERS = new Set(['cat', 'less', 'more', 'head', 'tail']);

/**
 * Turn a path typed by the player into a clean absolute path. A leading `~`
 * means home; `.`, `..`, repeated and trailing slashes are resolved.
 *
 * @param {string} arg The path as typed.
 * @param {string} cwd Absolute directory it is relative to.
 * @param {string} home Absolute home directory.
 * @returns {string} The absolute path.
 */
export function resolvePath(arg, cwd, home) {
  let path = arg;
  if (arg === '~' || arg.startsWith('~/')) path = home + arg.slice(1);
  if (!path.startsWith('/')) path = `${cwd}/${path}`;

  const parts = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '' && part !== '.') parts.push(part);
  }
  return `/${parts.join('/')}`;
}

/** Commands that read standard input when no file is named. */
export const STDIN_READERS = new Set([...READERS, 'grep', 'sort', 'uniq', 'wc', 'cut', 'tr', 'nl', 'rev', 'tac']);

/** The long options players type, per command, and the short letter each one means. */
const LONG_OPTIONS = {
  ls: { all: 'a', 'almost-all': 'A', directory: 'd', recursive: 'R', 'human-readable': 'h' },
  grep: { recursive: 'r', 'dereference-recursive': 'R', 'ignore-case': 'i', count: 'c', 'line-number': 'n', 'invert-match': 'v', 'word-regexp': 'w' },
  rm: { recursive: 'r', force: 'f', dir: 'd' },
  cp: { recursive: 'r' },
  mkdir: { parents: 'p' },
  head: { lines: 'n' },
  tail: { lines: 'n' },
  wc: { lines: 'l', words: 'w', bytes: 'c', chars: 'm' },
  sort: { unique: 'u', reverse: 'r', 'numeric-sort': 'n' },
  uniq: { count: 'c', repeated: 'd', unique: 'u' },
};

function longOptions(record) {
  const end = record.args.indexOf('--');
  const map = LONG_OPTIONS[record.name] ?? {};
  return (end < 0 ? record.args : record.args.slice(0, end))
    .filter(a => a.startsWith('--') && a.length > 2)
    .map(a => map[a.slice(2).split('=')[0]])
    .filter(Boolean);
}

function shortOptions(args) {
  const end = args.indexOf('--');
  return (end < 0 ? args : args.slice(0, end)).filter(a => /^-[^-]/.test(a));
}

/**
 * The non-option arguments of a command, as typed: everything that does not
 * start with a dash, plus everything after `--`. A lone `-` (standard input)
 * is not an operand.
 *
 * @param {string[]} args A CommandRecord's arguments.
 * @returns {string[]} The operands, in order.
 */
export function operands(args) {
  const end = args.indexOf('--');
  const before = (end < 0 ? args : args.slice(0, end)).filter(a => !a.startsWith('-'));
  return end < 0 ? before : [...before, ...args.slice(end + 1)];
}

/**
 * Build the context a chapter's checks receive for one line.
 *
 * @param {{commands: object[], before: object, obs: object, completions?: {line: string, completed: string}[], line?: string}} line
 *   The line's CommandRecords, the Observations before and after it, the
 *   Tab completions made while typing it, and its text as typed.
 * @returns {object} The context described in AUTHORING.md section 2.
 */
export function makeContext({ commands, before, obs, completions = [], line = '' }) {
  const { home } = obs;
  const paths = record => operands(record.args).map(arg => resolvePath(arg, record.cwd, home));
  const ran = (name, pred = () => true) => commands.some(r => r.name === name && r.status === 0 && pred(r));
  const inputOf = record => record.redirects.find(x => x.op === '<')?.target ?? null;
  const stageBefore = record => commands.find(r => r.pipeline === record.pipeline && r.stage === record.stage - 1) ?? null;
  // The files a plain cat (no options, so the lines are unchanged) piped into this stage.
  const piped = record => {
    const cat = record.stage > 0 ? stageBefore(record) : null;
    if (cat?.name !== 'cat' || cat.status !== 0 || cat.args.some(a => a.startsWith('-') && a !== '-' && a !== '--')) return [];
    const files = paths(cat);
    if (files.length > 0) return files;
    return inputOf(cat) ? [inputOf(cat)] : piped(cat);
  };
  // A file the command names, or, for a command that reads its input, the file sent in with < or a piped cat.
  const hasPath = (record, path) => paths(record).includes(path)
    || (STDIN_READERS.has(record.name) && (inputOf(record) === path || piped(record).includes(path)));
  const nodeContent = path => nodeAt(obs.tree, path)?.content ?? nodeAt(before.tree, path)?.content ?? null;
  // A reader that succeeded, or that failed on another file after it printed this whole file.
  const readOk = (record, path) => record.status === 0 || (nodeContent(path) !== null && nodeContent(path) !== '' && record.stdout.includes(nodeContent(path)));

  return {
    commands,
    before,
    obs,
    completions,
    line,
    home,
    cwd: obs.cwd,
    node: path => nodeAt(obs.tree, path),
    proc: key => obs.procs.find(p => p.key === key) ?? null,
    ran,
    tried: (name, pred = () => true) => commands.some(r => r.name === name && pred(r)),
    flag: (record, letter) => shortOptions(record.args).some(o => o.slice(1).includes(letter)) || longOptions(record).includes(letter),
    paths,
    hasPath,
    piped,
    shown: path => commands.some(r => READERS.has(r.name) && hasPath(r, path) && readOk(r, path)
      && r.stage === r.stages - 1 && !r.redirects.some(x => x.op === '>' || x.op === '>>')),
    read: path => commands.some(r => READERS.has(r.name) && hasPath(r, path) && readOk(r, path)),
  };
}
