/**
 * Coach notes: one teaching sentence for the commonest beginner mistakes
 * (DESIGN section 2.3.1). They are derived from CommandRecords and the
 * observation only, so they work with any backend. Only failed commands get
 * a note; a correct line never does.
 */
import { nodeAt, childOf, isInside } from '../backend/tree.js';
import { READERS, operands, resolvePath } from './checks.js';

const NOT_FOUND = 127;
const ONE_DASH_LONG = new Set(['-help', '-version']);
const BUILTINS = [
  'alias', 'bg', 'cd', 'echo', 'exit', 'export', 'false', 'fg', 'help', 'history', 'jobs', 'kill',
  'logout', 'printf', 'pwd', 'read', 'set', 'source', 'test', 'true', 'type', 'umask', 'unalias', 'unset',
];
const WINDOWS = new Map([
  ['cls', 'cls is the Windows command. On Linux, use clear.'],
  ['del', 'del is the Windows command. On Linux, use rm.'],
  ['copy', 'copy is the Windows command. On Linux, use cp.'],
  ['move', 'move is the Windows command. On Linux, use mv.'],
  ['ren', 'ren is the Windows command. On Linux, rename with mv.'],
  ['ipconfig', 'ipconfig is the Windows command. On Linux, try ip addr (not simulated here).'],
]);

const baseName = path => path.slice(path.lastIndexOf('/') + 1);
const nodeOf = (ctx, record, arg) => ctx.node(resolvePath(arg, record.cwd, ctx.home));
const promptPath = (cwd, home) => (isInside(cwd, home) ? `~${cwd.slice(home.length)}` : cwd);

function knownCommands(obs) {
  const installed = ['/usr/bin', '/bin'].flatMap(path => Object.keys(nodeAt(obs.tree, path)?.children ?? {}));
  return new Set([...BUILTINS, ...installed]);
}

function notFoundNote(ctx, record, known) {
  const { name, args } = record;
  const lower = name.toLowerCase();
  const command = [...known].filter(k => name.startsWith(k) && k.length < name.length).sort((a, b) => b.length - a.length)[0];
  const rest = command ? name.slice(command.length) : '';
  const restExists = command && nodeOf(ctx, record, rest) !== null;
  const spaced = [command, rest, ...args].join(' ');

  let note = null;
  if (WINDOWS.has(name)) note = WINDOWS.get(name);
  else if (lower !== name && known.has(lower)) note = `Commands are case-sensitive. Try ${[lower, ...args].join(' ')}`;
  else if (command && rest.startsWith('-')) note = `Put a space before the option: ${spaced}`;
  else if (command && (/^[./~]/.test(rest) || restExists)) note = `Put a space between the command and its argument: ${spaced}`;
  return note;
}

function optionNote(record) {
  const option = record.args.find(a => ONE_DASH_LONG.has(a));
  const letters = option ? [...option.slice(1)].map(c => `-${c}`).join(' ') : '';
  return option ? `For most commands, one dash starts short options, so ${option} means ${letters}. Long options take two dashes: --${option.slice(1)}.` : null;
}

function readsDirectoryNote(ctx, record) {
  const arg = operands(record.args).find(a => nodeOf(ctx, record, a)?.type === 'dir');
  const reads = READERS.has(record.name) && arg !== undefined;
  return reads ? `${arg} is a directory (a door). ${record.name} reads files. ls ${arg} shows what is inside; cd ${arg} walks in.` : null;
}

function splitNameNote(ctx, record) {
  const args = operands(record.args);
  const exists = arg => nodeOf(ctx, record, arg) !== null;
  const i = args.findIndex((a, k) => k + 1 < args.length && !exists(a) && !exists(args[k + 1]) && exists(`${a}_${args[k + 1]}`));
  const [a, b] = [args[i], args[i + 1]];
  return i < 0 ? null : `Spaces split a line into words, so ${record.name} saw two names: ${a} and ${b}. The name uses an underscore: ${a}_${b}.`;
}

function firstMissing(tree, path) {
  const names = path.split('/').filter(Boolean);
  let parent = tree;
  let i = 0;
  while (childOf(parent, names[i])) {
    parent = childOf(parent, names[i]);
    i += 1;
  }
  return { siblings: parent.children ?? {}, name: names[i], last: i === names.length - 1 };
}

function lookalikeNote(tree, path) {
  const { siblings, name, last } = firstMissing(tree, path);
  const sameCase = Object.keys(siblings).find(n => n.toLowerCase() === name.toLowerCase());
  const withExtension = Object.keys(siblings).filter(n => n.startsWith(`${name}.`) && siblings[n].type === 'file');
  let note = null;
  if (sameCase) note = `Names are case-sensitive too: the ${siblings[sameCase].type === 'dir' ? 'door' : 'file'} is ${sameCase}.`;
  else if (last && !name.includes('.') && withExtension.length === 1) {
    note = `The file is ${withExtension[0]}: ${withExtension[0].slice(name.length)} is part of its name.`;
  }
  return note;
}

function missingPathNote(ctx, record, arg) {
  const path = resolvePath(arg, record.cwd, ctx.home);
  const [first, ...rest] = arg.split('/');
  const fromHere = rest.filter(Boolean).join('/');
  const repeatsCwd = !arg.startsWith('/') && first === baseName(record.cwd) && rest.length > 0 && nodeOf(ctx, record, fromHere) !== null;

  let note = null;
  if (arg.startsWith('/') && ctx.node(`${ctx.home}${path}`) !== null) {
    note = `A path that starts with / starts at the root, not at your home. Your ${path.slice(1)} is ${ctx.home}${path}, or ~${path}.`;
  } else if (repeatsCwd) {
    const onward = fromHere === '' ? '' : ` From here the path is ${fromHere}.`;
    note = `You are already in ${first} (the prompt shows ${promptPath(record.cwd, ctx.home)}).${onward}`;
  } else {
    note = lookalikeNote(ctx.obs.tree, path);
  }
  return note;
}

function operandNote(ctx, record) {
  let note = null;
  for (const arg of operands(record.args).filter(a => nodeOf(ctx, record, a) === null)) note ??= missingPathNote(ctx, record, arg);
  return note;
}

function recordNote(ctx, record, known) {
  let note = null;
  if (record.status === NOT_FOUND) note = notFoundNote(ctx, record, known);
  else if (record.status !== 0) note = optionNote(record) ?? readsDirectoryNote(ctx, record) ?? splitNameNote(ctx, record) ?? operandNote(ctx, record);
  return note;
}

/**
 * A teaching note for the first failed command of a line that made a common
 * beginner mistake: a missing space, wrong case, a Windows command, a missing
 * extension, reading a directory, an unquoted space, a long option with one
 * dash, a path repeating the current directory, or / used for home.
 *
 * @param {object} ctx The line's check context from makeContext.
 * @returns {string|null} One plain-text sentence or two, or null when no rule applies.
 */
export function coachNote(ctx) {
  const known = knownCommands(ctx.obs);
  let note = null;
  for (const record of ctx.commands) note ??= recordNote(ctx, record, known);
  return note;
}
