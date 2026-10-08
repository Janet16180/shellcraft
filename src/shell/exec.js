/**
 * Running shell text (the typed line, a script, a sourced file, a command
 * substitution): read it command by command as bash does, and for each
 * command expand its words, open its redirections, dispatch it, route its
 * output, and record it.
 *
 * Output goes to a sink `{write(stream, text, html), note(text), piped?}`;
 * the typed line writes to the terminal, scripts and command substitutions
 * capture it. `piped` tells commands that write to the sink that it is not a
 * terminal.
 *
 * The text runs in a frame that says how its messages begin: at the prompt
 * `bash: `, in a script `NAME: line N: `. The shell `sh` also carries a
 * pending `break`/`continue` (`jump`) and a pending `exit`.
 */

import { tokenize } from './lexer.js';
import { parseNext } from './parse.js';
import { expandWords, expandTarget, expandAssignment } from './expand.js';
import { openRedirects, writeTo } from './redirect.js';
import { resolve, errorText, pathFiles } from './paths.js';
import { can } from './perms.js';
import { result, withNote } from './result.js';
import { manText, hasManPage, shortHelpNote } from './man.js';
import { versionText } from './versions.js';
import { varValue, setVar } from './vars.js';
import { BUILTINS, BASH_BUILTINS, BUILTIN_HELP, builtinHelp } from './builtins.js';
import { homeOf } from './accounts.js';
import { enterChild, leaveChild } from './subshell.js';
import { runFor, runIf } from './compound.js';

const MAX_DEPTH = 32;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const CONTINUATION = 'In a real terminal, bash would wait for the rest of the command on a new line (a > prompt). Here the line ends where you pressed Enter.';
const BACKGROUND = 'Background jobs are not simulated yet: the command ran in the foreground.';
const OWN_OPTIONS = new Set(['clear', 'find', 'which', 'sudo']);
const helpNote = name => `Real bash prints a longer description here; help ${name} shows the same text.`;

function firstOf(args, ...wanted) {
  const end = args.includes('--') ? args.indexOf('--') : args.length;
  return args.slice(0, end).find(a => wanted.includes(a));
}

const UNSIMULATED = new Set(['w', 'nl', 'cut', 'tr', 'du', 'df', 'stat', 'diff', 'tar', 'rev', 'seq', 'yes', 'od', 'xargs',
  'basename', 'dirname', 'realpath', 'tac', 'shuf', 'cmp', 'comm', 'paste', 'join', 'split', 'fold',
  'expand', 'md5sum', 'sha256sum', 'base64', 'watch', 'free', 'uptime', 'lsblk', 'mount', 'apt', 'perl', 'gzip', 'whereis', 'stty', 'tput']);
const isAssignment = word => 'lit' in word.parts[0] && !word.parts[0].q && ASSIGNMENT.test(word.parts[0].lit);
const withNewline = text => (text && !text.endsWith('\n') ? `${text}\n` : text);

function frame(runtime, label, more = {}) {
  return { runtime, label, echo: true, typed: false, base: 0, current: 1, loops: 0, ...more };
}

const PROMPT = () => frame(null, () => 'bash: ', { echo: false, typed: true });
const scriptFrame = name => frame(name, line => `${name}: line ${line}: `);
const commandFrame = zero => frame(zero, line => `${zero}: -c: line ${line}: `);
const sourceFrame = (sys, name) => (sys.flags.includes('i') ? frame(null, line => `bash: ${name}: line ${line}: `) : scriptFrame(name));

// A command substitution reports its errors on the line of the command it is in.
const substitutionFrame = f => ({ ...f, typed: false, subshell: true, base: f.base + f.current - 1, loops: 0 });

// Outside the prompt, the shell's own messages name the text and the line.
function shellMessage(sh, text, line) {
  const f = sh.frame;
  return f.runtime && text ? text.replace(/^bash: /gm, `${f.runtime}: line ${f.base + line}: `) : text;
}

// Expansion happens before the command's redirections, so a command
// substitution writes its errors where the shell writes its own.
function expansionEnv(sh, sink) {
  const { sys } = sh;
  const errors = [];
  const env = {
    sys, errors, substitutionStatus: null,
    fail: message => errors.push(message),
    lookupVar: name => varValue(sys, name),
    positional: () => sys.positional.args,
    homeOf: user => (user === sys.user ? sys.home : homeOf(sys, user)),
    substitute: line => {
      if (sh.run.depth >= MAX_DEPTH) errors.push('bash: command substitution: maximum nesting level exceeded');
      const r = errors.length ? { out: '', err: '', status: 1 } : substitute(sh, line);
      if (r.err) sink.write('err', r.err);
      env.substitutionStatus = r.status;
      return r.out;
    },
  };
  return env;
}

function capture(sh, text, textFrame, piped = false) {
  const out = { out: '', err: '', status: 0 };
  const sink = { write: (stream, chunk) => { out[stream] += chunk; }, note: sh.run.sink.note, piped };
  sh.run.depth++;
  out.status = runText(sh, text, sink, textFrame);
  sh.run.depth--;
  return out;
}

// A substitution runs in a subshell: break, continue and exit stay inside it.
function substitute(sh, text) {
  const pending = { jump: sh.jump, exit: sh.exit };
  const r = capture(sh, text, substitutionFrame(sh.frame), true);
  Object.assign(sh, pending);
  return r;
}

const tooDeep = (sh, name) => (sh.run.depth >= MAX_DEPTH ? result('', `bash: ${name}: maximum nesting level exceeded`, 1) : null);

// What a child bash prints is its own: the caller's frame does not rename it.
function runScriptText(sh, script, piped) {
  const { text, zero, args, env, inline } = script;
  const deep = tooDeep(sh, zero);
  if (deep) return deep;
  const parent = enterChild(sh.sys, { zero, args, env });
  const r = capture(sh, text, inline ? commandFrame(zero) : scriptFrame(zero), piped);
  const status = sh.exit ?? r.status;
  sh.exit = null;
  leaveChild(sh.sys, parent);
  return { ...result(r.out, r.err.replace(/\n$/, ''), status), child: true };
}

// source: the lines run in this shell; arguments, if any, replace the
// positional parameters until the file ends.
function sourceText(sh, text, name, args, piped) {
  const { sys } = sh;
  const deep = tooDeep(sh, name);
  if (deep) return deep;
  const saved = sys.positional;
  if (args.length) sys.positional = { zero: saved.zero, args };
  const r = capture(sh, text, sourceFrame(sys, name), piped);
  if (args.length) sys.positional = saved;
  return result(r.out, r.err.replace(/\n$/, ''), r.status);
}

function runFile(sh, name, args, ctx) {
  const r = resolve(sh.sys, name);
  let res;
  if (r.error) res = result('', `bash: ${name}: ${errorText(r.error)}`, r.error === 'ENOENT' ? 127 : 126);
  else if (r.node.type === 'dir') res = result('', `bash: ${name}: Is a directory`, 126);
  else if (!can(sh.sys, r.node, 'x')) res = result('', `bash: ${name}: Permission denied`, 126);
  else if (r.node.bin) res = sh.commands[r.node.bin](args, ctx);
  else if (!can(sh.sys, r.node, 'r')) res = result('', `bash: ${name}: Permission denied`, 126);
  else res = runScriptText(sh, { text: r.node.content, zero: name, args, env: ctx.env }, ctx.piped);
  return res;
}

// Like bash: the first executable file in PATH, else the first file at all,
// which then fails with Permission denied.
function searchPath(sys, name) {
  const files = pathFiles(sys, name);
  return (files.find(f => can(sys, f.node, 'x')) ?? files[0])?.path ?? null;
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

// A program file run by another program (sudo): no PATH search, no
// aliases; a simulated program still answers --help and --version.
function runProgram(sh, path, args, ctx) {
  const { node } = resolve(sh.sys, path);
  const standard = node?.bin ? standardOption(node.bin, args) : null;
  return standard ?? runFile(sh, path, args, ctx);
}

// Run work as another user: their name, groups and umask, then back.
function runAs(sys, who, work) {
  const saved = { user: sys.user, gids: sys.gids, umask: sys.umask };
  Object.assign(sys, who);
  try {
    return work();
  } finally {
    Object.assign(sys, saved);
  }
}

function dispatch(sh, argv, streams, overlay) {
  const { sys } = sh;
  const [name, ...args] = argv;
  const ctx = {
    sys, stdin: streams.stdin, piped: streams.piped, commands: sh.commands, env: overlay,
    block: reason => sh.run.blocked.push(reason),
    runScript: (text, zero, scriptArgs, inline = false) => runScriptText(sh, { text, zero, args: scriptArgs, env: overlay, inline }, streams.piped),
    source: (text, file, sourceArgs) => sourceText(sh, text, file, sourceArgs, streams.piped),
    loops: sh.frame.loops,
    subshell: Boolean(sh.frame.subshell),
    jump: (kind, count) => { sh.jump = { kind, count }; },
    leave: status => { sh.exit = status; },
    tty: text => sh.run.sink.write('out', text),
    ask: prompt => sh.run.ask(prompt),
    hold: (until, pid) => sh.run.hold(until, pid),
    cancel: () => { sh.run.cancelled = true; },
    runAs: (who, work) => runAs(sys, who, work),
    program: (path, programArgs) => runProgram(sh, path, programArgs, { ...ctx, env: {} }),
  };
  const standard = name.includes('/') ? null : standardOption(name, args);
  const found = name.includes('/') || sh.commands[name] || BASH_BUILTINS.has(name) ? null : searchPath(sys, name);
  let r;
  if (name.includes('/')) r = runFile(sh, name, args, ctx);
  else if (args[0] === '--help' && name in BUILTIN_HELP) r = withNote(result(builtinHelp(name), '', 2), helpNote(name));
  else if (standard) r = standard;
  else if (!sh.commands[name] && BASH_BUILTINS.has(name)) r = unsimulatedBuiltin(name);
  else if (found) {
    sys.hashed.set(name, found);
    r = runFile(sh, found, args, ctx);
  } else if (!sh.commands[name]) r = commandNotFound(name);
  else {
    const program = BUILTINS.has(name) ? null : searchPath(sys, name);
    if (program) sys.hashed.set(name, program);
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

// The command's streams after its redirections; an expansion error stops
// the command before any file is opened.
function openStreams(sh, redirs, env, stdin, place, sink) {
  const targets = redirs.map(r => ({ op: r.op, fd: r.fd, expanded: expandTarget(r.target, env) }));
  const bad = env.errors.length ? { expanded: { error: env.errors[0] } } : targets.find(t => t.expanded.error);
  const out = place.last ? { kind: 'terminal', stream: 'out' } : { kind: 'pipe', buffer: '' };
  const base = { stdin, out, err: { kind: 'terminal', stream: 'err' } };
  const opened = bad ? { error: bad.expanded.error, streams: base, records: [] }
    : openRedirects(sh.sys, targets.map(t => ({ op: t.op, fd: t.fd, target: t.expanded.value })), base);
  opened.streams.piped = opened.streams.out.kind !== 'terminal' || Boolean(sink.piped);
  return { opened, base };
}

function prepare(sh, cmd, stdin, place, sink) {
  sh.frame.current = cmd.line;
  const env = expansionEnv(sh, sink);
  let k = 0;
  while (k < cmd.words.length && isAssignment(cmd.words[k])) k++;
  const values = cmd.words.slice(0, k).map(w => [w.parts[0].lit.split('=')[0], expandAssignment(w, env)]);
  const argv = expandWords(aliasExpand(sh, cmd.words.slice(k)), env);
  const { opened, base } = openStreams(sh, cmd.redirs, env, stdin, place, sink);
  return { argv, values, opened, base, abort: env.errors.length > 0, substitutionStatus: env.substitutionStatus };
}

function record(sh, argv, r, { cwd, user, place, redirects }) {
  const base = { cwd, ...place.record, redirects };
  const own = { name: argv[0], args: argv.slice(1), user, status: r.status, stdout: r.out, ...base };
  if (r.inner) own.asUser = r.inner.asUser;
  if (r.key) own.signal = r.key;
  sh.run.records.push(own);
  if (r.inner?.ran) sh.run.records.push({ name: r.inner.name, args: r.inner.args, user: r.inner.asUser, via: argv[0], status: r.inner.status, stdout: r.out, ...base });
}

function runCommand(sh, cmd, stdin, place, sink) {
  const { sys } = sh;
  const { cwd, user } = sys;
  const { argv, values, opened, base, abort, substitutionStatus } = prepare(sh, cmd, stdin, place, sink);
  const { streams } = opened;
  let r = result();
  if (opened.error) r = result('', opened.error, 1);
  else if (!argv.length) {
    values.forEach(([name, value]) => setVar(sys, name, value));
    r = result('', '', substitutionStatus ?? 0);
  }
  else r = dispatch(sh, argv, streams, Object.fromEntries(values));
  const err = withNewline(r.err);
  route(sh, sink, opened.error ? base.err : streams.err, r.child ? err : shellMessage(sh, err, cmd.line), null);
  if (r.note) sink.note(r.note);
  route(sh, sink, streams.out, r.out, r.html);
  if (sh.run.depth === 0 && argv.length && !opened.error) record(sh, argv, r, { cwd, user, place, redirects: opened.records });
  return { status: r.status, piped: streams.out.kind === 'pipe' ? streams.out.buffer : '', abort: abort || Boolean(r.abort) };
}

const COMPOUND = { for: runFor, if: runIf };

function buffered(sink, piped) {
  const chunks = [];
  return { chunks, sink: { write: (stream, text) => chunks.push({ stream, text }), note: sink.note, piped } };
}

// A compound command writes straight to the sink when nothing redirects it;
// otherwise its output is collected, in order, and sent where it goes.
function runCompound(sh, cmd, stdin, place, sink) {
  sh.frame.current = cmd.line;
  const env = expansionEnv(sh, sink);
  const { opened, base } = openStreams(sh, cmd.redirs, env, stdin, place, sink);
  const { streams } = opened;
  const collect = cmd.redirs.length || !place.last ? buffered(sink, streams.piped) : null;
  const io = { stdin: streams.stdin, sink: collect?.sink ?? sink };
  io.message = (text, line) => io.sink.write('err', shellMessage(sh, text, line));
  io.expand = words => {
    const wordEnv = expansionEnv(sh, io.sink);
    const values = expandWords(words, wordEnv);
    return { values, errors: wordEnv.errors };
  };
  const ran = opened.error ? { status: 1, abort: env.errors.length > 0 } : COMPOUND[cmd.type](sh, cmd, io, runList);
  if (opened.error) route(sh, sink, base.err, shellMessage(sh, withNewline(opened.error), cmd.line), null);
  for (const c of collect?.chunks ?? []) route(sh, sink, c.stream === 'out' ? streams.out : streams.err, c.text, null);
  return { status: ran.status, piped: streams.out.kind === 'pipe' ? streams.out.buffer : '', abort: ran.abort };
}

function runPipeline(sh, item, sink, input) {
  const { pipeline } = item;
  const index = sh.run.depth === 0 ? sh.run.pipelines++ : -1;
  let stdin = input;
  let status = 0;
  let abort = false;
  pipeline.forEach((cmd, stage) => {
    const place = { last: stage === pipeline.length - 1, record: { pipeline: index, stage, stages: pipeline.length } };
    const done = (cmd.type ? runCompound : runCommand)(sh, cmd, stdin, place, sink);
    status = done.status;
    stdin = done.piped;
    abort ||= done.abort;
  });
  return { status: item.negate ? Number(status === 0) : status, abort };
}

const interrupted = sh => sh.jump !== null || sh.exit !== null || sh.run.waiting !== null || sh.run.cancelled;

// Each pipeline in turn, as && and || allow, until one aborts the line or a
// break, continue or exit is pending. stdin feeds the first command of each.
function runList(sh, list, sink, stdin) {
  const { sys } = sh;
  let status = sys.lastStatus;
  let abort = false;
  let prev = null;
  for (let i = 0; i < list.length && !abort && !interrupted(sh); i++) {
    const item = list[i];
    const skip = (prev === '&&' && status !== 0) || (prev === '||' && status === 0);
    const ran = skip ? null : runPipeline(sh, item, sink, stdin);
    if (ran) ({ status, abort } = ran);
    if (ran && item.next === '&') sink.note(BACKGROUND);
    sys.lastStatus = status;
    prev = item.next;
  }
  return { status, abort };
}

// Unexpected end of file names the line after the last; bash -c adds a newline first.
const lastLine = text => text.split('\n').length + (text.endsWith('\n') ? 0 : 1);

function syntaxError(sh, error, text, sink) {
  const f = sh.frame;
  const line = error.line ?? lastLine(text);
  const label = f.label(f.base + line);
  const echo = error.echo && f.echo ? `${label}\`${text.split('\n')[line - 1]}'\n` : '';
  sink.write('err', `${label}${error.message}\n${echo}`);
  if (error.incomplete && f.typed) sink.note(CONTINUATION);
}

function runText(sh, text, sink, textFrame) {
  const outer = sh.frame;
  sh.frame = textFrame;
  const lexed = tokenize(text);
  const tokens = lexed.error ? [...lexed.tokens, { type: 'error', message: lexed.error, line: lexed.errorLine }] : lexed.tokens;
  let status = sh.sys.lastStatus;
  let next = { end: 0, list: [], error: null };
  while (next.list && sh.exit === null && sh.run.waiting === null && !sh.run.cancelled) {
    next = parseNext(tokens, next.end);
    if (next.error) syntaxError(sh, next.error, text, sink);
    if (next.error) status = 2;
    if (next.list) status = runList(sh, next.list, sink, null).status;
    sh.sys.lastStatus = status;
  }
  sh.frame = outer;
  return status;
}

/**
 * Run the line typed at the prompt (or the start-up file, sourced as one).
 *
 * @param {{sys: object, commands: object, run: object}} sh The machine, the
 *   command table and the collector for this typed line (records, blocked reasons, depth, sink).
 * @param {string} line The line.
 * @param {{write: (stream: 'out'|'err', text: string, html?: string|null) => void, note: (text: string) => void}} sink Where output goes.
 * @returns {number} The exit status of the last pipeline that ran.
 */
export function executeLine(sh, line, sink) {
  Object.assign(sh, { jump: null, exit: null });
  return runText(sh, line, sink, PROMPT());
}
