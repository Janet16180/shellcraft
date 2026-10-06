import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, BINARIES } from '../../../src/shell/commands/index.js';

test('the table has every v1 command except the game helpers', () => {
  for (const name of ['ls', 'cd', 'cat', 'grep', 'find', 'ps', 'kill', 'man', 'chmod', 'tree', 'help']) assert.equal(typeof COMMANDS[name], 'function', name);
  for (const name of ['hint', 'quest']) assert.equal(COMMANDS[name], undefined);
});

test('binaries are the commands that are programs, sorted', () => {
  assert.ok(BINARIES.includes('ls'));
  assert.ok(BINARIES.includes('echo'));
  assert.ok(!BINARIES.includes('cd'));
  assert.deepEqual(BINARIES, [...BINARIES].sort());
});
