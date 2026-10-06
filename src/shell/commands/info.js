/**
 * Commands that report on the user and the machine, plus echo and clear.
 */

import { result } from '../result.js';
import { localeQuote } from '../quote.js';
import { parseOptions } from '../options.js';
import { builtinOptions } from '../builtins.js';
import { TERMINAL } from '../system.js';

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
  return o.error ? result('', o.error, 2) : result(`${sys.cwd}\n`);
}

function whoami(args, { sys }) {
  const o = parseOptions('whoami', args, '');
  let r = result(`${sys.user}\n`);
  if (o.err) r = result('', o.err, 1);
  else if (o.rest.length) r = result('', `whoami: extra operand ${localeQuote(o.rest[0])}\nTry 'whoami --help' for more information.`, 1);
  return r;
}

function uname(args, { sys }) {
  const o = parseOptions('uname', args, 'asnrvmpio');
  if (o.err) return result('', o.err, 1);
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
  let r = result(text);
  if (o.err) r = result('', o.err, 1);
  else if (o.rest.length > 2) r = result('', `who: extra operand ${localeQuote(o.rest[2])}\nTry 'who --help' for more information.`, 1);
  return r;
}

function id(args, { sys }) {
  const o = parseOptions('id', args, 'ugGnr');
  if (o.err) return result('', o.err, 1);
  const f = o.flags;
  const show = (num, name) => (f.has('n') ? name : String(num));
  let text = `uid=1000(${sys.user}) gid=1000(${sys.user}) groups=1000(${sys.user})`;
  if (f.has('u')) text = show(1000, sys.user);
  else if (f.has('g')) text = show(1000, sys.user);
  else if (f.has('G')) text = sys.groups.map(g => show(1000, g)).join(' ');
  return result(`${text}\n`);
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
  groups: (_args, { sys }) => result(`${sys.groups.join(' ')}\n`),
  hostname: (_args, { sys }) => result(`${sys.host}\n`),
  true: () => result(),
  false: () => result('', '', 1),
  uname,
  date: (_args, { sys }) => result(`${formatDate(sys.now())}\n`),
  clear,
  echo,
};
