/**
 * Redirections: opening files for a command before it runs, and writing its
 * output where its streams point.
 *
 * A stream target is `{kind: 'terminal'}`, `{kind: 'pipe'}`,
 * `{kind: 'null'}` (/dev/null) or `{kind: 'file', node}`.
 */

import { newFile, baseName, addChild } from './fs.js';
import { resolve, errorText } from './paths.js';
import { can, canChangeEntries } from './perms.js';

function openWrite(sys, path, append) {
  const r = resolve(sys, path);
  let target = null;
  let error = null;
  if (r.node?.dev === 'null') target = { kind: 'null' };
  else if (r.node?.type === 'dir') error = 'Is a directory';
  else if (r.node && !can(sys, r.node, 'w')) error = 'Permission denied';
  else if (r.node) target = { kind: 'file', node: r.node };
  else if (r.error !== 'ENOENT' || !r.parent) error = errorText(r.error);
  else if (!canChangeEntries(sys, r.parent)) error = 'Permission denied';
  else {
    const meta = { mode: 0o666 & ~sys.umask, owner: sys.user, group: sys.user, mtime: sys.now() };
    target = { kind: 'file', node: addChild(r.parent, baseName(r.abs), newFile('', meta), sys.now()) };
  }
  if (target?.kind === 'file' && !append) Object.assign(target.node, { content: '', mtime: sys.now() });
  return { target, error, abs: r.abs };
}

function openRead(sys, path) {
  const r = resolve(sys, path);
  let error = r.error ? errorText(r.error) : null;
  if (!error && r.node.type === 'dir') error = 'Is a directory';
  else if (!error && !can(sys, r.node, 'r')) error = 'Permission denied';
  return { input: error ? null : r.node.content, error };
}

function applyOne(sys, redir, streams) {
  const { op, target } = redir;
  const fd = redir.fd ?? (op.startsWith('<') ? 0 : 1);
  const dup = (op === '>&' || op === '<&') && /^\d$/.test(target);
  let error = null;
  let record = null;
  if (dup) {
    const source = target === '1' ? streams.out : streams.err;
    if (fd === 1) streams.out = source;
    else if (fd === 2) streams.err = source;
  } else if (op === '<') {
    const read = openRead(sys, target);
    error = read.error;
    streams.stdin = read.input;
  } else {
    const opened = openWrite(sys, target, op.endsWith('>>'));
    error = opened.error;
    const both = op.startsWith('&') || op === '>&';
    if (!error && (both || fd === 1)) streams.out = opened.target;
    if (!error && (both || fd === 2)) streams.err = opened.target;
    record = { op: both ? op : `${redir.fd ?? ''}${op === '>|' ? '>' : op}`, target: opened.abs };
  }
  return { error: error ? `bash: ${target}: ${error}` : null, record };
}

/**
 * Apply a command's redirections in order, opening (and truncating) files now.
 *
 * @param {object} sys The machine state.
 * @param {{op: string, fd: number|null, target: string}[]} redirs Redirections with expanded targets.
 * @param {{stdin: string|null, out: object, err: object}} base Where the streams point before redirection.
 * @returns {{streams: {stdin: string|null, out: object, err: object}, error: string|null, records: {op: string, target: string}[]}}
 *   The streams, the first error (the command must not run), and the output redirections for the command record.
 */
export function openRedirects(sys, redirs, base) {
  const streams = { ...base };
  const records = [];
  let error = null;
  for (const redir of redirs) {
    if (error) break;
    const applied = applyOne(sys, redir, streams);
    error = applied.error;
    if (applied.record && !error) records.push(applied.record);
  }
  return { streams, error, records };
}

/**
 * Write text to a file or /dev/null target. Terminal and pipe targets are the caller's.
 *
 * @param {object} sys The machine state.
 * @param {object} target A stream target.
 * @param {string} text The text.
 * @returns {void}
 */
export function writeTo(sys, target, text) {
  if (target.kind !== 'file' || !text) return;
  target.node.content += text;
  target.node.mtime = sys.now();
}
