/**
 * Turning a world patch into a root shell script that builds the same world
 * inside the reference container, with fixed modification times.
 */

const quote = s => `'${String(s).replace(/'/g, "'\\''")}'`;
const join = (parent, name) => (parent === '/' ? `/${name}` : `${parent}/${name}`);
const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
const SYSTEM_FILES = new Set(['/etc/passwd', '/etc/group', '/etc/shadow', '/etc/gshadow', '/etc/hostname', '/etc/hosts', '/etc/resolv.conf']);
const SYSTEM_DIRS = new Set(['/', '/bin', '/boot', '/dev', '/etc', '/lib', '/proc', '/run', '/sbin', '/sys', '/usr', '/var']);

function build(path, node, out, parentFresh) {
  const system = SYSTEM_DIRS.has(path);
  if (SYSTEM_FILES.has(path)) return;
  if (!parentFresh && !system) out.lines.push(`rm -rf -- ${quote(path)}`);
  if (system) out.lines.push(`mkdir -p -- ${quote(path)}`);
  else if (node.type === 'dir') out.lines.push(`mkdir -- ${quote(path)}`);
  else out.lines.push(`printf '%s' ${quote(node.content)} > ${quote(path)}`);
  out.lines.push(`chown ${quote(`${node.owner}:${node.group}`)} -- ${quote(path)}`);
  out.lines.push(`chmod ${node.mode.toString(8).padStart(4, '0')} -- ${quote(path)}`);
  out.users.add(node.owner);
  out.groups.add(node.group);
  out.stamped.push(path);
  if (node.type === 'dir') for (const [name, child] of Object.entries(node.children)) build(join(path, name), child, out, !system);
}

/**
 * Write the setup script for a patch, applying operations in order. `put`
 * replaces the path, `remove` deletes it (system directories like /etc are
 * kept and only get the patch's children; account and network files the
 * container manages, like /etc/passwd, are left alone), and every node the patch creates or
 * whose entries it changes gets the given mtime, as the simulator stamps them.
 * `proc` operations cannot be reproduced and are ignored; `cd` targets are
 * returned for the caller to replay inside the shell, so OLDPWD behaves as in
 * the simulator.
 *
 * @param {object[]} patch Operations from src/backend/spec.js.
 * @param {number} mtimeMs The modification time to stamp, in ms since the epoch.
 * @returns {{script: string, cds: string[]}} The root script and the directories to cd into, in order.
 */
export function materialize(patch, mtimeMs) {
  const out = { lines: [], users: new Set(), groups: new Set(), stamped: [] };
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
  return { script: ['set -e', ...accounts, ...out.lines, ...stamps].join('\n') + '\n', cds };
}
