/**
 * Effects: what a line did to the world, for the map to animate and the UI to
 * sound. They are derived from port data only (the observations before and
 * after, the command records, the guard's refusals), so any backend works.
 *
 * Also here: dangerous attempts, which cost a heart even when real Linux
 * refused them.
 *
 * @typedef {{kind: string} & Record<string, unknown>} Effect
 */

const NOT_FOUND = 127;
const KILL_SIGNALS = new Set(['9', 'KILL']);
// rm refuses an operand whose last component is . or .. before touching it.
const DOT_OPERAND = /(^|\/)\.\.?\/*$/;

const REASONS = {
  root: 'rm -r on / tries to erase the whole system. GNU rm refuses it by default (--preserve-root), but never try it on a real machine.',
  home: 'rm -r on your home directory, or on a directory that holds it, would delete everything in your home, and there is no undo.',
  shell: 'kill -9 on your own shell ends it at once. In a real terminal your session would close.',
};

const childPath = (path, name) => (path === '/' ? `/${name}` : `${path}/${name}`);

function diffTree(was, now, path, found) {
  const names = new Set([...Object.keys(was.children), ...Object.keys(now.children)]);
  for (const name of [...names].sort()) {
    const a = was.children[name];
    const b = now.children[name];
    const replaced = a && b && a.type !== b.type;
    if (a && (!b || replaced)) found.removed.push({ kind: 'removed', path: childPath(path, name), type: a.type });
    if (b && (!a || replaced)) found.created.push({ kind: 'created', path: childPath(path, name), type: b.type });
    if (a?.type === 'dir' && b?.type === 'dir') diffTree(a, b, childPath(path, name), found);
  }
}

/**
 * Effects of a change between two observations: removed and created paths
 * (only the topmost of a removed or created subtree), then a travel if the cwd
 * changed. Used for a line and for patches the game loads (a boss room).
 *
 * @param {object} before The Observation before.
 * @param {object} after The Observation after.
 * @returns {Effect[]} `removed {path, type}`, `created {path, type}` and `travel {from, to}` effects.
 */
export function worldEffects(before, after) {
  const found = { removed: [], created: [] };
  diffTree(before.tree, after.tree, '/', found);
  const travel = before.cwd === after.cwd ? [] : [{ kind: 'travel', from: before.cwd, to: after.cwd }];
  return [...found.removed, ...found.created, ...travel];
}

function listsHidden(ctx, record) {
  const all = ctx.flag(record, 'a') || ctx.flag(record, 'A') || record.args.includes('--all') || record.args.includes('--almost-all');
  return record.name === 'ls' && record.status === 0 && all && !ctx.flag(record, 'd');
}

function reveals(ctx) {
  const paths = ctx.commands.filter(r => listsHidden(ctx, r)).flatMap(r => {
    const operands = ctx.paths(r);
    return operands.length > 0 ? operands : [r.cwd];
  });
  return [...new Set(paths)].filter(path => ctx.node(path)?.type === 'dir').map(path => ({ kind: 'reveal', path }));
}

/**
 * All built-in effects of one line, world changes first. Their order is not
 * the order things happened in.
 *
 * @param {object} ctx The line's check context from makeContext.
 * @param {string[]} blocked The guard's refusals from the RunResult.
 * @returns {Effect[]} worldEffects, then `reveal {path}` for directories listed
 *   with ls -a or -A, `unknown-command {name}` and `guardian {reason}`.
 */
export function lineEffects(ctx, blocked) {
  return [
    ...worldEffects(ctx.before, ctx.obs),
    ...reveals(ctx),
    ...ctx.commands.filter(r => r.status === NOT_FOUND).map(r => ({ kind: 'unknown-command', name: r.name })),
    ...blocked.map(reason => ({ kind: 'guardian', reason })),
  ];
}

function rmDanger(ctx, record) {
  const recursive = ctx.flag(record, 'r') || ctx.flag(record, 'R') || record.args.includes('--recursive');
  const named = { ...record, args: record.args.filter(a => !DOT_OPERAND.test(a)) };
  const paths = recursive ? ctx.paths(named) : [];
  const holdsHome = path => ctx.home === path || ctx.home.startsWith(`${path}/`);
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

/**
 * Dangerous attempts in a line, whether or not they succeeded: rm -r of /, of
 * home or of a directory holding home, and kill -9 of the player's shell (the
 * process with key 'shell').
 *
 * @param {object} ctx The line's check context from makeContext.
 * @returns {string[]} One reason per dangerous command, in order.
 */
export function dangers(ctx) {
  const check = { rm: rmDanger, kill: killDanger };
  return ctx.commands.map(r => check[r.name]?.(ctx, r) ?? null).filter(Boolean);
}
