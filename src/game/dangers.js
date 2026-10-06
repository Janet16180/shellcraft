/**
 * Dangerous attempts: the one rule for losing a heart (DESIGN section 2.1).
 * It reads the line's command records and the observation before it, never
 * the backend's own refusals, so a line costs the same on any backend, even
 * when real Linux refused the command by itself.
 */
import { isInside } from '../backend/tree.js';
import { requestedSignal, endsInteractiveShell, defaultAction, signalName } from '../backend/signals.js';

// rm refuses an operand whose last component is . or .. before touching it.
const DOT_OPERAND = /(^|\/)\.\.?\/*$/;

const REASONS = {
  root: 'rm -r on / tries to erase the whole system. GNU rm refuses it by default (--preserve-root), but never try it on a real machine.',
  home: 'rm -r on your home directory, or on a directory that holds it, would delete everything in your home, and there is no undo.',
  shell: name => `SIG${name} to your own shell ends it. In a real terminal your session would close.`,
  frozen: name => `SIG${name} to your own shell freezes it. In a real terminal it would stop answering until another terminal sends SIGCONT.`,
};

function rmDanger(ctx, record) {
  const recursive = ctx.flag(record, 'r') || ctx.flag(record, 'R') || record.args.includes('--recursive');
  const named = { ...record, args: record.args.filter(a => !DOT_OPERAND.test(a)) };
  const paths = recursive ? ctx.paths(named) : [];
  const holdsHome = path => isInside(ctx.home, path);
  let reason = null;
  if (paths.includes('/')) reason = REASONS.root;
  else if (paths.some(holdsHome)) reason = REASONS.home;
  return reason;
}

/**
 * The name pgrep, pkill and killall match a process by: the first word of its
 * command line, without a login shell's leading dash or a directory.
 *
 * @param {string} cmd A ProcRecord's cmd, like '-bash' or './shadow --devour'.
 * @returns {string} The process name, like 'bash' or 'shadow'.
 */
export const processName = cmd => cmd.split(' ')[0].replace(/^-/, '').split('/').pop();

// pkill reads its pattern as an extended regular expression; a JavaScript
// RegExp agrees on the patterns a beginner types.
function matchesPattern(pattern, name, exact) {
  let found = false;
  try {
    found = new RegExp(exact ? `^(?:${pattern})$` : pattern).test(name);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return found;
}

const TARGETS = new Map([
  ['kill', ({ shell, operands }) => operands.includes(String(shell.pid))],
  ['killall', ({ shell, operands }) => operands.includes(processName(shell.cmd))],
  ['pkill', ({ shell, operands, exact }) => operands.some(p => matchesPattern(p, processName(shell.cmd), exact))],
]);

function targetsShell(ctx, record, operands) {
  const shell = ctx.before.procs.find(p => p.key === 'shell');
  return shell !== undefined && TARGETS.get(record.name)({ shell, operands, exact: ctx.flag(record, 'x') });
}

function killDanger(ctx, record) {
  const asked = requestedSignal(record.name, record.args);
  const deadly = asked.status === 'send' && endsInteractiveShell(asked.signal) && targetsShell(ctx, record, asked.operands);
  let reason = null;
  if (deadly) {
    const name = signalName(asked.signal);
    reason = defaultAction(asked.signal) === 'stop' ? REASONS.frozen(name) : REASONS.shell(name);
  }
  return reason;
}

const CHECKS = new Map([['rm', rmDanger], ['kill', killDanger], ['pkill', killDanger], ['killall', killDanger]]);

/**
 * Dangerous attempts in a line, whether or not they succeeded: rm -r of /, of
 * home or of a directory holding home, and kill, pkill or killall sending a
 * signal that ends or stops an interactive bash to the player's shell: the
 * process with key 'shell', by PID for kill, by name for killall, and by a
 * pattern matching its name for pkill.
 *
 * @param {object} ctx The line's check context from makeContext.
 * @returns {string[]} One reason per dangerous command, in order.
 */
export function dangers(ctx) {
  return ctx.commands.map(r => CHECKS.get(r.name)?.(ctx, r) ?? null).filter(Boolean);
}
