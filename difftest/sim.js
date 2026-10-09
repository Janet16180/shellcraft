/**
 * Running a case's lines in the simulator, the same way the container runs them.
 */

import { createSimBackend } from '../src/shell/backend.js';

const joinStream = (r, stream) => r.output.filter(c => c.stream === stream).map(c => c.text).join('');

// A line still running in the foreground goes on once the clock reaches its end.
async function finish(backend, first, clock) {
  const parts = [first];
  while (parts.at(-1).running) {
    const { seconds } = parts.at(-1).running;
    if (seconds === null) throw new Error('a case line runs forever: the container would hang too');
    clock.now += seconds * 1000;
    parts.push(await backend.poll());
  }
  return { ...parts.at(-1), output: parts.flatMap(p => p.output) };
}

/**
 * Load the world with the clock fixed at the world time, then run each line
 * at the clock the container had when it ran that line, so files created
 * during a case get the same time on both sides. A line whose command takes
 * time (sleep 2) runs on to its end on the simulator's clock.
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
  const clock = { now: worldTime };
  let seed = 0.37;
  const random = () => {
    seed = (seed * 9301 + 0.49297) % 1;
    return seed;
  };
  const backend = createSimBackend({ now: () => clock.now, random });
  await backend.load(world);
  const results = [];
  for (const [i, line] of lines.entries()) {
    clock.now = Math.max(clock.now, clocks[i] * 1000);
    const r = await finish(backend, await backend.run(line), clock);
    results.push({ out: joinStream(r, 'out'), err: joinStream(r, 'err'), status: r.status });
  }
  return results;
}
