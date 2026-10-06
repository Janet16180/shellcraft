/**
 * Running a typed line: parse it, then for each command expand its words,
 * open its redirections, dispatch it, route its output, and record it.
 *
 * Output goes to a sink `{write(stream, text, html), note(text)}`; the typed
 * line writes to the terminal, scripts and command substitutions capture it.
 */

import { tokenize } from './lexer.js';
import { parse } from './parse.js';
import { expandWords, expandTarget, expandAssignment } from './expand.js';
import { openRedirects, writeTo } from './redirect.js';
import { resolve, errorText } from './paths.js';
import { can } from './perms.js';
import { result, withNote } from './result.js';
import { manText, hasManPage, shortHelpNote } from './man.js';
import { versionText } from './versions.js';
import { varValue, setVar } from './vars.js';
import { BUILTINS, BASH_BUILTINS, BUILTIN_HELP, builtinHelp } from './builtins.js';
import { SYSTEM_HOMES } from './system.js';

const MAX_DEPTH = 32;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const CONTINUATION = 'In a real terminal, bash would wait for the rest of the command on a new line (a > prompt). Here the line ends where you pressed Enter.';
const BACKGROUND = 'Background jobs are not simulated yet: the command ran in the foreground.';
const OWN_OPTIONS = new Set(['clear', 'find', 'which']);
const helpNote = name => `Real bash prints a longer description here; help ${name} shows the same text.`;

function firstOf(args, ...wanted) {
  const end = args.includes('--') ? args.indexOf('--') : args.length;
  return args.slice(0, end).find(a => wanted.includes(a));
}

const UNSIMULATED = new Set(['w', 'nl', 'cut', 'tr', 'du', 'df', 'ln', 'stat', 'diff', 'tar', 'chown', 'rev', 'seq', 'yes', 'od', 'tee', 'xargs',
  'basename', 'dirname', 'realpath', 'readlink', 'tac', 'shuf', 'cmp', 'comm', 'paste', 'join', 'split', 'fold',
  'expand', 'md5sum', 'sha256sum', 'base64', 'sleep', 'watch', 'free', 'uptime', 'lsblk', 'mount', 'apt', 'perl', 'gzip', 'whereis', 'stty', 'tput']);
const isAssignment = word => 'lit' in word.parts[0] && !word.parts[0].q && ASSIGNMENT.test(word.parts[0].lit);
const withNewline = text => (text && !text.endsWith('\n') ? `${text}\n` : text);

// Expansion happens before the command's redirections, so a command
// substitution writes its errors where the shell writes its own.
function expansionEnv(sh, sink) {
  const { sys } = sh;
  const errors = [];
  const env = {
    sys, errors, substitutionStatus: null,
    fail: message => errors.push(message),
    lookupVar: name => varValue(sys, name),
    homeOf: user => (user === sys.user ? sys.home : SYSTEM_HOMES[user] ?? null),
    substitute: line => {
      if (sh.run.depth >= MAX_DEPTH) errors.push('bash: command substitution: maximum nesting level exceeded');
      const r = errors.length ? { out: '', err: '', status: 1 } : capture(sh, line);
      if (r.err) sink.write('err', r.err);
      env.substitutionStatus = r.status;
      return r.out;
    },
  };
  return env;
}

function capture(sh, line, errPrefix = null) {
  const out = { out: '', err: '', status: 0 };
  const sink = {
    write: (stream, text) => { out[stream] += errPrefix && stream === 'err' ? text.replace(/^bash: /gm, errPrefix) : text; },
    note: sh.run.sink.note,
  };
  sh.run.depth++;
  out.status = executeLine(sh, line, sink);
  sh.run.depth--;
  return out;
}

function runScriptText(sh, text, name) {
  if (sh.run.depth >= MAX_DEPTH) return result('', `bash: ${name}: maximum nesting level exceeded`, 1);
  let out = '';
  let err = '';
  let status = 0;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const r = capture(sh, line, `${name}: line ${i + 1}: `);
    out += r.out;
    err += r.err;
    status = r.status;
  });
  return result(out, err.replace(/\n$/, ''), status);
}

function runFile(sh, name, args, ctx) {
  const r = resolve(sh.sys, name);
  let res;
  if (r.error) res = result('', `bash: ${name}: ${errorText(r.error)}`, r.error === 'ENOENT' ? 127 : 126);
  else if (r.node.type === 'dir') res = result('', `bash: ${name}: Is a directory`, 126);
  else if (!can(sh.sys, r.node, 'x')) res = result('', `bash: ${name}: Permission denied`, 126);
  else if (r.node.bin) res = sh.commands[r.node.bin](args, ctx);
  else if (!can(sh.sys, r.node, 'r')) res = result('', `bash: ${name}: Permission denied`, 126);
  else res = runScriptText(sh, r.node.content, name);
  return res;
}

function commandNotFound(name) {
  const hint = UNSIMULATED.has(name) ? `${name} is a real command on Ubuntu, but this game does not simulate it.` : null;
  return withNote(result('', `bash: ${name}: command not found`, 127), hint);
}

function unsimulatedBuiltin(name) {
  return withNote(result('', '', 1), `${name} is built into bash, but this game does not simulate it.`);
}

// The --version and --help that the shell answers for programs that do not
// read their own options here.
function standardOption(name, args) {
  const own = BUILTINS.has(name) || OWN_OPTIONS.has(name);
  let r = null;
  if (!own && firstOf(args, '--version', '--help') === '--version' && versionText(name)) r = result(versionText(name));
  else if (!own && args.includes('--help') && hasManPage(name)) r = withNote(result(manText(name, true)), shortHelpNote(name));
  return r;
}

function dispatch(sh, argv, streams, overlay) {
  const { sys } = sh;
  const [name, ...args] = argv;
  const ctx = {
    sys, stdin: streams.stdin, piped: streams.out.kind !== 'terminal', commands: sh.commands, env: overlay,
    block: reason => sh.run.blocked.push(reason),
    runScript: (node, scriptName) => runScriptText(sh, node.content, scriptName),
  };
  const standard = name.includes('/') ? null : standardOption(name, args);
  let r;
  if (name.includes('/')) r = runFile(sh, name, args, ctx);
  else if (args[0] === '--help' && name in BUILTIN_HELP) r = withNote(result(builtinHelp(name), '', 2), helpNote(name));
  else if (standard) r = standard;
  else if (!sh.commands[name] && BASH_BUILTINS.has(name)) r = unsimulatedBuiltin(name);
  else if (!sh.commands[name]) r = commandNotFound(name);
  else {
    if (!BUILTINS.has(name)) sys.hashed.add(name);
    r = sh.commands[name](args, ctx);
  }
  return r;
}

function aliasExpand(sh, words, seen = new Set()) {
  const first = words[0];
  const plain = first && first.parts.length === 1 && 'lit' in first.parts[0] && !first.parts[0].q;
  const name = plain ? first.parts[0].lit : null;
  if (name === null || seen.has(name) || !(name in sh.sys.aliases)) return words;
  const expanded = tokenize(sh.sys.aliases[name]).tokens.filter(t => t.type === 'word');
  return [...aliasExpand(sh, expanded, new Set([...seen, name])), ...words.slice(1)];
}

function route(sh, sink, target, text, html) {
  if (!text) return;
  if (target.kind === 'terminal') sink.write(target.stream, text, target.stream === 'out' ? html : null);
  else if (target.kind === 'pipe') target.buffer += text;
  else writeTo(sh.sys, target, text);
}

function prepare(sh, cmd, stdin, last, sink) {
  const env = expansionEnv(sh, sink);
  let k = 0;
  while (k < cmd.words.length && isAssignment(cmd.words[k])) k++;
  const values = cmd.words.slice(0, k).map(w => [w.parts[0].lit.split('=')[0], expandAssignment(w, env)]);
  const argv = expandWords(aliasExpand(sh, cmd.words.slice(k)), env);
  const targets = cmd.redirs.map(r => ({ op: r.op, fd: r.fd, expanded: expandTarget(r.target, env) }));
  const bad = env.errors.length ? { expanded: { error: env.errors[0] } } : targets.find(t => t.expanded.error);
  const base = { stdin, out: last ? { kind: 'terminal', stream: 'out' } : { kind: 'pipe', buffer: '' }, err: { kind: 'terminal', stream: 'err' } };
  const opened = bad ? { error: bad.expanded.error, streams: base, records: [] }
    : openRedirects(sh.sys, targets.map(t => ({ op: t.op, fd: t.fd, target: t.expanded.value })), base);
  return { argv, values, opened, base, abort: env.errors.length > 0, substitutionStatus: env.substitutionStatus };
}

function runCommand(sh, cmd, stdin, place, sink) {
  const { sys } = sh;
  const cwd = sys.cwd;
  const { argv, values, opened, base, abort, substitutionStatus } = prepare(sh, cmd, stdin, place.last, sink);
  const { streams } = opened;
  let r = result();
  if (opened.error) r = result('', opened.error, 1);
  else if (!argv.length) {
    values.forEach(([name, value]) => setVar(sys, name, value));
    r = result('', '', substitutionStatus ?? 0);
  }
  else r = dispatch(sh, argv, streams, Object.fromEntries(values));
  route(sh, sink, opened.error ? base.err : streams.err, withNewline(r.err), null);
  if (r.note) sink.note(r.note);
  route(sh, sink, streams.out, r.out, r.html);
  if (sh.run.depth === 0 && argv.length && !opened.error) {
    sh.run.records.push({ name: argv[0], args: argv.slice(1), cwd, status: r.status, stdout: r.out, ...place.record, redirects: opened.records });
  }
  return { status: r.status, piped: streams.out.kind === 'pipe' ? streams.out.buffer : '', abort };
}

function runPipeline(sh, pipeline, sink) {
  const index = sh.run.depth === 0 ? sh.run.pipelines++ : -1;
  let stdin = null;
  let status = 0;
  let abort = false;
  pipeline.forEach((cmd, stage) => {
    const place = { last: stage === pipeline.length - 1, record: { pipeline: index, stage, stages: pipeline.length } };
    const done = runCommand(sh, cmd, stage === 0 ? null : stdin, place, sink);
    status = done.status;
    stdin = done.piped;
    abort ||= done.abort;
  });
  return { status, abort };
}

/**
 * Run one line: the typed line, a line of a script, or a command substitution.
 *
 * @param {{sys: object, commands: object, run: object}} sh The machine, the
 *   command table and the collector for this typed line (records, blocked reasons, depth, sink).
 * @param {string} line The line.
 * @param {{write: (stream: 'out'|'err', text: string, html?: string|null) => void, note: (text: string) => void}} sink Where output goes.
 * @returns {number} The exit status of the last pipeline that ran.
 */
export function executeLine(sh, line, sink) {
  const { sys } = sh;
  const lexed = tokenize(line);
  const parsed = lexed.error ? { list: [], error: lexed.error, incomplete: true } : parse(lexed.tokens);
  let status = sys.lastStatus;
  let prev = null;
  if (parsed.error) {
    sink.write('err', `${parsed.error}\n`);
    if (parsed.incomplete) sink.note(CONTINUATION);
    status = 2;
  }
  let abort = false;
  for (const item of parsed.list) {
    const skip = abort || (prev === '&&' && status !== 0) || (prev === '||' && status === 0);
    const ran = skip ? null : runPipeline(sh, item.pipeline, sink);
    if (ran) ({ status, abort } = ran);
    if (ran && item.next === '&') sink.note(BACKGROUND);
    sys.lastStatus = status;
    prev = item.next;
  }
  sys.lastStatus = status;
  return status;
}
