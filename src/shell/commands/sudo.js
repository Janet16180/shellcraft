/**
 * sudo 1.9.15 as Ubuntu 24.04 ships it: run one command as root (or the
 * user of -u) when the policy in /etc/sudoers allows it, after the player
 * types their own password. A correct password is remembered for 15 minutes
 * of the machine's clock (`sys.sudoStamp`); -k forgets it.
 *
 * The prompt and "Sorry, try again." go to the terminal, not to standard
 * error, as sudo writes them to /dev/tty. The password is read with
 * `ctx.ask`; when no answer is ready yet the command stops and the line waits
 * for one (see `createSimBackend`).
 *
 * Not simulated: a root shell (-i, -s, and su or a bare shell as the command), the long list format (-ll), sudo's
 * environment handling (env_reset, SUDO_USER), and the rarer options, which
 * end with a note.
 */

import { resolve } from '../paths.js';
import { lookup, normalize } from '../fs.js';
import { findUser, memberGroups, groupNames } from '../accounts.js';
import { varValue } from '../vars.js';
import { TERMINAL } from '../system.js';
import { result, withNote } from '../result.js';
import { readPolicy, rulesFor, decide, securePath, listing, listNeedsPassword, validateNeedsPassword } from '../sudoers.js';

const STAMP_MS = 15 * 60 * 1000;
const TRIES = 3;
const AUTH_LOG = '/var/log/auth.log';

const USAGE = `usage: sudo -h | -K | -k | -V
usage: sudo -v [-ABkNnS] [-g group] [-h host] [-p prompt] [-u user]
usage: sudo -l [-ABkNnS] [-g group] [-h host] [-p prompt] [-U user]
            [-u user] [command [arg ...]]
usage: sudo [-ABbEHkNnPS] [-r role] [-t type] [-C num] [-D directory]
            [-g group] [-h host] [-p prompt] [-R directory] [-T timeout]
            [-u user] [VAR=value] [-i | -s] [command [arg ...]]
usage: sudo -e [-ABkNnS] [-r role] [-t type] [-C num] [-D directory]
            [-g group] [-h host] [-p prompt] [-R directory] [-T timeout]
            [-u user] file ...`;

const HELP = `sudo - execute a command as another user

${USAGE}

Options:
  -A, --askpass                 use a helper program for password prompting
  -b, --background              run command in the background
  -B, --bell                    ring bell when prompting
  -C, --close-from=num          close all file descriptors >= num
  -D, --chdir=directory         change the working directory before running
                                command
  -E, --preserve-env            preserve user environment when running command
      --preserve-env=list       preserve specific environment variables
  -e, --edit                    edit files instead of running a command
  -g, --group=group             run command as the specified group name or ID
  -H, --set-home                set HOME variable to target user's home dir
  -h, --help                    display help message and exit
  -h, --host=host               run command on host (if supported by plugin)
  -i, --login                   run login shell as the target user; a command
                                may also be specified
  -K, --remove-timestamp        remove timestamp file completely
  -k, --reset-timestamp         invalidate timestamp file
  -l, --list                    list user's privileges or check a specific
                                command; use twice for longer format
  -n, --non-interactive         non-interactive mode, no prompts are used
  -P, --preserve-groups         preserve group vector instead of setting to
                                target's
  -p, --prompt=prompt           use the specified password prompt
  -R, --chroot=directory        change the root directory before running command
  -r, --role=role               create SELinux security context with specified
                                role
  -S, --stdin                   read password from standard input
  -s, --shell                   run shell as the target user; a command may
                                also be specified
  -t, --type=type               create SELinux security context with specified
                                type
  -T, --command-timeout=timeout terminate command after the specified time limit
  -U, --other-user=user         in list mode, display privileges for user
  -u, --user=user               run command (or edit file) as specified user
                                name or ID
  -V, --version                 display version information and exit
  -v, --validate                update user's timestamp without running a
                                command
  --                            stop processing command line arguments
`;

const VERSION = `Sudo version 1.9.15p5
Sudoers policy plugin version 1.9.15p5
Sudoers file grammar version 50
Sudoers I/O plugin version 1.9.15p5
Sudoers audit plugin version 1.9.15p5
`;

const KNOWN = 'hiKklnsVv';
const OTHER_FLAGS = 'ABbEeHNPS';
const OTHER_VALUES = 'aCcDgpRrTtU';
const LONG = {
  '--user': 'u', '--list': 'l', '--validate': 'v', '--reset-timestamp': 'k', '--remove-timestamp': 'K', '--non-interactive': 'n',
  '--login': 'i', '--shell': 's', '--help': 'h', '--version': 'V',
};
const OTHER_LONG = ['--askpass', '--background', '--bell', '--close-from', '--chdir', '--preserve-env', '--edit', '--group', '--set-home',
  '--host', '--preserve-groups', '--prompt', '--chroot', '--role', '--stdin', '--type', '--command-timeout', '--other-user'];

export const ROOT_SHELL = 'sudo -i, sudo -s, sudo su and sudo bash open a root shell, where every command runs as root until you type exit. The game does not simulate a root shell: put sudo in front of the one command that needs root instead.';
const noPassword = user => `Real sudo asks for ${user}'s password here. This world has not given ${user} a password, so the game skips that step.`;

function longOption(arg, args, i, o) {
  const [name, ...value] = arg.split('=');
  const letter = LONG[name];
  let next = i;
  if (letter === 'u' && !value.length && args[i + 1] === undefined) o.err = `sudo: option '${name}' requires an argument`;
  else if (letter === 'u') o.user = value.length ? value.join('=') : args[++next];
  else if (letter) o.flags.add(letter);
  else if (OTHER_LONG.includes(name)) o.unsimulated ??= name;
  else o.err = `sudo: unrecognized option '${arg}'`;
  return next;
}

function shortOptions(arg, args, i, o) {
  let next = i;
  for (let j = 1; j < arg.length && !o.err; j++) {
    const letter = arg[j];
    const value = arg.slice(j + 1) || args[next + 1];
    if (letter === 'u' || OTHER_VALUES.includes(letter)) {
      if (value === undefined) o.err = `sudo: option requires an argument -- '${letter}'`;
      else if (letter === 'u') o.user = value;
      else o.unsimulated ??= `-${letter}`;
      if (!arg.slice(j + 1)) next++;
      break;
    }
    if (KNOWN.includes(letter)) o.flags.add(letter);
    else if (OTHER_FLAGS.includes(letter)) o.unsimulated ??= `-${letter}`;
    else o.err = `sudo: invalid option -- '${letter}'`;
  }
  return next;
}

// Options stop at the first word that is not one, as sudo's getopt does.
function parseSudo(args) {
  const o = { flags: new Set(), user: null, err: null, unsimulated: null, command: [] };
  let i = 0;
  for (; i < args.length && !o.err; i++) {
    const arg = args[i];
    if (arg === '--') {
      i++;
      break;
    }
    if (!arg.startsWith('-') || arg === '-') break;
    i = arg.startsWith('--') ? longOption(arg, args, i, o) : shortOptions(arg, args, i, o);
  }
  o.command = o.err ? [] : args.slice(i);
  return o;
}

function logAuth(sys, lines) {
  const node = lookup(sys.root, AUTH_LOG);
  if (node?.type !== 'file') return;
  const stamp = new Date(sys.now()).toISOString().replace('Z', '000+00:00');
  node.content += lines.map(line => `${stamp} ${sys.host} sudo: ${line}\n`).join('');
  node.mtime = sys.now();
}

const commandLog = (job, event) => `    ${job.me.name} : ${event ? `${event} ; ` : ''}TTY=${TERMINAL} ; PWD=${job.sys.cwd} ; USER=${job.target.name} ; COMMAND=${job.shown}`;

// What logging in as the target gives: its groups, and pam_umask's 002 for a
// user whose primary group is their own, same name and same id (Ubuntu's USERGROUPS_ENAB).
function identity(sys, account) {
  const groups = memberGroups(sys, account);
  const own = account.uid !== 0 && account.uid === account.gid && groups[0]?.name === account.name;
  return { user: account.name, gids: groups.map(g => g.gid), umask: own ? 0o002 : 0o022 };
}

// The program sudo would run, searched on secure_path as the target user.
function findProgram(sys, name, policy) {
  if (name.includes('/')) {
    const r = resolve(sys, name);
    return r.node?.type === 'file' && (r.node.mode & 0o111) ? normalize(name, sys.cwd) : null;
  }
  const dirs = securePath(policy) ?? varValue(sys, 'PATH').split(':');
  return dirs.map(d => `${d}/${name}`).find(p => {
    const node = lookup(sys.root, p);
    return node?.type === 'file' && (node.mode & 0o111) !== 0;
  }) ?? null;
}

function notFound(name) {
  const lines = [`sudo: ${name}: command not found`];
  if (name === 'cd') {
    lines.push('sudo: "cd" is a shell built-in command, it cannot be run directly.', 'sudo: the -s option may be used to run a privileged shell.',
      'sudo: the -D option may be used to run a command in a specific directory.');
  }
  return result('', lines.join('\n'), 1);
}

const fresh = (sys, opts) => !opts.flags.has('k') && sys.sudoStamp !== null && sys.now() - sys.sudoStamp < STAMP_MS;

// Ask for the password up to three times. An answer of null is Ctrl+C.
function authenticate(job, ctx) {
  const { sys, me } = job;
  const prompt = `[sudo] password for ${me.name}: `;
  let failures = 0;
  let outcome = null;
  while (!outcome) {
    const answer = ctx.ask(prompt);
    if (answer.waiting) {
      outcome = { waiting: true };
      break;
    }
    ctx.tty(`${prompt}\n`);
    if (answer.text === sys.password) outcome = { ok: true };
    else if (answer.text === null) outcome = { outcome: 'cancelled', err: failures ? `sudo: ${failures} incorrect password attempt${failures > 1 ? 's' : ''}` : 'sudo: a password is required' };
    else {
      failures++;
      if (failures === 1) logAuth(sys, [`pam_unix(sudo:auth): authentication failure; logname=${me.name} uid=${me.uid} euid=0 tty=/dev/${TERMINAL} ruser=${me.name} rhost=  user=${me.name}`]);
      if (failures < TRIES) ctx.tty('Sorry, try again.\n');
      else outcome = { outcome: 'failed', err: `sudo: ${TRIES} incorrect password attempts`, log: `${TRIES} incorrect password attempts` };
    }
  }
  if (outcome.log) logAuth(sys, [commandLog(job, outcome.log)]);
  return outcome;
}

// Prove who you are if the policy needs it. Returns null when sudo may go on,
// else the result that ends it.
function prove(job, ctx, needed) {
  const { sys, opts } = job;
  let r = null;
  job.auth = 'not-needed';
  if (!needed || sys.user === 'root') return null;
  if (sys.password === null) job.note = noPassword(sys.user);
  else if (opts.flags.has('n')) {
    job.auth = 'cancelled';
    r = result('', 'sudo: a password is required', 1);
  } else {
    const auth = authenticate(job, ctx);
    job.auth = auth.ok ? 'ok' : auth.outcome ?? null;
    if (auth.waiting) r = { ...result('', '', 1), abort: true };
    else if (auth.err) r = result('', auth.err, 1);
  }
  return r;
}

function refuse(job) {
  const { sys, me, target, rules } = job;
  const stranger = !rules.length;
  job.auth = 'not-allowed';
  logAuth(sys, [commandLog(job, stranger ? 'user NOT in sudoers' : 'command not allowed')]);
  const text = stranger ? `${me.name} is not in the sudoers file.` : `Sorry, user ${me.name} is not allowed to execute '${job.shown}' as ${target.name} on ${sys.host}.`;
  return result('', text, 1);
}

// su or a shell with nothing to run: a root shell, not simulated. `bash -c CMD` and `su -c CMD` run a command.
function opensShell(name, args) {
  const base = name.split('/').pop();
  const runs = args.some(a => a === '-c' || a.startsWith('--command') || /^-[a-z]*c/.test(a));
  if (base === 'su') return !runs;
  return ['bash', 'sh', 'dash'].includes(base) && args.every(a => ['-', '-l', '-i', '-il', '-li', '--login'].includes(a));
}

function runCommand(job, ctx) {
  const { sys, me, target, opts } = job;
  const [name, ...args] = opts.command;
  const who = identity(sys, target);
  const path = ctx.runAs(who, () => findProgram(sys, name, job.policy));
  job.shown = [path ?? name, ...args].join(' ');
  const decision = decide(job.rules, { target: target.name, path: path ?? name, args });
  const stop = prove(job, ctx, !(decision.allowed && (decision.nopasswd || fresh(sys, opts))));
  if (stop) return stop;
  if (!decision.allowed) return refuse(job);
  if (!opts.flags.has('k')) sys.sudoStamp = sys.now();
  if (!path) return notFound(name);
  if (opensShell(name, args)) return withNote(result('', '', 1), ROOT_SHELL);
  logAuth(sys, [commandLog(job, null), `pam_unix(sudo:session): session opened for user ${target.name}(uid=${target.uid}) by ${me.name}(uid=${me.uid})`]);
  const r = ctx.runAs(who, () => ctx.program(path, args));
  logAuth(sys, [`pam_unix(sudo:session): session closed for user ${target.name}`]);
  return { ...r, inner: { name, args, asUser: target.name, status: r.status, ran: true } };
}

function maySudo(job, ctx, needed) {
  const stop = prove(job, ctx, needed);
  let r = stop;
  if (!stop && !job.rules.length) {
    job.auth = 'not-allowed';
    r = result('', `Sorry, user ${job.me.name} may not run sudo on ${job.sys.host}.`, 1);
  }
  if (!stop && !job.rules.length) logAuth(job.sys, [commandLog(job, 'command not allowed')]);
  return r;
}

function list(job, ctx) {
  const { sys, opts } = job;
  job.shown = ['list', ...opts.command].join(' ');
  const stop = maySudo(job, ctx, listNeedsPassword(job.rules) && !fresh(sys, opts));
  if (stop) return stop;
  if (!opts.flags.has('k')) sys.sudoStamp = sys.now();
  if (!opts.command.length) return result(listing(sys, job.policy, job.rules, job.me.name, ctx.piped ? 0 : sys.columns));
  const [name, ...args] = opts.command;
  const path = ctx.runAs(identity(sys, job.target), () => findProgram(sys, name, job.policy));
  if (!path) return notFound(name);
  const allowed = decide(job.rules, { target: job.target.name, path, args }).allowed;
  return allowed ? result(`${[path, ...args].join(' ')}\n`) : result('', '', 1);
}

function validate(job, ctx) {
  job.shown = 'validate';
  const stop = maySudo(job, ctx, validateNeedsPassword(job.rules) && !fresh(job.sys, job.opts));
  if (!stop) job.sys.sudoStamp = job.sys.now();
  return stop ?? result();
}

const forgets = o => o.flags.has('K') || (o.flags.has('k') && !o.command.length && !o.flags.has('l') && !o.flags.has('v'));
const misused = o => (!o.command.length && !o.flags.has('l') && !o.flags.has('v')) || (o.flags.has('l') && o.user !== null && !o.command.length);

// What sudo answers before it reads the policy: errors, help, version, -k and -K.
function early(o, sys) {
  let r = null;
  if (o.err) r = result('', `${o.err}\n${USAGE}`, 1);
  else if (o.unsimulated) r = withNote(result('', '', 1), `sudo ${o.unsimulated} is a real option, but this game does not simulate it.`);
  else if (o.flags.has('h')) r = result(HELP);
  else if (o.flags.has('V')) r = result(VERSION);
  else if (forgets(o)) r = result();
  else if (o.flags.has('i') || o.flags.has('s')) r = withNote(result('', '', 1), ROOT_SHELL);
  else if (misused(o)) r = result('', USAGE, 1);
  if (forgets(o) && !o.err && !o.unsimulated) sys.sudoStamp = null;
  return r;
}

function sudo(args, ctx) {
  const { sys } = ctx;
  const opts = parseSudo(args);
  const stop = early(opts, sys);
  if (stop) return { ...stop, auth: null };
  const target = findUser(sys, opts.user ?? 'root');
  if (!target) return { ...result('', `sudo: unknown user ${opts.user}\nsudo: error initializing audit plugin sudoers_audit`, 1), auth: null };
  const policy = readPolicy(sys);
  const me = findUser(sys, sys.user);
  const job = { sys, opts, target, policy, me, rules: rulesFor(sys, policy, sys.user, groupNames(sys)), shown: '', note: null, auth: null };
  let r;
  if (opts.flags.has('l')) r = list(job, ctx);
  else if (opts.flags.has('v') && !opts.command.length) r = validate(job, ctx);
  else r = runCommand(job, ctx);
  r = { ...r, auth: job.auth, inner: r.inner ?? { asUser: target.name, ran: false } };
  return job.note && !r.abort ? withNote(r, [r.note, job.note].filter(Boolean).join(' ')) : r;
}

export default { sudo };
