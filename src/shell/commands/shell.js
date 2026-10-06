/**
 * The shell's own commands and helpers: man, history, which, type, alias,
 * export, env, printenv, sudo, editors, exit, bash, help.
 */

import { lookup, normalize, joinPath } from '../fs.js';
import { BASH_BUILTINS, BUILTIN_HELP, builtinHelp } from '../builtins.js';
import { can } from '../perms.js';
import { manText, hasManPage, manEntries } from '../man.js';
import { compilePosix } from '../regex.js';
import { result, withNote } from '../result.js';
import { varValue, setVar, exportedVars } from '../vars.js';
import { compareNames } from '../collate.js';

/**
 * Find a command's program the way PATH lookup does.
 *
 * @param {object} sys The machine state.
 * @param {string} name A command name.
 * @returns {string|null} The absolute path of the first executable file found, or null.
 */
export function findInPath(sys, name) {
  const hit = varValue(sys, 'PATH').split(':').filter(Boolean).map(d => joinPath(d, name)).find(p => {
    const node = lookup(sys.root, p);
    return node && node.type === 'file' && can(sys, node, 'x');
  });
  return hit ?? null;
}

const SECTION = /^[1-9]$/;
const SMALL_MANUAL = "This game's manual holds only the pages of the commands it simulates, so a real man -k finds many more.";

function summaryLine(entry, width) {
  const line = `${`${entry.name} (1)`.padEnd(20)} - ${entry.description}`;
  return width && line.length > width ? `${line.slice(0, width - 3)}...` : line;
}

function lookupPages(mode, keywords, width) {
  const byName = (a, b) => compareNames(a.name.toLowerCase(), b.name.toLowerCase());
  const entries = manEntries().sort(byName);
  const matchers = keywords.map(k => {
    const re = compilePosix([k], { extended: true, ignoreCase: true }).regex ?? new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return e => (mode === '-f' ? e.name === k : re.test(e.name) || re.test(e.description));
  });
  const found = entries.filter(e => matchers.some(m => m(e)));
  const missing = keywords.filter((k, i) => !entries.some(matchers[i]));
  const errs = (mode === '-f' ? missing : found.length ? [] : keywords).map(k => `${k}: nothing appropriate.`);
  return withNote(result(found.map(e => `${summaryLine(e, width)}\n`).join(''), errs.join('\n'), errs.length ? 16 : 0), mode === '-k' ? SMALL_MANUAL : null);
}

function manPage(name, section) {
  const builtin = name in BUILTIN_HELP ? `${name} is built into bash, so it has no manual page of its own. Try help ${name}.` : null;
  let r;
  if (section && section !== '1') r = result('', `No manual entry for ${name} in section ${section}`, 16);
  else if (!hasManPage(name)) r = withNote(result('', `No manual entry for ${name}`, 16), builtin);
  else r = withNote(result(manText(name, false)), 'A real man page is longer and opens in a pager: arrow keys to scroll, / to search, q to quit.');
  return r;
}

function missingPage(section) {
  const ask = section ? `No manual entry for ${section}\n(Alternatively, what manual page do you want from section ${section}?)` : 'What manual page do you want?';
  return result('', `${ask}\nFor example, try 'man man'.`, 1);
}

function man(args, { sys, piped }) {
  const mode = args[0] === '-k' || args[0] === '-f' ? args[0] : null;
  const section = !mode && SECTION.test(args[0] ?? '') ? args[0] : null;
  const pages = args.slice(mode || section ? 1 : 0);
  let r;
  if (mode && !pages.length) r = result('', mode === '-k' ? 'apropos what?' : 'whatis what?', 1);
  else if (mode) r = lookupPages(mode, pages, piped ? 0 : sys.columns);
  else if (!pages.length) r = missingPage(section);
  else r = manPage(pages[0], section);
  return r;
}

function which(args, { sys }) {
  const hits = args.map(x => findInPath(sys, x)).filter(Boolean);
  return result(hits.map(h => `${h}\n`).join(''), '', hits.length === args.length && args.length ? 0 : 1);
}

function type(args, { sys }) {
  const out = [];
  const errs = [];
  for (const x of args) {
    const path = findInPath(sys, x);
    if (sys.aliases[x]) out.push(`${x} is aliased to \`${sys.aliases[x]}'`);
    else if (BASH_BUILTINS.has(x)) out.push(`${x} is a shell builtin`);
    else if (path && sys.hashed.has(x)) out.push(`${x} is hashed (${path})`);
    else if (path) out.push(`${x} is ${path}`);
    else errs.push(`bash: type: ${x}: not found`);
  }
  return result(out.map(l => `${l}\n`).join(''), errs.join('\n'), errs.length ? 1 : 0);
}

function alias(args, { sys }) {
  const show = name => `alias ${name}='${sys.aliases[name]}'\n`;
  let r = result();
  if (!args.length) r = result(Object.keys(sys.aliases).sort().map(show).join(''));
  for (const x of args) {
    const i = x.indexOf('=');
    if (i > 0) sys.aliases[x.slice(0, i)] = x.slice(i + 1);
    else if (!sys.aliases[x]) r = result(r.out, [r.err, `bash: alias: ${x}: not found`].filter(Boolean).join('\n'), 1);
    else r = result(r.out + show(x), r.err, r.status);
  }
  return r;
}

function declareLine(name, value) {
  return `declare -x ${name}="${value.replace(/["\\$`]/g, '\\$&')}"\n`;
}

function exportVars(args, { sys }) {
  const listing = !args.length || (args.length === 1 && args[0] === '-p');
  const exported = exportedVars(sys);
  if (listing) return result(Object.keys(exported).sort(compareNames).map(k => declareLine(k, exported[k])).join(''));
  for (const x of args) {
    const i = x.indexOf('=');
    if (i > 0) setVar(sys, x.slice(0, i), x.slice(i + 1), true);
    else setVar(sys, x, varValue(sys, x), true);
  }
  return result();
}

function env(_args, { sys, env: overlay }) {
  const all = { ...exportedVars(sys), ...overlay };
  return result(Object.entries(all).map(([k, v]) => `${k}=${v}\n`).join(''));
}

function printenv(args, ctx) {
  const all = { ...exportedVars(ctx.sys), ...ctx.env };
  const found = args.filter(a => a in all);
  return args.length ? result(found.map(a => `${all[a]}\n`).join(''), '', found.length === args.length ? 0 : 1) : env(args, ctx);
}

function unset(args, { sys }) {
  for (const name of args.filter(a => a !== '-v')) delete sys.vars[name];
  return result();
}

function unalias(args, { sys }) {
  const errs = [];
  if (args[0] === '-a') sys.aliases = {};
  for (const name of args.filter(a => a !== '-a')) {
    if (name in sys.aliases) delete sys.aliases[name];
    else errs.push(`bash: unalias: ${name}: not found`);
  }
  return result('', errs.join('\n'), errs.length ? 1 : 0);
}

function sudo(args, { sys }) {
  if (!args.length) return result('', 'usage: sudo -h | -K | -k | -V\nusage: sudo [-u user] command', 1);
  const r = result('', `[sudo] password for ${sys.user}: \n${sys.user} is not in the sudoers file.  This incident will be reported.`, 1);
  return withNote(r, 'On your own machine, sudo runs one command as the administrator, so read the command twice before pressing Enter.');
}

const editor = (name, quit) => () => withNote(result('', '', 1),
  `${name} is an interactive editor and is not simulated here. ${quit} Here, write files with echo "text" > file or echo "text" >> file.`);

const exit = () => withNote(result(), 'In a real terminal, exit closes the shell (Ctrl+D does the same). Here the shell stays open.');

function bash(args, { sys, runScript }) {
  if (!args.length) return withNote(result(), 'Nested shells are not simulated. In real Linux, bash starts a new shell inside this one (exit leaves it).');
  const node = lookup(sys.root, normalize(args[0], sys.cwd));
  let r;
  if (!node) r = result('', `bash: ${args[0]}: No such file or directory`, 127);
  else if (node.type === 'dir') r = result('', `bash: ${args[0]}: Is a directory`, 126);
  else if (!can(sys, node, 'r')) r = result('', `bash: ${args[0]}: Permission denied`, 126);
  else r = runScript(node);
  return r;
}

function help(args) {
  const missing = args.find(a => !(a in BUILTIN_HELP));
  let r = withNote(result(`${HELP}\n`), 'In real bash, help lists the shell builtins. Use man COMMAND to learn any real command.');
  if (missing) r = result('', `bash: help: no help topics match \`${missing}'.  Try \`help help' or \`man -k ${missing}' or \`info ${missing}'.`, 1);
  else if (args.length) r = withNote(result(args.map(builtinHelp).join('')), 'Real bash prints a longer description for each builtin.');
  return r;
}

const HELP = [
  'Commands you can use here:',
  '  Look around   pwd  ls  cd  tree  whoami  hostname  date',
  '  Read files    cat  less  head  tail  wc',
  '  Change files  touch  mkdir  cp  mv  rm  rmdir  chmod  echo',
  '  Search        grep  find  sort  uniq',
  '  Processes     ps  top  kill  pkill  killall',
  '  Shell         history  clear  man  which  type  alias  export',
  '  Operators     |  >  >>  <  &&  ||  ;',
].join('\n');

export default {
  man,
  history: (_args, { sys }) => result(sys.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}\n`).join('')),
  which,
  type,
  alias,
  unalias,
  unset,
  export: exportVars,
  env,
  printenv,
  sudo,
  nano: editor('nano', 'In real nano, Ctrl+O saves and Ctrl+X exits.'),
  vim: editor('vim', 'Real vim tip: press Esc, type :wq and Enter to save and quit, or :q! to quit without saving.'),
  vi: editor('vi', 'Real vi tip: press Esc, type :wq and Enter to save and quit, or :q! to quit without saving.'),
  exit,
  logout: exit,
  bash,
  sh: bash,
  help,
};
