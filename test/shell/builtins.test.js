import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTINS, NO_BINARY } from '../../src/shell/builtins.js';

test('every builtin without a program is a builtin', () => {
  for (const name of NO_BINARY) assert.ok(BUILTINS.has(name), name);
});

test('echo and pwd are builtins that also have a program', () => {
  assert.ok(BUILTINS.has('echo') && !NO_BINARY.has('echo'));
  assert.ok(BUILTINS.has('pwd') && !NO_BINARY.has('pwd'));
});
