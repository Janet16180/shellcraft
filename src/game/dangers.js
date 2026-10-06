/**
 * Dangerous attempts: the one rule for losing a heart (DESIGN section 2.1).
 * It reads the line's command records and the observation before it, never
 * the backend's own refusals, so a line costs the same on any backend, even
 * when real Linux refused the command by itself.
 */
import { isInside } from '../backend/tree.js';

const KILL_SIGNALS = new Set(['9', 'KILL']);
// rm refuses an operand whose last component is . or .. before touching it.
const DOT_OPERAND = /(^|\/)\.\.?\/*$/;

const REASONS = {
  root: 'rm -r on / tries to erase the whole system. GNU rm refuses it by default (--preserve-root), but never try it on a real machine.',
  home: 'rm -r on your home directory, or on a directory that holds it, would delete everything in your home, and there is no undo.',
  shell: 'kill -9 on your own shell ends it at once. In a real terminal your session would close.',
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

function killSignal(args) {
  const [first, second] = args;
  let spec = 'TERM';
  if (first === '-s' || first === '-n') spec = second ?? '';
  else if (first?.startsWith('-')) spec = first.slice(1);
  return spec.toUpperCase().replace(/^SIG/, '');
}

function killDanger(ctx, record) {
  const shell = ctx.before.procs.find(p => p.key === 'shell');
  const pids = record.args.filter(a => /^\d+$/.test(a)).map(Number);
  return shell && KILL_SIGNALS.has(killSignal(record.args)) && pids.includes(shell.pid) ? REASONS.shell : null;
}

const CHECKS = new Map([['rm', rmDanger], ['kill', killDanger]]);

/**
 * Dangerous attempts in a line, whether or not they succeeded: rm -r of /, of
 * home or of a directory holding home, and kill -9 of the player's shell (the
 * process with key 'shell').
 *
 * @param {object} ctx The line's check context from makeContext.
 * @returns {string[]} One reason per dangerous command, in order.
 */
export function dangers(ctx) {
  return ctx.commands.map(r => CHECKS.get(r.name)?.(ctx, r) ?? null).filter(Boolean);
}
