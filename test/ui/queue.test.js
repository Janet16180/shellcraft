import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../../src/ui/queue.js';

test('steps run one after another, in the order they were added', async () => {
  const queue = createQueue();
  const seen = [];
  const slow = queue.add(() => new Promise(resolve => setTimeout(() => { seen.push('slow'); resolve(); }, 20)));
  const fast = queue.add(() => { seen.push('fast'); });
  await Promise.all([slow, fast]);
  assert.deepEqual(seen, ['slow', 'fast']);
});

test('a step resolves with its own result', async () => {
  assert.equal(await createQueue().add(() => 42), 42);
});

test('a failing step rejects its own promise and the next step still runs', async () => {
  const queue = createQueue();
  const failed = queue.add(() => { throw new Error('boom'); });
  const after = queue.add(() => 'ran');
  await assert.rejects(failed, /boom/);
  assert.equal(await after, 'ran');
});
