/**
 * Running a typed line: parse it, expand words, wire pipelines and
 * redirections, dispatch each command, and record what ran.
 */

import { tokenize, parse } from './parse.js';
import { expandGlob } from './glob.js';
import { lookup, normalize, parentOf, baseName, newFile } from './fs.js';
import { can, canChangeEntries } from './perms.js';
import { result, withNote } from './result.js';
import { manText, hasManPage } from './man.js';
import { varValue } from './vars.js';

const MAX_SCRIPT_DEPTH = 4;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const MISTAKES = {
  cls: 'cls is the Windows command. On Linux, use clear.',
  del: 'del is the Windows command. On Linux, use rm.',
  copy: 'copy is the Windows command. On Linux, use cp.',
  move: 'move is the Windows command. On Linux, use mv.',
  ren: 'ren is the Windows command. On Linux, rename with mv.',
  ipconfig: 'ipconfig is the Windows command. On Linux, try ip addr (not simulated here).',
  'cd..': 'Put a space between cd and the dots: cd ..',
  'ls-l': 'Put a space before the option: ls -l',
  'ls-a': 'Put a space before the option: ls -a',
  'ls-la': 'Put a space before the option: ls -la',
};

function writeRedirect(sys, target, content, append) {
  const p = normalize(target, sys.cwd);
  const node = lookup(sys.root, p);
  const parent = lookup(sys.root, parentOf(p));
  let error = '';
  if (node && node.dev === 'null') error = '';
  else if (node && node.type === 'dir') error = `bash: ${target}: Is a directory`;
  else if (!parent || parent.type !== 'dir') error = `bash: ${target}: No such file or directory`;
  else if (node ? !can(sys, node, 'w') : !canChangeEntries(sys, parent)) error = `bash: ${target}: Permission denied`;
  else if (node) Object.assign(node, { content: append ? node.content + content : content, mtime: sys.now() });
  else parent.children[baseName(p)] = newFile(content, { mode: 0o666 & ~sys.umask, owner: sys.user, group: sys.user, mtime: sys.now() });
  return error;
}

function readRedirect(sys, target) {
  const node = lookup(sys.root, normalize(target, sys.cwd));
  let input = null;
  let error = '';
  if (!node) error = `bash: ${target}: No such file or directory`;
  else if (node.type === 'dir') error = `bash: ${target}: Is a directory`;
  else if (!can(sys, node, 'r')) error = `bash: ${target}: Permission denied`;
  else input = node.content;
  return { input, error };
}

function commandNotFound(sh, name) {
  const lower = name.toLowerCase();
  const hint = MISTAKES[name] ?? (sh.commands[lower] ? `Commands are case-sensitive. Try ${lower}` : null);
  return withNote(result('', `bash: ${name}: command not found`, 127), hint);
}

function runFile(sh, name, args, ctx) {
  const p = normalize(name, sh.sys.cwd);
  const node = lookup(sh.sys.root, p);
  let r;
  if (!node) r = result('', `bash: ${name}: No such file or directory`, 127);
  else if (node.type === 'dir') r = result('', `bash: ${name}: Is a directory`, 126);
  else if (!can(sh.sys, node, 'x')) r = result('', `bash: ${name}: Permission denied`, 126);
  else if (node.bin) r = sh.commands[node.bin](args, ctx);
  else r = runScriptText(sh, node.content);
  return r;
}

function dispatch(sh, argv, stdin, piped) {
  const [name, ...args] = argv;
  const ctx = {
    sys: sh.sys, stdin, piped, commands: sh.commands,
    block: reason => sh.run.blocked.push(reason),
    runScript: node => runScriptText(sh, node.content),
  };
  let r;
  if (ASSIGNMENT.test(name) && !args.length) {
    const i = name.indexOf('=');
    sh.sys.vars[name.slice(0, i)] = name.slice(i + 1);
    r = result();
  } else if (name.includes('/')) r = runFile(sh, name, args, ctx);
  else if (args.includes('--help') && hasManPage(name) && name !== 'echo') r = result(manText(name, true));
  else if (!sh.commands[name]) r = commandNotFound(sh, name);
  else r = sh.commands[name](args, ctx);
  return r;
}

function expandArgs(sh, args) {
  const { sys } = sh;
  let argv = args.flatMap(t => expandGlob(t, sys.root, sys.cwd));
  if (argv.length && sys.aliases[argv[0]] && !args[0].quoted) {
    const { tokens } = tokenize(sys.aliases[argv[0]], { lookupVar: n => varValue(sys, n), home: sys.home });
    argv = [...tokens.filter(t => !t.op).map(t => t.v), ...argv.slice(1)];
  }
  return argv;
}

function emit(sink, r) {
  if (r.err) sink.err(r.err);
  if (r.note) sink.note(r.note);
}

function runStage(sh, st, stdin, place, sink) {
  const { sys } = sh;
  const argv = expandArgs(sh, st.args);
  const outR = st.redir.findLast(r => r.op !== '<');
  const inR = st.redir.findLast(r => r.op === '<');
  const cwd = sys.cwd;
  const fromFile = inR ? readRedirect(sys, inR.target) : { input: stdin, error: '' };
  const r = fromFile.error || !argv.length
    ? result('', fromFile.error, fromFile.error ? 1 : 0)
    : dispatch(sh, argv, fromFile.input, !place.last || Boolean(outR));
  emit(sink, r);
  let out = r.out;
  let status = r.status;
  const redirectError = outR && !fromFile.error ? writeRedirect(sys, outR.target, out, outR.op === '>>') : '';
  if (redirectError) { sink.err(redirectError); status = 1; }
  if (outR) out = '';
  else if (place.last && out) sink.out(out, r.html);
  if (sh.run.depth === 0 && argv.length && !fromFile.error) {
    sh.run.records.push({
      name: argv[0], args: argv.slice(1), cwd, status, stdout: r.out, pipeline: place.pipeline, stage: place.stage, stages: place.stages,
      redirects: st.redir.filter(x => x.op !== '<').map(x => ({ op: x.op, target: normalize(x.target, cwd) })),
    });
  }
  return { status, out };
}

function runPipeline(sh, stages, sink) {
  const pipeline = sh.run.pipelines++;
  let stdin = null;
  let status = 0;
  stages.forEach((st, stage) => {
    const place = { pipeline, stage, stages: stages.length, last: stage === stages.length - 1 };
    const done = runStage(sh, st, stdin, place, sink);
    status = done.status;
    stdin = done.out;
  });
  return status;
}

/**
 * Run one line through a sink. Used for the typed line and for each line of a script.
 *
 * @param {{sys: object, commands: object, run: object}} sh The machine, the command table and the line collector.
 * @param {string} line The line.
 * @param {{out: Function, err: Function, note: Function}} sink Where output goes.
 * @returns {number} The exit status of the last pipeline that ran.
 */
export function executeLine(sh, line, sink) {
  const { sys } = sh;
  const { tokens, error: lexError } = tokenize(line, { lookupVar: n => varValue(sys, n), home: sys.home });
  const { seq, error: parseError } = lexError ? { seq: [], error: lexError } : parse(tokens);
  let status = 0;
  let prev = null;
  if (parseError) { sink.err(parseError); status = 2; }
  for (const item of seq) {
    const skip = (prev === '&&' && status !== 0) || (prev === '||' && status === 0);
    if (!skip) status = runPipeline(sh, item.pipeline, sink);
    prev = item.next;
  }
  sys.lastStatus = status;
  return status;
}

function runScriptText(sh, text) {
  if (sh.run.depth >= MAX_SCRIPT_DEPTH) return result('', 'bash: maximum script nesting reached', 1);
  sh.run.depth++;
  let out = '';
  let status = 0;
  const sink = { ...sh.run.sink, out: t => { out += t; } };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line && !line.startsWith('#')) status = executeLine(sh, line, sink);
  }
  sh.run.depth--;
  return result(out, '', status);
}
