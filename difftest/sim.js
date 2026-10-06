/**
 * Running a case's lines in the simulator, the same way the container runs them.
 */

import { createSimBackend } from '../src/shell/backend.js';

const joinStream = (r, stream) => r.output.filter(c => c.stream === stream).map(c => c.text).join('');

/**
 * Load the world with the clock fixed at the world time, then run each line
 * at the clock the container had when it ran that line, so files created
 * during a case get the same time on both sides.
 *
 * @param {object[]} world The world patch.
 * @param {string[]} lines The lines to run.
 * @param {number} worldTime The mtime of the world's nodes, in ms since the epoch.
 * @param {number[]} clocks The container clock for each line, in seconds since the epoch.
 * @returns {Promise<{out: string, err: string, status: number}[]>} One result per line.
 * @throws {Error} If there is not exactly one clock per line.
 */
export async function runSim(world, lines, worldTime, clocks) {
  if (clocks.length !== lines.length) throw new Error(`runSim needs one clock per line, got ${clocks.length} for ${lines.length}`);
  let now = worldTime;
  let seed = 0.37;
  const random = () => {
    seed = (seed * 9301 + 0.49297) % 1;
    return seed;
  };
  const backend = createSimBackend({ now: () => now, random });
  await backend.load(world);
  const results = [];
  for (const [i, line] of lines.entries()) {
    now = clocks[i] * 1000;
    const r = await backend.run(line);
    results.push({ out: joinStream(r, 'out'), err: joinStream(r, 'err'), status: r.status });
  }
  return results;
}
