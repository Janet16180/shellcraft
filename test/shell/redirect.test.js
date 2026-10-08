import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openRedirects, writeTo } from '../../src/shell/redirect.js';
import { newDir, newFile, lookup } from '../../src/shell/fs.js';

const m = (owner, mode) => ({ owner, group: owner, mode, mtime: 0 });
const sys = () => ({
  user: 'hero', groups: ['hero'], cwd: '/h', umask: 0o022, now: () => 9,
  root: newDir({
    h: newDir({ 'a.txt': newFile('old\n', m('hero', 0o644)), 'ro.txt': newFile('x', m('hero', 0o444)), d: newDir({}, m('hero', 0o755)) }, m('hero', 0o755)),
    etc: newDir({}, m('root', 0o755)),
    dev: newDir({ null: { ...newFile('', m('root', 0o666)), dev: 'null' } }, m('root', 0o755)),
  }, m('root', 0o755)),
});
const base = () => ({ stdin: null, out: { kind: 'terminal' }, err: { kind: 'terminal' } });
const r = (op, target, fd = null) => ({ op, fd, target });

test('> truncates or creates the file before the command runs, owned by the user', () => {
  const s = sys();
  const { streams, error, records } = openRedirects(s, [r('>', 'a.txt'), r('>', 'new.txt')], base());
  assert.equal(error, null);
  assert.equal(lookup(s.root, '/h/a.txt').content, '');
  const created = lookup(s.root, '/h/new.txt');
  assert.deepEqual([created.owner, created.mode, created.content], ['hero', 0o644, '']);
  assert.equal(streams.out.node, created);
  assert.deepEqual(records, [{ op: '>', target: '/h/a.txt' }, { op: '>', target: '/h/new.txt' }]);
});

test('>> keeps the content and writes append', () => {
  const s = sys();
  const { streams } = openRedirects(s, [r('>>', 'a.txt')], base());
  writeTo(s, streams.out, 'more\n');
  assert.equal(lookup(s.root, '/h/a.txt').content, 'old\nmore\n');
});

test('< reads a file into standard input', () => {
  assert.equal(openRedirects(sys(), [r('<', 'a.txt')], base()).streams.stdin, 'old\n');
});

test('< is recorded with its absolute path, like > and >>', () => {
  assert.deepEqual(openRedirects(sys(), [r('<', 'a.txt'), r('>', 'b.txt')], base()).records, [{ op: '<', target: '/h/a.txt' }, { op: '>', target: '/h/b.txt' }]);
  assert.deepEqual(openRedirects(sys(), [r('<', 'missing')], base()).records, []);
});

test('2> sends errors to a file and 2>&1 joins them to standard output', () => {
  const s = sys();
  const { streams } = openRedirects(s, [r('>', 'o.txt'), r('>&', '1', 2)], base());
  assert.equal(streams.err, streams.out);
  const e = openRedirects(s, [r('>', 'e.txt', 2)], base()).streams;
  assert.equal(e.err.node, lookup(s.root, '/h/e.txt'));
  assert.deepEqual(e.out, { kind: 'terminal' });
});

test('&> sends both streams to one file', () => {
  const { streams } = openRedirects(sys(), [r('&>', 'both.txt')], base());
  assert.equal(streams.out, streams.err);
});

test('/dev/null swallows output', () => {
  const s = sys();
  const { streams } = openRedirects(s, [r('>', '/dev/null', 2)], base());
  writeTo(s, streams.err, 'gone');
  assert.equal(streams.err.kind, 'null');
  assert.equal(lookup(s.root, '/dev/null').content, '');
});

test('failures give the bash message with the target as expanded', () => {
  const err = (redir) => openRedirects(sys(), [redir], base()).error;
  assert.equal(err(r('>', 'nope/x')), 'bash: nope/x: No such file or directory');
  assert.equal(err(r('>', 'd')), 'bash: d: Is a directory');
  assert.equal(err(r('>', 'ro.txt')), 'bash: ro.txt: Permission denied');
  assert.equal(err(r('>', '/etc/x')), 'bash: /etc/x: Permission denied');
  assert.equal(err(r('<', 'missing')), 'bash: missing: No such file or directory');
});
