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
  const hasPath = (record, path) => paths(record).includes(path);
  const ran = (name, pred = () => true) => commands.some(r => r.name === name && r.status === 0 && pred(r));
  const readsFrom = (record, path) => hasPath(record, path) || record.redirects.some(x => x.op === '<' && x.target === path);

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
    flag: (record, letter) => shortOptions(record.args).some(o => o.slice(1).includes(letter)),
    paths,
    hasPath,
    read: path => commands.some(r => READERS.has(r.name) && r.status === 0 && readsFrom(r, path)),
  };
}
