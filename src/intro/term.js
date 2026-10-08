/**
 * The small terminal of an explainer step: the lines it types, when each
 * character and each output line appears, and their HTML. Timing is data
 * here; CSS animation delays play it, so a still frame shows every line.
 */

import { esc, promptHTML } from '../ui/output.js';
import { PLAYER } from '../backend/player.js';

/** Seconds to type one character. */
export const TYPE_S = 0.045;
const OUTPUT_S = 0.2;
const NEXT_S = 0.5;

/**
 * When each line is typed and when its output shows.
 *
 * @param {{type: string, output?: string[], wait?: number}[]} entries The lines, in order; `wait`
 *   is extra seconds before a line is typed.
 * @returns {{lines: {at: number, outAt: number}[], end: number}} Seconds from the step's start:
 *   per line, when typing starts and when its output shows; `end` when the strip is done.
 */
export function termTimeline(entries) {
  let clock = 0;
  const lines = entries.map(({ type, wait = 0 }) => {
    const at = clock + wait;
    const outAt = at + type.length * TYPE_S + OUTPUT_S;
    clock = outAt + NEXT_S;
    return { at, outAt };
  });
  return { lines, end: entries.length ? clock : 0 };
}

const delay = seconds => `--d:${seconds.toFixed(2)}s`;

/**
 * The strip's HTML: each line with its prompt, its characters revealed one by
 * one, then its output.
 *
 * @param {{type: string, output?: string[], fails?: boolean, user?: string, cwd?: string, wait?: number}[]} entries
 *   The lines. `user` and `cwd` (absolute) set the prompt, by default the player at home;
 *   `fails` shows the output as an error.
 * @returns {string} HTML.
 */
export function termHTML(entries) {
  const { lines } = termTimeline(entries);
  return entries.map((entry, i) => {
    const user = entry.user ?? PLAYER.user;
    const home = `/home/${user}`;
    const prompt = promptHTML({ user, host: PLAYER.host, cwd: entry.cwd ?? home, home });
    const keys = [...entry.type].map((char, k) => `<span class="k" style="${delay(lines[i].at + k * TYPE_S)}">${esc(char)}</span>`).join('');
    const out = (entry.output ?? []).map(text =>
      `<div class="ln out${entry.fails ? ' err' : ''} ex-in" style="${delay(lines[i].outAt)}">${esc(text)}</div>`).join('');
    return `<div class="ln ex-in" style="${delay(lines[i].at)}">${prompt}${keys}</div>${out}`;
  }).join('');
}
