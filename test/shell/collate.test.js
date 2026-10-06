import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareNames } from '../../src/shell/collate.js';

test('names sort ignoring a leading dot and case', () => {
  assert.deepEqual(['b', '.a', 'C'].sort(compareNames), ['.a', 'b', 'C']);
});
