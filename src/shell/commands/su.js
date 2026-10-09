/**
 * su as on Ubuntu 24.04, where root's password is locked: it asks for the
 * target user's password (hidden, on the terminal) and fails. The game knows
 * no other user's password, so su never switches users; a note points to sudo.
 */

import { findUser } from '../accounts.js';
import { result, withNote } from '../result.js';
import { ROOT_SHELL } from './sudo.js';

const PROMPT = 'Password: ';
const TRY_HELP = "Try 'su --help' for more information.";
const OTHER_LETTERS = 'fgGhmpPsVw';
const OTHER_LONG = ['--help', '--version', '--preserve-environment', '--fast', '--group', '--supp-group', '--shell', '--pty', '--whitelist-environment', '--session-command'];

const lockedNote = 'On Ubuntu, root has no password (its account is locked), so su cannot become root. Put sudo in front of the one command that needs root instead.';
const otherNote = name => `su needs ${name}'s password, which only ${name} knows. If the sudo rules allow it, sudo -u ${name} COMMAND runs one command as ${name}.`;
const selfNote = name => `su ${name} would start a new shell as ${name}, which the game does not simulate.`;

// One short-option word: an error for an unknown letter, a note for a real one the game does not simulate.
function shortWord(a, o) {
  const bad = [...a.slice(1)].find(ch => !'lc'.includes(ch) && !OTHER_LETTERS.includes(ch));
  if (bad) o.err = `su: invalid option -- '${bad}'`;
  else if ([...a.slice(1)].some(ch => OTHER_LETTERS.includes(ch))) o.unsimulated ??= a;
}

// How many words an option takes: -c and -s take the next one.
function optionWord(a, o) {
  const long = a.split('=')[0];
  let used = 1;
  if (a === '-c' || a === '-s' || a === '--command') used = 2;
  else if (OTHER_LONG.includes(long)) o.unsimulated ??= long;
  else if (a.startsWith('--') && long !== '--login' && long !== '--command') o.err = `su: unrecognized option '${a}'`;
  else if (!a.startsWith('--') && a !== '-') shortWord(a, o);
  return used;
}

// The first word that is not an option names the user.
function parseSu(args) {
  const o = { user: null, err: null, unsimulated: null };
  let i = 0;
  while (i < args.length && !o.err && o.user === null) {
    if (args[i].startsWith('-')) i += optionWord(args[i], o);
    else o.user = args[i];
  }
  o.user ??= 'root';
  return o;
}

function su(args, ctx) {
  const { sys } = ctx;
  const o = parseSu(args);
  if (o.err) return result('', `${o.err}\n${TRY_HELP}`, 1);
  if (o.unsimulated) return withNote(result('', '', 1), `su ${o.unsimulated} is a real option, but this game does not simulate it.`);
  const target = findUser(sys, o.user);
  if (!target) return result('', `su: user ${o.user} does not exist or the user entry does not contain all the required fields`, 1);
  if (sys.user === 'root') return withNote(result('', '', 1), ROOT_SHELL);
  const answer = ctx.ask(PROMPT);
  if (answer.waiting) return { ...result('', '', 1), abort: true };
  ctx.tty(`${PROMPT}\n`);
  if (answer.text === null) {
    ctx.cancel();
    return { ...result('', '', 130), key: 'INT', abort: true };
  }
  let note = otherNote(target.name);
  if (target.uid === 0) note = lockedNote;
  else if (target.name === sys.user && answer.text === sys.password) note = selfNote(target.name);
  return withNote(result('', target.name === sys.user && answer.text === sys.password ? '' : 'su: Authentication failure', 1), note);
}

export default { su };
