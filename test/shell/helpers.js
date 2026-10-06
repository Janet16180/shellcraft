import { createSimBackend } from '../../src/shell/backend.js';
import { put, dir, file } from '../../src/backend/spec.js';

export const NOW = Date.UTC(2026, 9, 6, 10, 0, 0);

/**
 * A small world like the game's: a home owned by hero with a few files, and
 * root-owned system directories.
 *
 * @returns {object[]} The patch.
 */
export function world() {
  const mine = { owner: 'hero' };
  return [
    put('/home', dir({
      hero: dir({
        'readme.txt': file('Dear apprentice,\nwelcome.\n', mine),
        '.secret_map': file('the map\n', mine),
        forest: dir({
          'mushroom.txt': file('A glowing mushroom.\n', mine),
          cave: dir({ 'bat.txt': file('A bat.\n', mine) }, mine),
        }, mine),
      }, { owner: 'hero', mode: 0o750 }),
    })),
    put('/etc', dir({ hostname: file('kernelia\n'), shadow: file('root:*:1\n', { mode: 0o640, group: 'shadow' }) })),
    put('/tmp', dir({}, { mode: 0o1777 })),
    put('/root', dir({ 'secret.txt': file('x\n') }, { mode: 0o700 })),
  ];
}

/**
 * A backend with a fixed clock and random source, loaded with world() and any extra patch.
 *
 * @param {object[]} [extra] More operations applied after the world.
 * @param {object} [opts] Options for createSimBackend.
 * @returns {Promise<object>} The backend.
 */
export async function shell(extra = [], opts = {}) {
  const b = createSimBackend({ now: () => NOW, random: () => 0.5, ...opts });
  await b.load([...world(), ...extra]);
  return b;
}

/**
 * Run a line and join its output by stream.
 *
 * @param {object} b A backend.
 * @param {string} line The line.
 * @returns {Promise<{out: string, err: string, note: string, status: number, result: object}>} The joined streams.
 */
export async function run(b, line) {
  const r = await b.run(line);
  const join = stream => r.output.filter(c => c.stream === stream).map(c => c.text).join(stream === 'note' ? '\n' : '');
  return { out: join('out'), err: join('err'), note: join('note'), status: r.status, result: r };
}

/**
 * Run several lines and return the last one's joined output.
 *
 * @param {object} b A backend.
 * @param {string[]} lines The lines, in order.
 * @returns {Promise<object>} What run() returns for the last line.
 */
export async function runAll(b, lines) {
  let last = null;
  for (const line of lines) last = await run(b, line);
  return last;
}
