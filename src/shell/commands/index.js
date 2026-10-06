/**
 * The table of every simulated command, by name.
 */

import info from './info.js';
import nav from './nav.js';
import files from './files.js';
import text from './text.js';
import procs from './procs.js';
import shell from './shell.js';
import { NO_BINARY } from '../builtins.js';

/** @type {Record<string, (args: string[], ctx: object) => import('../result.js').Result>} */
export const COMMANDS = Object.freeze({ ...info, ...nav, ...files, ...text, ...procs, ...shell });

/** Commands that are programs, with one executable file each in /usr/bin. */
export const BINARIES = Object.keys(COMMANDS).filter(name => !NO_BINARY.has(name)).sort();
