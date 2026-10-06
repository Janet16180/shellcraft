/**
 * Commands that report on the user and the machine, plus echo and clear.
 */

import { result } from '../result.js';
import { localeQuote } from '../quote.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

function uname(args, { sys }) {
  let text = 'Linux';
  if (args.includes('-a')) text = `Linux ${sys.host} 6.8.0-kernelia #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`;
  else if (args.includes('-r')) text = '6.8.0-kernelia';
  return result(`${text}\n`);
}

function echo(args) {
  let newline = true;
  let escapes = false;
  let i = 0;
  while (i < args.length && /^-[neE]+$/.test(args[i])) {
    if (args[i].includes('n')) newline = false;
    if (args[i].includes('e')) escapes = true;
    i++;
  }
  let text = args.slice(i).join(' ');
  if (escapes) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  return result(text + (newline ? '\n' : ''));
}

export default {
  pwd: (_args, { sys }) => result(`${sys.cwd}\n`),
  whoami: (args, { sys }) => (args.length
    ? result('', `whoami: extra operand ${localeQuote(args[0])}\nTry 'whoami --help' for more information.`, 1)
    : result(`${sys.user}\n`)),
  id: (_args, { sys }) => result(`uid=1000(${sys.user}) gid=1000(${sys.user}) groups=1000(${sys.user})\n`),
  groups: (_args, { sys }) => result(`${sys.groups.join(' ')}\n`),
  hostname: (_args, { sys }) => result(`${sys.host}\n`),
  true: () => result(),
  false: () => result('', '', 1),
  uname,
  date: (_args, { sys }) => result(`${formatDate(sys.now())}\n`),
  clear: () => result(CLEAR_SCREEN),
  echo,
};
