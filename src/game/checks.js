/**
 * The check context: what chapter checks see of one line. It reads only the
 * backend port's data (CommandRecords and Observations), so checks work the
 * same with the simulator or a real bash.
 */
import { nodeAt } from '../backend/tree.js';
import { archiveMembers, gunzip, isGzip, byteLength } from '../backend/archive.js';

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
  tar: { create: 'c', extract: 'x', get: 'x', list: 't', gzip: 'z', gunzip: 'z', ungzip: 'z', verbose: 'v', file: 'f', directory: 'C' },
  gzip: { keep: 'k', decompress: 'd', stdout: 'c', list: 'l', recursive: 'r', verbose: 'v', force: 'f' },
  gunzip: { keep: 'k', stdout: 'c', list: 'l', recursive: 'r', verbose: 'v', force: 'f' },
  du: { summarize: 's', 'human-readable': 'h', all: 'a', total: 'c', 'max-depth': 'd' },
  df: { 'human-readable': 'h', 'print-type': 'T' },
  file: { brief: 'b', dereference: 'L' },
};

// tar's old form takes its letters without a dash: `tar czf a.tgz dir`.
const dashless = record => record.name === 'tar' && record.args.length > 0 && !record.args[0].startsWith('-');

function longOptions(record) {
  const end = record.args.indexOf('--');
  const map = LONG_OPTIONS[record.name] ?? {};
  return (end < 0 ? record.args : record.args.slice(0, end))
    .filter(a => a.startsWith('--') && a.length > 2)
    .map(a => map[a.slice(2).split('=')[0]])
    .filter(Boolean);
}

// tar's short options that take a value; glued to the letter (`-fa.tar`, `-Cout`) it is the rest of the word.
const TAR_VALUE_LETTERS = 'bCfFgHIKLNTVX';
// The values of these give paths: the archive and the directory to work in.
const TAR_PATH_LETTERS = 'fC';
const TAR_PATH_LONG = /^--(?:file|directory)=(.+)$/;

// A short-option word split into its letters and a value glued after a letter that takes one.
function splitCluster(record, word) {
  const letters = word.slice(1);
  const at = record.name === 'tar' ? [...letters].findIndex(ch => TAR_VALUE_LETTERS.includes(ch)) : -1;
  if (at < 0 || at === letters.length - 1) return { letters, value: null, letter: null };
  return { letters: letters.slice(0, at + 1), value: letters.slice(at + 1), letter: letters[at] };
}

function shortOptions(record) {
  const { args } = record;
  const end = args.indexOf('--');
  const clusters = (end < 0 ? args : args.slice(0, end)).filter(a => /^-[^-]/.test(a)).map(a => `-${splitCluster(record, a).letters}`);
  return dashless(record) ? [`-${args[0]}`, ...clusters] : clusters;
}

// tar's operands, and the paths it takes as option values (`--file=a.tar`, `-fa.tar`, `-Cout`),
// each where it was typed. A value in the next word (`-f a.tar`) is an operand already.
function tarPaths(record) {
  const args = dashless(record) ? record.args.slice(1) : record.args;
  const end = args.indexOf('--');
  const glued = a => {
    const long = TAR_PATH_LONG.exec(a)?.[1];
    const short = /^-[^-]/.test(a) ? splitCluster(record, a) : null;
    return long ?? (short?.value && TAR_PATH_LETTERS.includes(short.letter) ? short.value : null);
  };
  const found = (end < 0 ? args : args.slice(0, end)).map(a => glued(a) ?? (a.startsWith('-') ? null : a));
  return [...found.filter(p => p !== null && p !== '-'), ...(end < 0 ? [] : args.slice(end + 1))];
}

// The members of the tar archive at a node, with each file's size in bytes.
function membersOf(node) {
  const members = node?.type === 'file' ? archiveMembers(node.content) : null;
  return members && members.map(m => (m.type === 'file' ? { ...m, size: byteLength(m.content) } : { ...m, size: 0 }));
}

function gzippedText(node) {
  const g = node?.type === 'file' && isGzip(node.content) ? gunzip(node.content) : null;
  return g && !g.error ? g.text : null;
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

// Where stdout and stderr end up, following the redirections in typed order; null is the screen.
export function streamsOf(record) {
  let out = null;
  let err = null;
  for (const { op, target } of record.redirects) {
    if (/^1?>>?$/.test(op)) out = target;
    else if (/^2>>?$/.test(op)) err = target;
    else if (/^&>>?$/.test(op)) { out = target; err = target; }
    else if (op === '2>&' && target === '1') err = out;
    else if (/^1?>&$/.test(op) && target === '2') out = err;
  }
  return { out, err };
}

const KEYS = ['INT', 'TSTP'];

// A job (the same one: same PID) whose process ended during the line, or
// whose end bash reported in it: live then done or gone, or done then gone.
function jobEnded(before, after, id) {
  const was = (before.jobs ?? []).find(j => j.id === id);
  const now = (after.jobs ?? []).find(j => j.id === id && j.pid === was?.pid);
  return Boolean(was) && (was.state === 'done' ? !now : !now || now.state === 'done');
}

/**
 * Build the context a chapter's checks receive for one line.
 *
 * @param {{commands: object[], before: object, obs: object, completions?: {line: string, completed: string}[], line?: string, typed?: string}} line
 *   The line's CommandRecords, the Observations before and after it, the
 *   Tab completions made while typing it, the line that ran (after history
 *   expansion) and the keys as typed (the line that ran, by default).
 * @returns {object} The context described in AUTHORING.md section 2.
 */
export function makeContext({ commands, before, obs, completions = [], line = '', typed = line }) {
  const { home } = obs;
  const paths = record => (record.name === 'tar' ? tarPaths(record) : operands(record.args)).map(arg => resolvePath(arg, record.cwd, home));
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
  const onScreen = record => record.stage === record.stages - 1 && streamsOf(record).out === null;
  const nodeContent = path => nodeAt(obs.tree, path)?.content ?? nodeAt(before.tree, path)?.content ?? null;
  // A reader that succeeded, or that failed on another file after it printed this whole file.
  const readOk = (record, path) => record.status === 0 || (nodeContent(path) !== null && nodeContent(path) !== '' && record.stdout.includes(nodeContent(path)));

  return {
    commands,
    before,
    obs,
    completions,
    line,
    typed,
    home,
    cwd: obs.cwd,
    node: path => nodeAt(obs.tree, path),
    inode: path => nodeAt(obs.tree, path)?.ino ?? null,
    linkTarget: path => {
      const node = nodeAt(obs.tree, path, { follow: false });
      return node?.type === 'symlink' ? node.target : null;
    },
    archive: path => membersOf(nodeAt(obs.tree, path)),
    gzipped: path => gzippedText(nodeAt(obs.tree, path)),
    proc: key => obs.procs.find(p => p.key === key) ?? null,
    jobs: obs.jobs ?? [],
    alias: name => (obs.aliases && Object.hasOwn(obs.aliases, name) ? obs.aliases[name] : null),
    variable: name => (obs.vars && Object.hasOwn(obs.vars, name) ? obs.vars[name] : null),
    job: id => (obs.jobs ?? []).find(j => j.id === id) ?? null,
    ended: id => jobEnded(before, obs, id),
    pressed: (key, name = null) => {
      if (!KEYS.includes(key)) throw new Error(`pressed takes INT or TSTP, got ${key}`);
      return commands.some(r => r.signal === key && (name === null || r.name === name));
    },
    ran,
    tried: (name, pred = () => true) => commands.some(r => r.name === name && pred(r)),
    flag: (record, letter) => shortOptions(record).some(o => o.slice(1).includes(letter)) || longOptions(record).includes(letter),
    paths,
    hasPath,
    piped,
    streams: streamsOf,
    onScreen,
    shown: path => commands.some(r => READERS.has(r.name) && hasPath(r, path) && readOk(r, path) && onScreen(r)),
    read: path => commands.some(r => READERS.has(r.name) && hasPath(r, path) && readOk(r, path)),
  };
}
