/**
 * Which sound effects a line makes, from its output and effects, so the player
 * hears what happened even when the map is not on show.
 */

import { nodeAt } from '../backend/tree.js';

function hidesSomething(obs, path) {
  const dir = nodeAt(obs.tree, path);
  return dir?.type === 'dir' && Object.keys(dir.children).some(name => name.startsWith('.'));
}

/**
 * @param {{result: {output: {stream: string}[]}, effects: object[], obs: object}} turn A session Turn.
 * @returns {string[]} Sound names, each once: err, step, discover (ls -a showed hidden entries, or
 *   ls found a boss room's hidden things), create and remove.
 */
export function turnSounds({ result, effects, obs }) {
  const has = test => effects.some(test);
  const names = [];
  if (result.output.some(chunk => chunk.stream === 'err')) names.push('err');
  if (has(e => e.kind === 'travel')) names.push('step');
  if (has(e => e.found || (e.kind === 'reveal' && hidesSomething(obs, e.path)))) names.push('discover');
  if (has(e => e.kind === 'created' && !e.found)) names.push('create');
  if (has(e => e.kind === 'removed')) names.push('remove');
  return names;
}
