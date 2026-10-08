/**
 * The table of every simulated command, by name.
 */

import info from './info.js';
import nav from './nav.js';
import ls from './ls.js';
import files from './files.js';
import text from './text.js';
import grep from './grep.js';
import find from './find.js';
import copy from './copy.js';
import procs from './procs.js';
import shell from './shell.js';
import conditional from './test.js';
import printf from './printf.js';
import owner from './owner.js';
import links from './links.js';
import sudo from './sudo.js';
import jobs from './jobs.js';
import { NO_BINARY } from '../builtins.js';
import { nameTable } from '../table.js';

/** @type {Record<string, (args: string[], ctx: object) => import('../result.js').Result>} */
export const COMMANDS = Object.freeze(nameTable({ ...info, ...nav, ...ls, ...files, ...copy, ...text, ...grep, ...find, ...procs, ...shell, ...conditional, ...printf, ...owner, ...links, ...sudo, ...jobs }));

/** Commands that are programs, with one executable file each in /usr/bin. */
export const BINARIES = Object.keys(COMMANDS).filter(name => !NO_BINARY.has(name)).sort();
