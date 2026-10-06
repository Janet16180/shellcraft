/**
 * Keeping the simulator's clock in step with the container's, so a file
 * created during a case shows the same time on both sides.
 *
 * The container starts each case in the first 45 seconds of a minute, and the
 * simulator runs each line at the clock the container had for it. A case that
 * still ends in a later minute is reported, never retried.
 */

const minute = seconds => Math.floor(seconds / 60);

/**
 * Pick the clock each line of a case runs at in the simulator.
 *
 * @param {({started: number|null}|null)[]} real Per line, its container result, or null if it did not run there.
 * @param {number} fallback The clock for every line when none has one, in seconds.
 * @returns {number[]} One clock per line, in seconds: the line's own start, else the
 *   clock of the line before it, else the first clock of the case.
 */
export function lineClocks(real, fallback) {
  let clock = real.find(r => r?.started != null)?.started ?? fallback;
  return real.map(r => {
    clock = r?.started ?? clock;
    return clock;
  });
}

/**
 * Tell whether a case's lines ran across a minute boundary in the container.
 *
 * @param {{started: number|null, ended: number|null}[]} real The container results, in order.
 * @returns {{from: number, to: number}|null} When the first clocked line started and the
 *   last one ended, in seconds, if those fall in different minutes; null otherwise.
 */
export function crossedMinute(real) {
  const clocked = real.filter(r => r.ended !== null);
  const from = clocked[0]?.started;
  const to = clocked.at(-1)?.ended;
  let crossed = null;
  if (clocked.length && minute(from) !== minute(to)) crossed = { from, to };
  return crossed;
}
