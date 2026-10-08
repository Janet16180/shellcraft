/**
 * Turning a world patch into a root shell script that builds the same world
 * inside the reference container, with fixed modification times, and writing
 * the login record the simulator's session starts with.
 */

const quote = s => `'${String(s).replace(/'/g, "'\\''")}'`;
const join = (parent, name) => (parent === '/' ? `/${name}` : `${parent}/${name}`);
const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
const SYSTEM_FILES = new Set(['/etc/shadow', '/etc/gshadow', '/etc/hostname', '/etc/hosts', '/etc/resolv.conf']);
const ACCOUNT_FILES = new Set(['/etc/passwd', '/etc/group']);
const SYSTEM_DIRS = new Set(['/', '/bin', '/boot', '/dev', '/etc', '/lib', '/proc', '/run', '/sbin', '/sys', '/usr', '/var']);

function build(path, node, out, parentFresh) {
  const system = SYSTEM_DIRS.has(path);
  if (SYSTEM_FILES.has(path)) return;
  if (ACCOUNT_FILES.has(path)) {
    out.accountFiles.push(`printf '%s' ${quote(node.content)} > ${quote(path)}`);
    return;
  }
  if (!parentFresh && !system) out.lines.push(`rm -rf -- ${quote(path)}`);
  if (system) out.lines.push(`mkdir -p -- ${quote(path)}`);
  else if (node.type === 'dir') out.lines.push(`mkdir -- ${quote(path)}`);
  else out.lines.push(`printf '%s' ${quote(node.content)} > ${quote(path)}`);
  out.lines.push(`chown ${quote(`${node.owner}:${node.group}`)} -- ${quote(path)}`);
  out.lines.push(`chmod ${node.mode.toString(8).padStart(4, '0')} -- ${quote(path)}`);
  if (!/^\d+$/.test(node.owner)) out.users.add(node.owner);
  if (!/^\d+$/.test(node.group)) out.groups.add(node.group);
  out.stamped.push(path);
  if (node.type === 'dir') for (const [name, child] of Object.entries(node.children)) build(join(path, name), child, out, !system);
}

/**
 * Write the setup script for a patch, applying operations in order. `put`
 * replaces the path, `remove` deletes it (system directories like /etc are
 * kept and only get the patch's children; /etc/passwd and /etc/group are
 * written first, before anything is owned, keeping their mode and owner;
 * other account and network files the container manages, like /etc/shadow
 * and /etc/hostname, are left alone), and every node the patch creates or
 * whose entries it changes gets the given mtime, as the simulator stamps them.
 * `proc` and `login` operations are ignored (the shell logs in after the setup); `cd` targets are
 * returned for the caller to replay inside the shell, so OLDPWD behaves as in
 * the simulator.
 *
 * @param {object[]} patch Operations from src/backend/spec.js.
 * @param {number} mtimeMs The modification time to stamp, in ms since the epoch.
 * @returns {{script: string, cds: string[]}} The root script and the directories to cd into, in order.
 */
export function materialize(patch, mtimeMs) {
  const out = { lines: [], accountFiles: [], users: new Set(), groups: new Set(), stamped: [] };
  const cds = [];
  for (const op of patch) {
    if (op.op === 'remove') out.lines.push(`rm -rf -- ${quote(op.path)}`);
    if (op.op === 'put' || op.op === 'remove') out.stamped.push(parentOf(op.path));
    if (op.op === 'put') build(op.path, op.node, out, false);
    if (op.op === 'cd') cds.push(op.path);
  }
  const seconds = Math.floor(mtimeMs / 1000);
  const accounts = [
    ...[...out.groups].map(g => `getent group ${quote(g)} >/dev/null || groupadd ${quote(g)}`),
    ...[...out.users].map(u => `getent passwd ${quote(u)} >/dev/null || useradd -M -N ${quote(u)}`),
  ];
  const stamps = [...new Set(out.stamped)].map(p => `[ ! -e ${quote(p)} ] || touch -h -d @${seconds} -- ${quote(p)}`);
  return { script: ['set -e', ...out.accountFiles, ...accounts, ...out.lines, ...stamps].join('\n') + '\n', cds };
}

/**
 * The root shell line that records a login in /run/utmp, as logging in on a
 * terminal does. The container has no login of its own, so without it `who`
 * would list no one.
 *
 * @param {string} user The user name.
 * @param {string} line The terminal, like pts/0.
 * @param {number} timeMs The login time, in ms since the epoch.
 * @returns {string} The line, ending in a newline.
 */
export function loginRecord(user, line, timeMs) {
  const time = `${new Date(timeMs).toISOString().slice(0, 19)},000000+00:00`;
  const record = `[7] [00000] [${line.slice(-4)}] [${user}] [${line}] [] [0.0.0.0] [${time}]`;
  return `printf '%s\\n' ${quote(record)} | utmpdump -r -o /run/utmp\n`;
}
