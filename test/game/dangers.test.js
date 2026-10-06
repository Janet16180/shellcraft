import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext } from '../../src/game/checks.js';
import { dangers } from '../../src/game/dangers.js';
import { HOME, observation, record } from '../helpers/records.js';

const SHELL = { pid: 733, ppid: 1, user: 'hero', tty: 'pts/0', stat: 'Ss', cpu: 0, mem: 0.1, cmd: '-bash', key: 'shell' };

const context = (commands, after = {}, before = {}) =>
  makeContext({ commands, before: observation(before), obs: observation(after) });

test('rm -r of the root, of home or of a directory holding home is dangerous however it is written', () => {
  const lines = [
    record('rm', ['-rf', '/']),
    record('rm', ['-R', '//']),
    record('rm', ['--recursive', '~']),
    record('rm', ['-r', HOME]),
    record('rm', ['-r', '~/']),
    record('rm', ['-rf', '/home']),
    record('rm', ['-r', '/home/']),
  ];
  for (const r of lines) assert.equal(dangers(context([r])).length, 1, r.args.join(' '));
});

test('rm -r of anything else, or rm without -r, is not dangerous', () => {
  const lines = [
    record('rm', ['-r', 'forest']), record('rm', ['/']), record('rm', ['-f', HOME]), record('ls', ['-r', '/']),
    record('rm', ['-r', '/home/heroine']), record('rm', ['-r', '/hom']),
  ];
  for (const r of lines) assert.deepEqual(dangers(context([r])), [], `${r.name} ${r.args.join(' ')}`);
});

test('rm -r of . or .. is not dangerous because rm refuses those names', () => {
  const lines = [record('rm', ['-r', '.']), record('rm', ['-fr', '..'], { cwd: `${HOME}/forest` }), record('rm', ['-r', `${HOME}/.`])];
  for (const r of lines) assert.deepEqual(dangers(context([r])), [], `${r.name} ${r.args.join(' ')}`);
});

const killing = (name, args) => dangers(context([record(name, args)], {}, { procs: [SHELL] }));

test('kill -9 of the player shell is dangerous however the signal is written', () => {
  const lines = [['-9', '733'], ['-KILL', '733'], ['-SIGKILL', '733'], ['-s', 'KILL', '733'], ['-s', '9', '733'], ['-n', 'sigkill', '733'], ['-sKILL', '733']];
  for (const args of lines) assert.equal(killing('kill', args).length, 1, args.join(' '));
});

test('every signal that ends or stops an interactive bash is dangerous when sent to the player shell', () => {
  const lines = [['-HUP', '733'], ['-1', '733'], ['-STOP', '733'], ['-s', 'USR1', '733'], ['-ABRT', '733'], ['-s', 'alrm', '733']];
  for (const args of lines) assert.equal(killing('kill', args).length, 1, args.join(' '));
});

test('signals an interactive bash ignores or survives are not dangerous', () => {
  const lines = [['733'], ['-15', '733'], ['-s', 'TERM', '733'], ['-INT', '733'], ['-QUIT', '733'], ['-TSTP', '733'], ['-CONT', '733'], ['-0', '733']];
  for (const args of lines) assert.deepEqual(killing('kill', args), [], args.join(' '));
});

test('a kill that sends nothing, or sends to another process, is not dangerous', () => {
  const lines = [['-l'], ['-s'], ['-sigkill', '733'], ['-9', '4242'], ['-9', '7330']];
  for (const args of lines) assert.deepEqual(killing('kill', args), [], args.join(' '));
});

test('pkill and killall of bash with a deadly signal are dangerous', () => {
  const lines = [
    ['pkill', ['-9', 'bash']], ['pkill', ['--signal', 'KILL', 'bash']], ['pkill', ['--signal=HUP', 'bash']], ['pkill', ['-u', 'hero', '-9', 'bash']],
    ['killall', ['-9', 'bash']], ['killall', ['-s', 'KILL', 'bash']], ['killall', ['-HUP', 'bash']],
  ];
  for (const [name, args] of lines) assert.equal(killing(name, args).length, 1, `${name} ${args.join(' ')}`);
});

test('pkill and killall of something else, with a polite signal, or with a bad one are not dangerous', () => {
  const lines = [
    ['pkill', ['bash']], ['pkill', ['-9', 'sleep']], ['killall', ['bash']], ['killall', ['-9', 'shadow']],
    ['killall', ['-s', 'kill', 'bash']], ['killall', ['-kill', 'bash']],
  ];
  for (const [name, args] of lines) assert.deepEqual(killing(name, args), [], `${name} ${args.join(' ')}`);
});

test('the shell reason names the signal, and says STOP freezes the shell instead of ending it', () => {
  assert.match(killing('kill', ['-HUP', '733'])[0], /^SIGHUP to your own shell ends it\./);
  assert.match(killing('pkill', ['-9', 'bash'])[0], /^SIGKILL to your own shell ends it\./);
  assert.match(killing('kill', ['-STOP', '733'])[0], /^SIGSTOP to your own shell freezes it\./);
});

test('a dangerous attempt counts even when the command failed', () => {
  assert.equal(dangers(context([record('rm', ['-rf', '/'], { status: 1 })])).length, 1);
});

test('each dangerous command in a line gives one reason', () => {
  const line = [record('rm', ['-rf', '/']), record('kill', ['-9', '733'])];
  assert.equal(dangers(context(line, {}, { procs: [SHELL] })).length, 2);
});

test('a command named like an object property is not dangerous', () => {
  for (const name of ['constructor', 'toString', '__proto__']) assert.deepEqual(dangers(context([record(name, [], { status: 127 })])), [], name);
});

test('the reasons are the game\'s own beginner sentences', () => {
  const [root] = dangers(context([record('rm', ['-rf', '/'])]));
  const [home] = dangers(context([record('rm', ['-r', '~'])]));
  const [shell] = dangers(context([record('kill', ['-9', '733'])], {}, { procs: [SHELL] }));
  assert.match(root, /--preserve-root/);
  assert.match(home, /delete everything in your home/);
  assert.match(shell, /your own shell/);
});
