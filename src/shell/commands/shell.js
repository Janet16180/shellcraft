/**
 * The shell's own commands and helpers: man, history, which, type, alias,
 * export, env, printenv, sudo, editors, exit, bash, help.
 */

import { lookup, normalize, joinPath } from '../fs.js';
import { BUILTINS } from '../builtins.js';
import { can } from '../perms.js';
import { manText, hasManPage } from '../man.js';
import { result, withNote } from '../result.js';
import { baseEnvironment, varValue } from '../vars.js';

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

function man(args) {
  if (!args.length) return result('', "What manual page do you want?\nFor example, try 'man man'.", 1);
  if (!hasManPage(args[0])) return result('', `No manual entry for ${args[0]}`, 16);
  return withNote(result(manText(args[0], false)), 'A real man page opens in a pager: arrow keys to scroll, / to search, q to quit.');
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
    else if (BUILTINS.has(x)) out.push(`${x} is a shell builtin`);
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

function exportVars(args, { sys }) {
  for (const x of args) {
    const i = x.indexOf('=');
    if (i > 0) sys.vars[x.slice(0, i)] = x.slice(i + 1);
  }
  return result();
}

function env(_args, { sys }) {
  const all = { ...baseEnvironment(sys), ...sys.vars };
  return result(Object.entries(all).map(([k, v]) => `${k}=${v}\n`).join(''));
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
  export: exportVars,
  env,
  printenv: (args, ctx) => (args.length ? result(args.map(a => `${varValue(ctx.sys, a)}\n`).join('')) : env(args, ctx)),
  sudo,
  nano: editor('nano', 'In real nano, Ctrl+O saves and Ctrl+X exits.'),
  vim: editor('vim', 'Real vim tip: press Esc, type :wq and Enter to save and quit, or :q! to quit without saving.'),
  vi: editor('vi', 'Real vi tip: press Esc, type :wq and Enter to save and quit, or :q! to quit without saving.'),
  exit,
  logout: exit,
  bash,
  sh: bash,
  help: () => withNote(result(`${HELP}\n`), 'In real bash, help lists the shell builtins. Use man COMMAND to learn any real command.'),
};
