import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processName, matchesProcess, patternError, readSelection, selectedBy, killSelects, selectsProcess } from '../../src/backend/process.js';

const shell = { pid: 4242, user: 'hero', tty: 'pts/0', cmd: '-bash' };
const cron = { pid: 77, user: 'root', tty: '?', cmd: '/usr/sbin/cron -f' };
const daemon = { pid: 900, user: 'hero', tty: '?', cmd: './shadow_daemon --devour-cpu' };
const opts = { shellPid: shell.pid };

test('a process is named by its first word, without a login dash or a directory', () => {
  assert.equal(processName('-bash'), 'bash');
  assert.equal(processName('/usr/sbin/cron -f'), 'cron');
  assert.equal(processName('./shadow_daemon --devour-cpu'), 'shadow_daemon');
  assert.equal(processName('[kthreadd]'), 'kthreadd');
  assert.equal(processName('/opt/a_very_long_program_name'), 'a_very_long_pro');
});

test('a pattern is an extended regular expression, whole-name with exact', () => {
  assert.equal(matchesProcess('^ba', 'bash'), true);
  assert.equal(matchesProcess('b.sh$', 'bash'), true);
  assert.equal(matchesProcess('as', 'bash'), true);
  assert.equal(matchesProcess('as', 'bash', { exact: true }), false);
  assert.equal(matchesProcess('ba(sh|tch)', 'bash', { exact: true }), true);
  assert.equal(matchesProcess('BASH', 'bash', { ignoreCase: true }), true);
  assert.equal(matchesProcess('(', 'bash'), false);
  assert.equal(patternError('('), 'Unmatched ( or \\(');
  assert.equal(patternError('*x'), 'Invalid preceding regular expression');
  assert.equal(patternError('^ba'), null);
});

test('kill operands select by PID, the caller\'s group, a process group, or everyone else', () => {
  assert.equal(killSelects('4242', shell, opts), true);
  assert.equal(killSelects('0', shell, opts), true);
  assert.equal(killSelects('-4242', shell, opts), true);
  assert.equal(killSelects('-1', shell, opts), false);
  assert.equal(killSelects('-1', daemon, opts), true);
  assert.equal(killSelects('-1', { ...cron, pid: 1 }, opts), false);
  assert.equal(killSelects('0', daemon, opts), false);
  assert.equal(killSelects('-900', daemon, opts), true);
  assert.equal(killSelects('%1', shell, opts), false);
});

test('pkill and pgrep read a pattern, -x, -i, -f, -u and -t', () => {
  const sel = readSelection('pkill', ['-9', '-u', 'hero,root', '-t', '/dev/pts/0', '-xi', 'BASH']);
  assert.deepEqual([sel.patterns, sel.users, sel.ttys, sel.exact, sel.ignoreCase, sel.error], [['BASH'], ['hero', 'root'], ['pts/0'], true, true, null]);
  assert.equal(selectedBy(sel, shell), true);
  assert.equal(selectedBy(readSelection('pgrep', ['-f', 'devour']), daemon), true);
  assert.equal(selectedBy(readSelection('pgrep', ['devour']), daemon), false);
});

test('killall matches whole names, or every process of a user with -u alone', () => {
  assert.equal(selectedBy(readSelection('killall', ['-9', 'bash']), shell), true);
  assert.equal(selectedBy(readSelection('killall', ['ba']), shell), false);
  assert.equal(selectedBy(readSelection('killall', ['-r', '^ba']), shell), true);
  assert.equal(selectedBy(readSelection('killall', ['-I', 'BASH']), shell), true);
  assert.equal(selectedBy(readSelection('killall', ['-s', 'KILL', '-u', 'hero']), shell), true);
});

test('selection problems are reported the way the tools report them', () => {
  assert.equal(readSelection('pgrep', ['a', 'b']).error, 'only one pattern can be provided');
  assert.equal(readSelection('pgrep', ['-x']).error, 'no matching criteria specified');
  assert.equal(readSelection('pkill', ['(']).error, 'regex error: Unmatched ( or \\(');
  assert.equal(readSelection('pkill', ['-u']).missing, '-u');
  assert.equal(readSelection('pkill', ['-H', 'x']).unknown, '-H');
  assert.equal(readSelection('killall', []).error, 'usage');
  assert.equal(readSelection('killall', ['-g', 'x']).unknown, '-g');
});

test('the lines engine checks select the shell exactly when the real tools would', () => {
  const selects = line => {
    const [command, ...args] = line.split(' ');
    return selectsProcess(command, args, shell, opts);
  };
  for (const line of ['kill -HUP 0', 'kill -9 -4242', 'kill -9 4242', 'pkill -KILL -u hero', 'pkill -9 -t pts/0', 'killall -9 -u hero', 'pkill -HUP ^ba', 'killall bash']) {
    assert.equal(selects(line), true, line);
  }
  for (const line of ['kill -9 -1', 'pkill -9 -u root', 'pkill -9 -u hero cron', 'kill -l 9', 'pkill -9 -x ba', 'killall -9 -u root', 'pkill (']) {
    assert.equal(selects(line), false, line);
  }
});

test('only kill, pkill, pgrep and killall select processes', () => {
  assert.throws(() => selectsProcess('ls', [], shell, opts), /does not select processes/);
});
