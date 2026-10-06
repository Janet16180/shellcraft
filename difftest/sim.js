/**
 * Running a case's lines in the simulator, the same way the container runs them.
 */

import { createSimBackend } from '../src/shell/backend.js';

const joinStream = (r, stream) => r.output.filter(c => c.stream === stream).map(c => c.text).join('');

/**
 * Load the world with the clock fixed at the world time, then run each line
 * on the real clock, as files created during a case get the current time in
 * the container too.
 *
 * @param {object[]} world The world patch.
 * @param {string[]} lines The lines to run.
 * @param {number} worldTime The mtime of the world's nodes, in ms since the epoch.
 * @returns {Promise<{out: string, err: string, status: number}[]>} One result per line.
 */
export async function runSim(world, lines, worldTime) {
  let fixed = worldTime;
  let seed = 0.37;
  const random = () => {
    seed = (seed * 9301 + 0.49297) % 1;
    return seed;
  };
  const backend = createSimBackend({ now: () => fixed ?? Date.now(), random });
  await backend.load(world);
  fixed = null;
  const results = [];
  for (const line of lines) {
    const r = await backend.run(line);
    results.push({ out: joinStream(r, 'out'), err: joinStream(r, 'err'), status: r.status });
  }
  return results;
}
