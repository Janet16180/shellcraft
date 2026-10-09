/**
 * Play lines through a session the way a player would, for the session
 * playthroughs: Enter, then the password at a prompt, and while a command
 * runs the keys written at the end of the line (Ctrl+C, Ctrl+Z), or the
 * time it takes on a test clock.
 */
import { KEY_SIGNALS } from './type-line.js';

/**
 * A clock that stands still until the test moves it.
 *
 * @param {number} [start] Milliseconds since the epoch.
 * @returns {{now: () => number, tick: (seconds: number) => void}} The reading, and a way to let time pass.
 */
export function createClock(start = Date.UTC(2026, 9, 6, 12)) {
  let now = start;
  return { now: () => now, tick: seconds => { now += seconds * 1000; } };
}

/**
 * The keys typeLine needs to play a line through a session.
 *
 * @param {object} session A session (or anything with submit, complete, answer, poll and signal).
 * @param {{password?: string|null, tick?: ((seconds: number) => void)|null}} [opts] The password
 *   to type at a prompt, and the clock's tick, to let a running command reach its end.
 * @returns {{complete: Function, submit: (line: string, keys?: string[]) => Promise<object>}} For typeLine.
 * @throws {Error} From submit, if a line asks for input with no password, or runs on with no key and no end.
 */
export function sessionKeys(session, { password = null, tick = null } = {}) {
  const submit = async (line, keys = []) => {
    const pressed = [...keys];
    let turn = await session.submit(line);
    while (turn.result.input || turn.result.running) {
      const { input, running } = turn.result;
      const key = running ? pressed.shift() : undefined;
      if (input && password === null) throw new Error(`"${line}" asked for input and there is no password`);
      if (running && key === undefined && (running.seconds === null || !tick)) throw new Error(`"${line}" never ends without a key`);
      if (input) turn = await session.answer(password);
      else if (key !== undefined) turn = await session.signal(KEY_SIGNALS[key]);
      else {
        tick(running.seconds);
        turn = await session.poll();
      }
    }
    return turn;
  };
  return { complete: line => session.complete(line), submit };
}
