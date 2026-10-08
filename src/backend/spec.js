/**
 * Declarative world descriptions shared by every backend.
 *
 * Chapters describe the world they need as a patch: a list of operations that
 * any backend can apply, the simulated shell by editing its in-memory tree, a
 * real bash by writing files into an isolated machine. Nothing here knows how
 * a backend stores the world.
 */

const OPS = new Set(['put', 'remove', 'proc', 'stop', 'cd', 'login']);
const PLAYER_SHELL = 'shell';
const MAX_MODE = 0o7777;

/**
 * Describe a directory.
 *
 * @param {Record<string, object>} [children] Child nodes by name.
 * @param {{mode?: number, owner?: string, group?: string}} [opts] Permission bits and ownership.
 * @returns {{type: 'dir', children: Record<string, object>, mode: number, owner: string, group: string}} The node.
 */
export function dir(children = {}, { mode = 0o755, owner = 'root', group = owner } = {}) {
  return { type: 'dir', children, mode, owner, group };
}

/**
 * Describe a regular file.
 *
 * @param {string} [content] The file's text.
 * @param {{mode?: number, owner?: string, group?: string}} [opts] Permission bits and ownership.
 * @returns {{type: 'file', content: string, mode: number, owner: string, group: string}} The node.
 */
export function file(content = '', { mode = 0o644, owner = 'root', group = owner } = {}) {
  return { type: 'file', content, mode, owner, group };
}

/**
 * Describe a symbolic link. The target text is kept exactly as given, like
 * `ln -s TARGET NAME` keeps it: a relative target is read from the link's
 * own directory each time the link is followed, and it may point at nothing.
 * Like Linux, a link's mode is always 777.
 *
 * @param {string} target The path the link points at, absolute or relative.
 * @param {{owner?: string, group?: string}} [opts] Ownership of the link itself.
 * @returns {{type: 'symlink', target: string, mode: number, owner: string, group: string}} The node.
 */
export function symlink(target, { owner = 'root', group = owner } = {}) {
  return { type: 'symlink', target, mode: 0o777, owner, group };
}

/**
 * Describe a hard link: another name for the node already at an absolute
 * path, like `ln TARGET NAME`. Both names then share one inode, its content,
 * mode and owner. Use it only as the node a put() places (not inside dir()),
 * after the target exists; the target may not be a directory.
 *
 * @param {string} target Absolute path of an existing file or symbolic link.
 * @returns {{type: 'link', target: string}} The node.
 */
export const link = target => ({ type: 'link', target });

/**
 * Create or replace the node at an absolute path. Its parent must exist.
 *
 * @param {string} path Absolute path.
 * @param {object} node A node built with dir(), file(), symlink() or link().
 * @returns {{op: 'put', path: string, node: object}} The operation.
 */
export const put = (path, node) => ({ op: 'put', path, node });

/**
 * Delete the node at an absolute path if it exists.
 *
 * @param {string} path Absolute path.
 * @returns {{op: 'remove', path: string}} The operation.
 */
export const remove = path => ({ op: 'remove', path });

/**
 * Make sure a process is running. `key` names it for later patches; the
 * backend chooses the PID unless `pid` asks for one. `ignores` lists the signals (by name, like 'TERM')
 * the process survives; KILL and STOP can never be ignored.
 *
 * @param {{key: string, user: string, cmd: string, pid?: number, tty?: string, stat?: string, cpu?: number, mem?: number, ignores?: string[]}} spec The process.
 * @returns {{op: 'proc', proc: object}} The operation.
 */
export const proc = spec => ({ op: 'proc', proc: spec });

/**
 * Remove the process started under `key`, if it is running.
 *
 * @param {string} key The key given to proc().
 * @returns {{op: 'stop', key: string}} The operation.
 */
export const stop = key => ({ op: 'stop', key });

/**
 * Move the player's shell to an absolute directory.
 *
 * @param {string} path Absolute path of an existing directory.
 * @returns {{op: 'cd', path: string}} The operation.
 */
export const cd = path => ({ op: 'cd', path });

/**
 * Log the player in again, as a new login would: the shell's groups become
 * the ones /etc/passwd and /etc/group give the player now. Like on a real
 * machine, editing /etc/group does not change a shell that is already
 * running; a setup that adds the player to a group writes the file, then
 * calls login(). The shell keeps its directory, variables and history.
 *
 * @returns {{op: 'login'}} The operation.
 */
export const login = () => ({ op: 'login' });

function checkNode(node, where) {
  if (node.type === 'link') throw new Error(`${where}: a hard link may only be the node a put places`);
  if (node.type === 'symlink' && !node.target) throw new Error(`${where}: a symbolic link needs a target, not an empty one`);
  if (node.mode < 0 || node.mode > MAX_MODE) throw new Error(`${where}: mode ${node.mode} is outside 0 to 7777`);
  if (node.type !== 'dir') return;
  for (const [name, child] of Object.entries(node.children)) checkNode(child, `${where}/${name}`);
}

function checkPut({ path, node }) {
  if (node.type !== 'link') checkNode(node, path);
  else if (!node.target.startsWith('/')) throw new Error(`put ${path}: a hard link's target must be absolute, got ${node.target}`);
}

// Linux's pid_max on 64-bit systems; PID 1 is init.
const MAX_PID = 4194304;
const validPid = pid => Number.isInteger(pid) && pid >= 2 && pid <= MAX_PID;

function checkOp(op) {
  if (!OPS.has(op.op)) throw new Error(`unknown patch operation: ${op.op}`);
  if ('path' in op && !op.path.startsWith('/')) throw new Error(`${op.op}: path must be absolute, got ${op.path}`);
  if (op.op === 'put') checkPut(op);
  if (op.op === 'proc' && !op.proc.key) throw new Error('proc: every process needs a key');
  if (op.op === 'proc' && !op.proc.cmd) throw new Error(`proc ${op.proc.key}: every process needs a cmd`);
  if (op.op === 'proc' && 'pid' in op.proc && !validPid(op.proc.pid)) throw new Error(`proc ${op.proc.key}: PID must be a whole number from 2 to ${MAX_PID}, got ${op.proc.pid}`);
  const key = op.op === 'proc' ? op.proc.key : op.key;
  if (key === PLAYER_SHELL) throw new Error(`${op.op}: the key '${PLAYER_SHELL}' is reserved for the player's own shell`);
}

/**
 * Check that a patch is well formed. A malformed patch is an authoring bug, so
 * this raises instead of repairing it.
 *
 * @param {object[]} patch The operations, in the order they apply.
 * @returns {object[]} The same patch.
 * @throws {Error} If an operation is unknown, uses a relative path, has a mode
 *   outside 0 to 7777, has a symbolic link with an empty target or a hard
 *   link that is not the node of a put or has a relative target, describes a process without a key or a command or
 *   with a PID outside 2 to 4194304, or uses
 *   the key 'shell', which belongs to the player's own shell.
 */
export function validatePatch(patch) {
  patch.forEach(checkOp);
  return patch;
}
