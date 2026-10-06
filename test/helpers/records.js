/**
 * Builders for port data in engine tests: observations and command records
 * with sensible defaults, so each test states only what it is about.
 */
import { dir, file } from '../../src/backend/spec.js';

export const HOME = '/home/hero';

/**
 * A small world: / with /etc, /tmp and the player's home holding a forest.
 *
 * @returns {object} A TreeNode rooted at '/'.
 */
export function sampleTree() {
  return dir({
    etc: dir({ hostname: file('kernelia\n') }),
    tmp: dir({}, { mode: 0o1777 }),
    home: dir({
      hero: dir({
        'readme.txt': file('Welcome, hero.\n', { owner: 'hero' }),
        '.secret': file('hidden\n', { owner: 'hero' }),
        forest: dir({ cave: dir({}, { owner: 'hero' }) }, { owner: 'hero' }),
      }, { owner: 'hero' }),
    }),
  });
}

/**
 * An Observation with defaults for every field.
 *
 * @param {object} [fields] Fields to override.
 * @returns {object} The observation.
 */
export function observation(fields = {}) {
  return { user: 'hero', groups: ['hero'], host: 'kernelia', home: HOME, cwd: HOME, tree: sampleTree(), procs: [], ...fields };
}

/**
 * A CommandRecord with defaults for every field.
 *
 * @param {string} name The command name.
 * @param {string[]} [args] Its arguments.
 * @param {object} [fields] Fields to override (cwd, status, stdout, redirects...).
 * @returns {object} The record.
 */
export function record(name, args = [], fields = {}) {
  return { name, args, cwd: HOME, status: 0, stdout: '', pipeline: 0, stage: 0, stages: 1, redirects: [], ...fields };
}
