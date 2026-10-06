/**
 * Declarative world descriptions shared by every backend.
 *
 * Chapters describe the world they need as a patch: a list of operations that
 * any backend can apply, the simulated shell by editing its in-memory tree, a
 * real bash by writing files into an isolated machine. Nothing here knows how
 * a backend stores the world.
 */

const OPS = new Set(['put', 'remove', 'proc', 'stop', 'cd']);
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
 * Create or replace the node at an absolute path. Its parent must exist.
 *
 * @param {string} path Absolute path.
 * @param {object} node A node built with dir() or file().
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
 * backend chooses the PID. `ignores` lists the signals (by name, like 'TERM')
 * the process survives; KILL and STOP can never be ignored.
 *
 * @param {{key: string, user: string, cmd: string, tty?: string, stat?: string, cpu?: number, mem?: number, ignores?: string[]}} spec The process.
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

function checkNode(node, where) {
  if (node.mode < 0 || node.mode > MAX_MODE) throw new Error(`${where}: mode ${node.mode} is outside 0 to 7777`);
  if (node.type !== 'dir') return;
  for (const [name, child] of Object.entries(node.children)) checkNode(child, `${where}/${name}`);
}

function checkOp(op) {
  if (!OPS.has(op.op)) throw new Error(`unknown patch operation: ${op.op}`);
  if ('path' in op && !op.path.startsWith('/')) throw new Error(`${op.op}: path must be absolute, got ${op.path}`);
  if (op.op === 'put') checkNode(op.node, op.path);
  if (op.op === 'proc' && !op.proc.key) throw new Error('proc: every process needs a key');
  if (op.op === 'proc' && !op.proc.cmd) throw new Error(`proc ${op.proc.key}: every process needs a cmd`);
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
 *   outside 0 to 7777, describes a process without a key or a command, or uses
 *   the key 'shell', which belongs to the player's own shell.
 */
export function validatePatch(patch) {
  patch.forEach(checkOp);
  return patch;
}
