/**
 * Effects: what a line did to the world, for the map to animate and the UI to
 * sound. They are derived from port data only (the observations before and
 * after, the command records, the guard's refusals), so any backend works.
 *
 * @typedef {{kind: string} & Record<string, unknown>} Effect
 */

import { compareNames } from '../backend/tree.js';

const NOT_FOUND = 127;
const childPath = (path, name) => (path === '/' ? `/${name}` : `${path}/${name}`);

function diffTree(was, now, path, found) {
  const names = new Set([...Object.keys(was.children), ...Object.keys(now.children)]);
  for (const name of [...names].sort(compareNames)) {
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
