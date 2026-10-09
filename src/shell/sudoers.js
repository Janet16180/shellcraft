/**
 * The sudo policy, read from the tree like sudoers does: /etc/sudoers (or
 * Ubuntu 24.04's default file, UBUNTU_SUDOERS, when the world has none) and the files of
 * any `@includedir` directory. Only the plain forms are understood:
 * `Defaults` lines without a scope, and rules `WHO HOST=(RUNAS) [TAGS:] COMMANDS`
 * where WHO is a user, `%group` or ALL, HOST is ALL or the host name,
 * COMMANDS is ALL or full paths with optional arguments, and the tags are
 * NOPASSWD and PASSWD. Anything else is skipped.
 */

import { lookup } from './fs.js';
import { compareNames } from '../backend/tree.js';
import { UBUNTU_SUDOERS } from '../backend/sudoers.js';

const SUDOERS = '/etc/sudoers';
const RULE = /^(\S+)\s+(\S+?)\s*=\s*(?:\(([^)]*)\)\s*)?((?:(?:NOPASSWD|PASSWD)\s*:\s*)*)(.+)$/;
const INCLUDE_DIR = /^[@#]includedir\s+(\S+)$/;
const list = text => text.split(',').map(s => s.trim()).filter(Boolean);

function fileText(sys, path) {
  const node = lookup(sys.root, path);
  return node?.type === 'file' ? node.content : null;
}

// Backslash-newline continues a line; # starts a comment unless it is #include.
function logicalLines(text) {
  return text.replace(/\\\n/g, ' ').split('\n').map(l => l.trim()).filter(l => l && (!l.startsWith('#') || INCLUDE_DIR.test(l)));
}

function parseDefaults(line) {
  const body = line.slice('Defaults'.length).trim();
  return list(body).map(entry => entry.replace(/^(\w+)\s*=\s*"?(.*?)"?$/, '$1=$2'));
}

function parseRule(line, source) {
  const m = RULE.exec(line);
  if (!m) return null;
  const [, who, host, runas, tags, commands] = m;
  const [users, groups] = runas === undefined ? ['root', undefined] : runas.split(':');
  const lastTag = [...tags.matchAll(/(NO)?PASSWD/g)].at(-1);
  return {
    who, host, source,
    runas: { users: list(users), groups: groups === undefined ? null : list(groups) },
    nopasswd: Boolean(lastTag?.[1]),
    commands: list(commands),
  };
}

// The files of an include directory that sudoers reads: no '.' in the name, no '~' at the end.
function includedFiles(sys, dirPath) {
  const node = lookup(sys.root, dirPath);
  if (node?.type !== 'dir') return [];
  return Object.keys(node.children).filter(n => !n.includes('.') && !n.endsWith('~')).sort(compareNames).map(n => `${dirPath}/${n}`);
}

function readFile(sys, path, text, policy, depth) {
  for (const line of logicalLines(text)) {
    const include = INCLUDE_DIR.exec(line);
    if (include && depth < 2) for (const f of includedFiles(sys, include[1])) readFile(sys, f, fileText(sys, f) ?? '', policy, depth + 1);
    else if (/^Defaults\s/.test(line)) policy.defaults.push(...parseDefaults(line));
    else if (!include && !line.startsWith('Defaults')) {
      const rule = parseRule(line, path);
      if (rule) policy.rules.push(rule);
    }
  }
}

/**
 * Read the policy.
 *
 * @param {object} sys The machine state.
 * @returns {{defaults: string[], rules: object[]}} The Defaults entries, and the rules in file order.
 */
export function readPolicy(sys) {
  const policy = { defaults: [], rules: [] };
  readFile(sys, SUDOERS, fileText(sys, SUDOERS) ?? UBUNTU_SUDOERS, policy, 0);
  return policy;
}

/**
 * The rules that apply to a user on this host.
 *
 * @param {object} sys The machine state.
 * @param {{defaults: string[], rules: object[]}} policy From readPolicy.
 * @param {string} user The user name.
 * @param {string[]} groups The names of the user's groups.
 * @returns {object[]} The rules, in file order.
 */
export function rulesFor(sys, policy, user, groups) {
  const who = w => w === 'ALL' || w === user || (w.startsWith('%') && groups.includes(w.slice(1)));
  return policy.rules.filter(r => who(r.who) && (r.host === 'ALL' || r.host === sys.host));
}

function commandMatches(spec, path, args) {
  if (spec === 'ALL') return true;
  const [specPath, ...specArgs] = spec.split(/\s+/);
  return specPath === path && (!specArgs.length || specArgs.join(' ') === args.join(' '));
}

const runasMatches = (rule, target) => rule.runas.users.includes('ALL') || rule.runas.users.includes(target);

/**
 * Whether the rules let the user run a program as a target user. Like
 * sudoers, the last matching rule decides its tags.
 *
 * @param {object[]} rules From rulesFor.
 * @param {{target: string, path: string, args: string[]}} request The program's path, its arguments and the user to run it as.
 * @returns {{allowed: boolean, nopasswd: boolean}} The decision.
 */
export function decide(rules, { target, path, args }) {
  const match = rules.filter(r => runasMatches(r, target) && r.commands.some(c => commandMatches(c, path, args))).at(-1);
  return { allowed: Boolean(match), nopasswd: Boolean(match?.nopasswd) };
}

/**
 * The secure_path Default, if the policy sets one.
 *
 * @param {{defaults: string[]}} policy From readPolicy.
 * @returns {string[]|null} Its directories.
 */
export function securePath(policy) {
  const entry = policy.defaults.findLast(d => d.startsWith('secure_path='));
  return entry ? entry.slice('secure_path='.length).split(':') : null;
}

function wrapped(items, cols) {
  const lines = [];
  let line = `    ${items[0]}`;
  for (const item of items.slice(1)) {
    const next = `${line}, ${item}`;
    if (cols && next.length > cols) {
      lines.push(`${line},`);
      line = `    ${item}`;
    } else {
      line = next;
    }
  }
  return [...lines, line];
}

function ruleLine(rule) {
  const { users, groups } = rule.runas;
  const runas = groups ? `${users.join(', ')} : ${groups.join(', ')}` : users.join(', ');
  return `    (${runas}) ${rule.nopasswd ? 'NOPASSWD: ' : ''}${rule.commands.join(', ')}`;
}

/**
 * What `sudo -l` prints for a user who has rules.
 *
 * @param {object} sys The machine state.
 * @param {{defaults: string[]}} policy From readPolicy.
 * @param {object[]} rules From rulesFor.
 * @param {string} user The user.
 * @param {number} cols The terminal width to wrap the defaults to; 0 for no wrapping.
 * @returns {string} The listing.
 */
export function listing(sys, policy, rules, user, cols) {
  // sudo displays path separators as \\: in its listing; this formats a list, not a shell command.
  const defaults = policy.defaults.map(d => d.replace(/^secure_path=(.*)$/, (_, p) => `secure_path=${p.split(':').join('\\:')}`));
  return [
    `Matching Defaults entries for ${user} on ${sys.host}:`,
    ...(defaults.length ? wrapped(defaults, cols) : []),
    '',
    `User ${user} may run the following commands on ${sys.host}:`,
    ...rules.map(ruleLine),
    '',
  ].join('\n');
}

/**
 * Whether `sudo -l` needs a password: not if any rule has NOPASSWD (sudoers' listpw=any).
 *
 * @param {object[]} rules From rulesFor.
 * @returns {boolean} True when a password is needed.
 */
export const listNeedsPassword = rules => !rules.some(r => r.nopasswd);

/**
 * Whether `sudo -v` needs a password: unless every rule has NOPASSWD (verifypw=all).
 *
 * @param {object[]} rules From rulesFor.
 * @returns {boolean} True when a password is needed.
 */
export const validateNeedsPassword = rules => !rules.length || !rules.every(r => r.nopasswd);
