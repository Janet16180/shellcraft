/**
 * The check context: what chapter checks see of one line. It reads only the
 * backend port's data (CommandRecords and Observations), so checks work the
 * same with the simulator or a real bash.
 */

const READERS = new Set(['cat', 'less', 'more', 'head', 'tail']);

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

/**
 * Find the node at an absolute path in an observed tree.
 *
 * @param {object} tree The TreeNode rooted at '/'.
 * @param {string} path Absolute path.
 * @returns {object|null} The TreeNode, or null if nothing is there.
 * @throws {Error} If path is not absolute.
 */
export function nodeAt(tree, path) {
  if (!path.startsWith('/')) throw new Error(`path must be absolute, got ${path}`);

  let node = tree;
  for (const name of path.split('/').filter(Boolean)) {
    node = node?.children?.[name] ?? null;
  }
  return node;
}

function shortOptions(args) {
  const end = args.indexOf('--');
  return (end < 0 ? args : args.slice(0, end)).filter(a => /^-[^-]/.test(a));
}

function operands(args) {
  const end = args.indexOf('--');
  const before = (end < 0 ? args : args.slice(0, end)).filter(a => !a.startsWith('-'));
  return end < 0 ? before : [...before, ...args.slice(end + 1)];
}

/**
 * Build the context a chapter's checks receive for one line.
 *
 * @param {{commands: object[], before: object, obs: object}} line The line's
 *   CommandRecords and the Observations before and after it.
 * @returns {object} The context described in AUTHORING.md section 2.
 */
export function makeContext({ commands, before, obs }) {
  const { home } = obs;
  const paths = record => operands(record.args).map(arg => resolvePath(arg, record.cwd, home));
  const hasPath = (record, path) => paths(record).includes(path);
  const ran = (name, pred = () => true) => commands.some(r => r.name === name && r.status === 0 && pred(r));
  const readsFrom = (record, path) => hasPath(record, path) || record.redirects.some(x => x.op === '<' && x.target === path);

  return {
    commands,
    before,
    obs,
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
