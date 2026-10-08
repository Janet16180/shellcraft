/**
 * test and [: bash's conditional expressions. Like bash, the number of
 * arguments decides how they are read (POSIX), and longer expressions use
 * the full grammar with !, -a, -o and parentheses.
 */

import { result } from '../result.js';
import { resolve } from '../paths.js';
import { can } from '../perms.js';
import { groupNames } from '../accounts.js';
import { sizeOf } from '../fs.js';

const INT64 = 2n ** 63n;
const INTEGER = /^\s*[-+]?\d+\s*$/;

// Kinds of file the simulator does not have (links, devices, pipes, sockets)
// and bits it does not keep (setuid, setgid, sticky) are always false.
const NEVER = new Set(['-L', '-h', '-b', '-c', '-p', '-S', '-u', '-g', '-k', '-N', '-t', '-o']);

const FILE_TESTS = {
  '-e': () => true,
  '-a': () => true,
  '-f': node => node.type === 'file',
  '-d': node => node.type === 'dir',
  '-r': (node, sys) => can(sys, node, 'r'),
  '-w': (node, sys) => can(sys, node, 'w'),
  '-x': (node, sys) => can(sys, node, 'x'),
  '-s': node => sizeOf(node) > 0,
  '-O': (node, sys) => node.owner === sys.user,
  '-G': (node, sys) => node.group === groupNames(sys)[0],
};

const STRING_TESTS = { '-z': s => s === '', '-n': s => s !== '' };

// The simulator has no name references, so -R is false like the kinds above.
const VARIABLE_TESTS = { '-v': (name, sys) => sys.vars[name] !== undefined, '-R': () => false };

const COMPARE = {
  '=': (a, b) => a === b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
};

const NUMERIC = {
  '-eq': (a, b) => a === b,
  '-ne': (a, b) => a !== b,
  '-lt': (a, b) => a < b,
  '-le': (a, b) => a <= b,
  '-gt': (a, b) => a > b,
  '-ge': (a, b) => a >= b,
};

const FILE_COMPARE = ['-nt', '-ot', '-ef'];

const isUnary = op => op in FILE_TESTS || op in STRING_TESTS || op in VARIABLE_TESTS || NEVER.has(op);
const isBinary = op => op in COMPARE || op in NUMERIC || FILE_COMPARE.includes(op);

const truth = ok => ({ ok, error: null });
const failure = error => ({ ok: false, error });
const negate = v => (v.error ? v : truth(!v.ok));

function fileNode(sys, path) {
  if (path === '') return null;
  return resolve(sys, path).node;
}

function unary(op, arg, sys) {
  if (op in STRING_TESTS) return truth(STRING_TESTS[op](arg));
  if (op in VARIABLE_TESTS) return truth(VARIABLE_TESTS[op](arg, sys));
  if (NEVER.has(op)) return truth(false);
  const node = fileNode(sys, arg);
  return truth(Boolean(node) && FILE_TESTS[op](node, sys));
}

function integer(text) {
  if (!INTEGER.test(text)) return null;
  const n = BigInt(text.trim());
  return n >= -INT64 && n < INT64 ? n : null;
}

// -nt and -ot compare times; a missing file is older than any file. -ef asks for the same file.
function compareFiles(op, left, right, sys) {
  const a = fileNode(sys, left);
  const b = fileNode(sys, right);
  if (op === '-ef') return truth(Boolean(a) && a === b);
  const [newer, older] = op === '-nt' ? [a, b] : [b, a];
  return truth(Boolean(newer) && (!older || newer.mtime > older.mtime));
}

function binary(left, op, right, sys) {
  if (op in COMPARE) return truth(COMPARE[op](left, right));
  if (FILE_COMPARE.includes(op)) return compareFiles(op, left, right, sys);
  const bad = [left, right].find(side => integer(side) === null);
  if (bad !== undefined) return failure(`${bad}: integer expression expected`);
  return truth(NUMERIC[op](integer(left), integer(right)));
}

// The full grammar, for more than four arguments:
// expr := and (-o and)* ; and := term (-a term)* ;
// term := ! term | ( expr ) | arg BINOP arg | UNOP arg | arg
function parser(args, sys) {
  let pos = 0;
  const term = () => {
    if (pos >= args.length) return failure('argument expected');
    if (args[pos] === '!') { pos++; return negate(term()); }
    if (args[pos] === '(') {
      pos++;
      const inner = or();
      if (inner.error) return inner;
      if (args[pos] !== ')') return failure("`)' expected");
      pos++;
      return inner;
    }
    if (pos + 2 < args.length && isBinary(args[pos + 1])) {
      pos += 3;
      return binary(args[pos - 3], args[pos - 2], args[pos - 1], sys);
    }
    if (pos + 1 < args.length && isUnary(args[pos])) {
      pos += 2;
      return unary(args[pos - 2], args[pos - 1], sys);
    }
    pos++;
    return truth(args[pos - 1] !== '');
  };
  const chain = (op, next, join) => () => {
    let value = next();
    while (!value.error && args[pos] === op) {
      pos++;
      const right = next();
      value = right.error ? right : truth(join(value.ok, right.ok));
    }
    return value;
  };
  const and = chain('-a', term, (a, b) => a && b);
  const or = chain('-o', and, (a, b) => a || b);
  return () => {
    const value = or();
    return !value.error && pos < args.length ? failure('too many arguments') : value;
  };
}

function two([op, arg], sys) {
  if (op === '!') return truth(arg === '');
  if (isUnary(op)) return unary(op, arg, sys);
  return failure(`${op}: unary operator expected`);
}

function three([left, op, right], sys) {
  if (isBinary(op)) return binary(left, op, right, sys);
  if (op === '-a') return truth(left !== '' && right !== '');
  if (op === '-o') return truth(left !== '' || right !== '');
  if (left === '!') return negate(two([op, right], sys));
  if (left === '(' && right === ')') return truth(op !== '');
  return failure(`${op}: binary operator expected`);
}

/**
 * Evaluate a conditional expression the way bash's test builtin does.
 *
 * @param {string[]} args The expression's words, without the closing ] of [.
 * @param {object} sys The machine state, for file tests.
 * @returns {{ok: boolean, error: string|null}} Whether it holds, or why it could not be read.
 */
export function evaluate(args, sys) {
  if (args.length === 0) return truth(false);
  if (args.length === 1) return truth(args[0] !== '');
  if (args.length === 2) return two(args, sys);
  if (args.length === 3) return three(args, sys);
  if (args.length === 4 && args[0] === '!') return negate(three(args.slice(1), sys));
  if (args.length === 4 && args[0] === '(' && args[3] === ')') return two(args.slice(1, 3), sys);
  return parser(args, sys)();
}

const conditional = name => (args, { sys }) => {
  if (name === '[' && args.at(-1) !== ']') return result('', "bash: [: missing `]'", 2);
  const value = evaluate(name === '[' ? args.slice(0, -1) : args, sys);
  if (value.error) return result('', `bash: ${name}: ${value.error}`, 2);
  return result('', '', value.ok ? 0 : 1);
};

export default {
  test: conditional('test'),
  '[': conditional('['),
};
