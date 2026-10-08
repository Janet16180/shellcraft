/**
 * Running the compound commands `for` and `if`. Their lists run through the
 * executor's runList, which the executor passes in.
 *
 * `io` is `{stdin, sink, message(text, line), expand(words)}`: the input and
 * output of the whole command, a writer for the shell's own messages (named
 * by line in a script), and word expansion in the current shell.
 */

import { setVar } from './vars.js';

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ok = { status: 0, abort: false };
const interrupted = (sh, ran) => ran.abort || sh.jump !== null || sh.exit !== null;

// After the body: a pending break or continue for this loop is used up here;
// one for an outer loop leaves this loop and stays pending.
function landJump(sh) {
  const jump = sh.jump;
  let stop = false;
  if (jump?.count > 1) {
    jump.count--;
    stop = true;
  } else if (jump) {
    sh.jump = null;
    stop = jump.kind === 'break';
  }
  return stop;
}

/**
 * Run `for NAME in WORDS; do LIST; done`: the words are expanded once, then
 * the list runs with NAME set to each. Without `in`, the words are "$@".
 *
 * @param {object} sh The shell.
 * @param {{name: string, words: object[]|null, body: object[], line: number, endLine: number}} cmd The parsed loop.
 * @param {object} io Its input, output and helpers (see the module comment).
 * @param {(sh: object, list: object[], sink: object, stdin: string|null) => {status: number, abort: boolean}} runList The executor's list runner.
 * @returns {{status: number, abort: boolean}} The status of the last command the body ran (0 if none), and whether the line aborts.
 */
export function runFor(sh, cmd, io, runList) {
  const valid = NAME.test(cmd.name);
  const expanded = cmd.words && valid ? io.expand(cmd.words) : { values: [...sh.sys.positional.args], errors: [] };
  let ran = ok;
  let values = [];
  if (!valid) {
    io.message(`bash: \`${cmd.name}': not a valid identifier\n`, cmd.endLine);
    ran = { status: 1, abort: false };
  } else if (expanded.errors.length) {
    io.message(`${expanded.errors[0]}\n`, cmd.line);
    ran = { status: 1, abort: true };
  } else values = expanded.values;
  sh.frame.loops++;
  let stop = false;
  for (let i = 0; i < values.length && !stop; i++) {
    setVar(sh.sys, cmd.name, values[i]);
    ran = runList(sh, cmd.body, io.sink, io.stdin);
    stop = ran.abort || sh.exit !== null || landJump(sh);
  }
  sh.frame.loops--;
  return ran;
}

/**
 * Run `if LIST; then LIST; [elif LIST; then LIST;] [else LIST;] fi`.
 *
 * @param {object} sh The shell.
 * @param {{branches: {cond: object[], body: object[]}[], otherwise: object[]|null}} cmd The parsed if.
 * @param {object} io Its input, output and helpers (see the module comment).
 * @param {(sh: object, list: object[], sink: object, stdin: string|null) => {status: number, abort: boolean}} runList The executor's list runner.
 * @returns {{status: number, abort: boolean}} The status of the branch that ran, 0 if none did.
 */
export function runIf(sh, cmd, io, runList) {
  let chosen = null;
  let ran = ok;
  for (let i = 0; i < cmd.branches.length && !chosen && !interrupted(sh, ran); i++) {
    ran = runList(sh, cmd.branches[i].cond, io.sink, io.stdin);
    if (ran.status === 0) chosen = cmd.branches[i].body;
  }
  if (!chosen && !interrupted(sh, ran)) chosen = cmd.otherwise;
  if (!chosen && !interrupted(sh, ran)) ran = ok;
  return chosen && !interrupted(sh, ran) ? runList(sh, chosen, io.sink, io.stdin) : ran;
}
