import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNAL_LIST, signalName, parseSignal, defaultAction, endsInteractiveShell, endsSession, requestedSignal } from '../../src/backend/signals.js';

test('the list holds the 62 Linux signals as kill -l numbers them', () => {
  assert.equal(SIGNAL_LIST.length, 62);
  assert.deepEqual(SIGNAL_LIST.slice(0, 3), [[1, 'HUP'], [2, 'INT'], [3, 'QUIT']]);
  assert.deepEqual(SIGNAL_LIST.slice(30, 33), [[31, 'SYS'], [34, 'RTMIN'], [35, 'RTMIN+1']]);
  assert.deepEqual(SIGNAL_LIST.at(-2), [63, 'RTMAX-1']);
  assert.deepEqual(SIGNAL_LIST.at(-1), [64, 'RTMAX']);
  assert.equal(signalName(9), 'KILL');
  assert.equal(signalName(50), 'RTMAX-14');
  assert.equal(signalName(32), null);
});

test('parseSignal reads numbers and names in any case, with or without SIG', () => {
  for (const spec of ['9', 'KILL', 'kill', 'SIGKILL', 'sigkill', 'SigKill']) assert.equal(parseSignal(spec), 9, spec);
  assert.equal(parseSignal('0'), 0);
  assert.equal(parseSignal('64'), 64);
  assert.equal(parseSignal('rtmin+2'), 36);
  for (const spec of ['65', '-1', 'NOPE', '', 'SIG', '9x', 'constructor', '__proto__']) assert.equal(parseSignal(spec), null, spec);
});

test('each signal has the default action the kernel takes', () => {
  assert.deepEqual([0, 1, 9, 15, 11, 36].map(defaultAction), ['none', 'terminate', 'terminate', 'terminate', 'terminate', 'terminate']);
  assert.deepEqual([19, 20, 21, 22].map(defaultAction), ['stop', 'stop', 'stop', 'stop']);
  assert.deepEqual([17, 23, 28].map(defaultAction), ['ignore', 'ignore', 'ignore']);
  assert.equal(defaultAction(18), 'continue');
});

test('only the signals an interactive bash neither ignores nor survives end it', () => {
  for (const sig of [1, 4, 6, 9, 10, 11, 12, 13, 14, 19, 31, 34, 64]) assert.equal(endsInteractiveShell(sig), true, String(sig));
  for (const sig of [0, 2, 3, 15, 17, 18, 20, 21, 22, 23, 28]) assert.equal(endsInteractiveShell(sig), false, String(sig));
});

test('asking about a number that is not a signal is a bug', () => {
  for (const sig of [-1, 65, 1.5, Number.NaN]) assert.throws(() => endsInteractiveShell(sig), /not a signal number/);
});

const sent = (command, args) => requestedSignal(command, args);

test('kill reads its signal the way the bash builtin does', () => {
  assert.deepEqual(sent('kill', ['123']), { status: 'send', signal: 15, spec: null, operands: ['123'] });
  const forms = [
    [['-s', 'HUP', '1'], 'HUP'], [['-HUP', '1'], 'HUP'], [['-1', '1'], '1'], [['-n', '1', '1'], '1'],
    [['-sHUP', '1'], 'HUP'], [['-n1', '1'], '1'], [['-s', 'hup', '1'], 'hup'], [['-SIGHUP', '1'], 'SIGHUP'],
  ];
  for (const [args, spec] of forms) assert.deepEqual(sent('kill', args), { status: 'send', signal: 1, spec, operands: ['1'] }, args.join(' '));
  assert.deepEqual(sent('kill', ['-9', '-15', '7']), { status: 'send', signal: 9, spec: '9', operands: ['-15', '7'] });
  assert.deepEqual(sent('kill', ['--', '7']), { status: 'send', signal: 15, spec: null, operands: ['7'] });
});

test('kill reports listings, missing values and invalid signals', () => {
  assert.equal(sent('kill', ['-l']).status, 'list');
  assert.deepEqual(sent('kill', ['-L', '9']), { status: 'list', signal: null, spec: null, operands: ['9'] });
  assert.deepEqual(sent('kill', ['-s']), { status: 'missing', signal: null, spec: '-s', operands: [] });
  assert.deepEqual(sent('kill', ['-sigkill', '7']), { status: 'invalid', signal: null, spec: 'igkill', operands: ['7'] });
  assert.deepEqual(sent('kill', ['-65', '7']), { status: 'invalid', signal: null, spec: '65', operands: ['7'] });
});

test('pkill takes -SIGNAL anywhere and --signal, and skips the values of its other options', () => {
  assert.deepEqual(sent('pkill', ['-9', 'sleep']), { status: 'send', signal: 9, spec: '9', operands: ['sleep'] });
  assert.deepEqual(sent('pkill', ['sleep', '-kill']), { status: 'send', signal: 9, spec: 'kill', operands: ['sleep'] });
  assert.deepEqual(sent('pkill', ['--signal', 'KILL', 'sleep']), { status: 'send', signal: 9, spec: 'KILL', operands: ['sleep'] });
  assert.deepEqual(sent('pkill', ['--signal=hup', 'sleep']), { status: 'send', signal: 1, spec: 'hup', operands: ['sleep'] });
  assert.deepEqual(sent('pkill', ['-u', 'hero', '-x', 'sleep']), { status: 'send', signal: 15, spec: null, operands: ['sleep'] });
  assert.deepEqual(sent('pkill', ['--signal']), { status: 'missing', signal: null, spec: '--signal', operands: [] });
  assert.deepEqual(sent('pkill', ['--signal', 'NOPE', 'x']), { status: 'invalid', signal: null, spec: 'NOPE', operands: ['x'] });
});

test('killall reads uppercase names and numbers, as psmisc does', () => {
  assert.deepEqual(sent('killall', ['-s', 'KILL', 'sleep']), { status: 'send', signal: 9, spec: 'KILL', operands: ['sleep'] });
  assert.deepEqual(sent('killall', ['-KILL', 'sleep']), { status: 'send', signal: 9, spec: 'KILL', operands: ['sleep'] });
  assert.deepEqual(sent('killall', ['sleep', '-SIGHUP']), { status: 'send', signal: 1, spec: 'SIGHUP', operands: ['sleep'] });
  assert.deepEqual(sent('killall', ['--signal=9', 'sleep']), { status: 'send', signal: 9, spec: '9', operands: ['sleep'] });
  assert.deepEqual(sent('killall', ['-9', 'sleep']), { status: 'send', signal: 9, spec: '9', operands: ['sleep'] });
  assert.deepEqual(sent('killall', ['-s', 'kill', 'sleep']), { status: 'invalid', signal: null, spec: 'kill', operands: ['sleep'] });
  assert.deepEqual(sent('killall', ['-sighup', 'sleep']), { status: 'invalid', signal: null, spec: 'ighup', operands: ['sleep'] });
  assert.equal(sent('killall', ['-l']).status, 'list');
  assert.deepEqual(sent('killall', ['-u', 'hero', 'sleep']).operands, ['sleep']);
});

test('only kill, pkill and killall send signals', () => {
  assert.throws(() => requestedSignal('ls', []), /does not send signals/);
});

test('a kill operand ends the session when it reaches the shell or every process', () => {
  const shell = 4242;
  for (const operand of ['4242', '0', '-4242']) {
    assert.equal(endsSession(operand, 9, shell), true, operand);
    assert.equal(endsSession(operand, 15, shell), false, operand);
  }
  assert.equal(endsSession('-1', 15, shell), true);
  assert.equal(endsSession('-1', 19, shell), true);
  assert.equal(endsSession('-1', 0, shell), false);
  assert.equal(endsSession('-1', 28, shell), false);
  assert.equal(endsSession('77', 9, shell), false);
  assert.equal(endsSession('-77', 9, shell), false);
  assert.equal(endsSession('abc', 9, shell), false);
});
