/**
 * Commands that report on the user and the machine, plus echo and clear.
 */

import { result, withNote } from '../result.js';
import { localeQuote } from '../quote.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { versionText } from '../versions.js';
import { builtinOptions } from '../builtins.js';
import { TERMINAL } from '../system.js';
import { findUser, memberGroups, groupNames } from '../accounts.js';
import { resolve } from '../paths.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CLEAR_USAGE = 'Usage: clear [options]\n\nOptions:\n  -T TERM     use this instead of $TERM\n  -V          print curses-version\n  -x          do not try to clear scrollback';

function clear(args) {
  const badOption = args.find(a => a.startsWith('-') && !/^-(x|V|T.+)$/.test(a));
  const operand = args.find(a => !a.startsWith('-'));
  let r = result(args.includes('-x') ? CLEAR_SCREEN.replace('\u001b[3J', '') : CLEAR_SCREEN);
  if (badOption) r = result('', `clear: invalid option -- '${badOption[1] ?? '-'}'\n${CLEAR_USAGE}`, 1);
  else if (operand) r = result('', CLEAR_USAGE, 1);
  else if (args.includes('-V')) r = result('ncurses 6.4.20240113\n');
  return r;
}

export const CLEAR_SCREEN = '\u001b[H\u001b[2J\u001b[3J';
const two = n => String(n).padStart(2, '0');

/**
 * Format a time like `date` does in the C locale with TZ=UTC.
 *
 * @param {number} ms Milliseconds since the epoch.
 * @returns {string} For example `Tue Oct  6 10:00:00 UTC 2026`.
 */
export function formatDate(ms) {
  const d = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2);
  const time = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${day} ${time} UTC ${d.getUTCFullYear()}`;
}

const UNAME_FIELDS = { s: () => 'Linux', n: sys => sys.host, r: () => '6.8.0-kernelia', v: () => '#1 SMP PREEMPT_DYNAMIC', m: () => 'x86_64', p: () => 'x86_64', i: () => 'x86_64', o: () => 'GNU/Linux' };

function pwd(args, { sys }) {
  const o = builtinOptions('pwd', args, 'LP');
  const physical = [...o.flags].at(-1) === 'P';
  return o.error ? result('', o.error, 2) : result(`${physical ? resolve(sys, sys.cwd).abs : sys.cwd}\n`);
}

function whoami(args, { sys }) {
  const o = parseOptions('whoami', args, '');
  const failed = optionFailure('whoami', o, 1);
  let r = result(`${sys.user}\n`);
  if (failed) r = failed;
  else if (o.rest.length) r = result('', `whoami: extra operand ${localeQuote(o.rest[0])}\nTry 'whoami --help' for more information.`, 1);
  return r;
}

function uname(args, { sys }) {
  const o = parseOptions('uname', args, 'asnrvmpio');
  const failed = optionFailure('uname', o, 1);
  if (failed) return failed;
  if (o.rest.length) return result('', `uname: extra operand ${localeQuote(o.rest[0])}\nTry 'uname --help' for more information.`, 1);
  const all = o.flags.has('a');
  let keys = 'snrvmpio'.split('').filter(k => o.flags.has(k) || (all && !'pi'.includes(k)));
  if (!keys.length) keys = ['s'];
  return result(`${keys.map(k => UNAME_FIELDS[k](sys)).join(' ')}\n`);
}

const WHO_HEADING = 'NAME     LINE         TIME             COMMENT\n';

function loginLine({ user, line, time }) {
  const d = new Date(time);
  const date = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  return `${user.padEnd(8)} ${line.padEnd(12)} ${date}\n`;
}

/**
 * The machine's only login record is the player's session on the terminal.
 * A FILE operand names another record file, and the simulator has none, so
 * it lists no one. `-m` (or any two operands, like `am i`) keeps the record of
 * the terminal on standard input, so it lists no one when input is redirected.
 */
function who(args, { sys, stdin }) {
  const o = parseOptions('who', args, 'Hmqs');
  const records = o.rest.length === 1 ? [] : [{ user: sys.user, line: TERMINAL, time: sys.loginTime }];
  const onlyStdin = o.flags.has('m') || o.rest.length === 2;
  const shown = onlyStdin && stdin != null ? [] : records;
  let text = (o.flags.has('H') ? WHO_HEADING : '') + shown.map(loginLine).join('');
  if (o.flags.has('q')) text = `${records.map(r => r.user).join(' ')}\n# users=${records.length}\n`;
  const failed = optionFailure('who', o, 1);
  let r = result(text);
  if (failed) r = failed;
  else if (o.rest.length > 2) r = result('', `who: extra operand ${localeQuote(o.rest[2])}\nTry 'who --help' for more information.`, 1);
  return r;
}

const HOSTNAME_USAGE = `Usage: hostname [-b] {hostname|-F file}         set host name (from file)
       hostname [-a|-A|-d|-f|-i|-I|-s|-y]       display formatted name
       hostname                                 display host name

       {yp,nis,}domainname {nisdomain|-F file}  set NIS domain name (from file)
       {yp,nis,}domainname                      display NIS domain name

       dnsdomainname                            display dns domain name

       hostname -V|--version|-h|--help          print info and exit

Program name:
       {yp,nis,}domainname=hostname -y
       dnsdomainname=hostname -d

Program options:
    -a, --alias            alias names
    -A, --all-fqdns        all long host names (FQDNs)
    -b, --boot             set default hostname if none available
    -d, --domain           DNS domain name
    -f, --fqdn, --long     long host name (FQDN)
    -F, --file             read host name or NIS domain name from given file
    -i, --ip-address       addresses for the host name
    -I, --all-ip-addresses all addresses for the host
    -s, --short            short host name
    -y, --yp, --nis        NIS/YP domain name

Description:
   This command can get or set the host name or the NIS domain name. You can
   also get the DNS domain or the FQDN (fully qualified domain name).
   Unless you are using bind or NIS for host lookups you can change the
   FQDN (Fully Qualified Domain Name) and the DNS domain name (which is
   part of the FQDN) in the /etc/hosts file.`;
const HOSTNAME_LONG = {
  '--version': 'V', '--help': 'h', '--short': 's', '--boot': 'b', '--file': 'F', '--alias': 'a', '--all-fqdns': 'A',
  '--domain': 'd', '--fqdn': 'f', '--long': 'f', '--ip-address': 'i', '--all-ip-addresses': 'I', '--yp': 'y', '--nis': 'y',
};
const NETWORK_OPTIONS = 'aAdfiIy';
const optionLetters = arg => HOSTNAME_LONG[arg] ?? (arg.startsWith('--') ? '' : arg.slice(1));

/**
 * The net-tools hostname. -V and -h act in the order given; options that look
 * up names on the network are not simulated and say so.
 */
function hostname(args, { sys }) {
  const long = mapLongOptions('hostname', args, HOSTNAME_LONG);
  const o = parseOptions('hostname', long.args, 'VhsbaAdfiIy', 'F');
  const error = long.err ?? o.err;
  const action = [...o.flags].find(f => 'Vh'.includes(f));
  const network = args.find(a => a.startsWith('-') && [...optionLetters(a)].some(l => NETWORK_OPTIONS.includes(l)));
  let r = result(`${sys.host}\n`);
  if (error) r = result(`${HOSTNAME_USAGE}\n`, error.split('\n')[0], 255);
  else if (action === 'V') r = result(versionText('hostname'));
  else if (action === 'h') r = result(`${HOSTNAME_USAGE}\n`, '', 255);
  else if (o.rest.length > 1) r = result('', HOSTNAME_USAGE, 255);
  else if (o.rest.length === 1 || 'F' in o.vals) r = result('', 'hostname: you must be root to change the host name', 1);
  else if (network) r = withNote(result('', '', 1), `hostname ${network} looks up the network, which this game does not simulate.`);
  return r;
}

const ID_LONG = { '--user': 'u', '--group': 'g', '--groups': 'G', '--name': 'n', '--real': 'r' };
const noSuchUser = (name, spec) => `${name}: ${localeQuote(spec)}: no such user`;

// Who an id or groups operand names, or the shell itself (its login groups).
function identity(sys, spec) {
  if (spec !== undefined) {
    const user = findUser(sys, spec);
    return user && { user, groups: memberGroups(sys, user) };
  }
  const names = groupNames(sys);
  return { user: findUser(sys, sys.user), groups: sys.gids.map((gid, i) => ({ gid, name: names[i] === String(gid) ? null : names[i] })) };
}

const withName = (num, name) => (name === null ? String(num) : `${num}(${name})`);

function idLine(who, f) {
  const [primary] = who.groups;
  const show = (num, name) => (f.has('n') ? name ?? String(num) : String(num));
  let text = `uid=${withName(who.user.uid, who.user.name)} gid=${withName(primary.gid, primary.name)} groups=${who.groups.map(g => withName(g.gid, g.name)).join(',')}`;
  if (f.has('u')) text = show(who.user.uid, who.user.name);
  else if (f.has('g')) text = show(primary.gid, primary.name);
  else if (f.has('G')) text = who.groups.map(g => show(g.gid, g.name)).join(' ');
  return `${text}\n`;
}

function id(args, { sys }) {
  const long = mapLongOptions('id', args, ID_LONG);
  const o = long.err || long.unsimulated ? long : parseOptions('id', long.args, 'ugGnra');
  const failed = optionFailure('id', o, 1);
  if (failed) return failed;
  const f = o.flags;
  const only = ['u', 'g', 'G'].filter(x => f.has(x)).length;
  if (only > 1) return result('', 'id: cannot print "only" of more than one choice', 1);
  if (!only && (f.has('n') || f.has('r'))) return result('', 'id: cannot print only names or real IDs in default format', 1);
  const specs = o.rest.length ? o.rest : [undefined];
  const found = specs.map(spec => ({ spec, who: identity(sys, spec) }));
  const errs = found.filter(x => !x.who).map(x => noSuchUser('id', x.spec));
  return result(found.filter(x => x.who).map(x => idLine(x.who, f)).join(''), errs.join('\n'), errs.length ? 1 : 0);
}

function groups(args, { sys }) {
  const o = parseOptions('groups', args, '');
  const failed = optionFailure('groups', o, 1);
  if (failed) return failed;
  const names = who => who.groups.map(g => g.name ?? String(g.gid)).join(' ');
  if (!o.rest.length) return result(`${names(identity(sys))}\n`);
  const found = o.rest.map(spec => ({ spec, who: identity(sys, spec) }));
  const errs = found.filter(x => !x.who).map(x => noSuchUser('groups', x.spec));
  return result(found.filter(x => x.who).map(x => `${x.spec} : ${names(x.who)}\n`).join(''), errs.join('\n'), errs.length ? 1 : 0);
}

const ECHO_ESCAPES = { a: '\u0007', b: '\b', e: '\u001b', E: '\u001b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };

/**
 * Interpret the backslash escapes of `echo -e`. Text after `\c` is dropped.
 *
 * @param {string} text The joined arguments.
 * @returns {{text: string, stop: boolean}} The text, and whether `\c` cut it short.
 */
export function echoEscapes(text) {
  const stop = text.search(/\\c/);
  const kept = stop < 0 ? text : text.slice(0, stop);
  const decoded = kept.replace(/\\(0[0-7]{0,3}|x[0-9A-Fa-f]{1,2}|.)/g, (m, e) => {
    if (e[0] === '0') return String.fromCharCode(parseInt(e.slice(1) || '0', 8));
    if (e[0] === 'x' && e.length > 1) return String.fromCharCode(parseInt(e.slice(1), 16));
    return ECHO_ESCAPES[e] ?? m;
  });
  return { text: decoded, stop: stop >= 0 };
}

function echo(args) {
  let newline = true;
  let escapes = false;
  let i = 0;
  while (i < args.length && /^-[neE]+$/.test(args[i])) {
    for (const flag of args[i].slice(1)) {
      if (flag === 'n') newline = false;
      else escapes = flag === 'e';
    }
    i++;
  }
  const decoded = escapes ? echoEscapes(args.slice(i).join(' ')) : { text: args.slice(i).join(' '), stop: false };
  return result(decoded.text + (newline && !decoded.stop ? '\n' : ''));
}

export default {
  pwd,
  whoami,
  who,
  id,
  groups,
  hostname,
  true: () => result(),
  false: () => result('', '', 1),
  uname,
  date: (_args, { sys }) => result(`${formatDate(sys.now())}\n`),
  clear,
  echo,
};
