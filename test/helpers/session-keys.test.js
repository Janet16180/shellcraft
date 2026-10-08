import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionKeys, createClock } from './session-keys.js';
import { typeLine } from './type-line.js';

// A session-like stub: one line runs, then ends by poll or a key.
function stub() {
  const calls = [];
  const turn = result => ({ result });
  return {
    calls,
    complete: async line => ({ line, candidates: [] }),
    submit: async line => {
      calls.push(['submit', line]);
      if (line.startsWith('sudo')) return turn({ output: [], input: { prompt: 'p: ' } });
      return turn(line.startsWith('sleep') ? { output: [], running: { seconds: line.includes('infinity') ? null : 5 } } : { output: [] });
    },
    answer: async text => { calls.push(['answer', text]); return turn({ output: [] }); },
    poll: async () => { calls.push(['poll']); return turn({ output: [] }); },
    signal: async name => { calls.push(['signal', name]); return turn({ output: [] }); },
  };
}

test('a running line waits on the clock until it ends, then polls', async () => {
  const session = stub();
  const clock = createClock(1000);
  await typeLine('sleep 5', sessionKeys(session, { tick: clock.tick }));
  assert.equal(clock.now(), 6000);
  assert.deepEqual(session.calls, [['submit', 'sleep 5'], ['poll']]);
});

test('keys written at the end of a line are pressed while it runs', async () => {
  const session = stub();
  await typeLine('sleep 5\u001a', sessionKeys(session, { tick: createClock().tick }));
  assert.deepEqual(session.calls, [['submit', 'sleep 5'], ['signal', 'TSTP']]);
});

test('a prompt is answered with the password, and raises without one; a line that never ends raises', async () => {
  const session = stub();
  await typeLine('sudo ls', sessionKeys(session, { password: 'dragon' }));
  assert.deepEqual(session.calls.at(-1), ['answer', 'dragon']);
  await assert.rejects(typeLine('sudo ls', sessionKeys(session)), /asked for input/);
  await assert.rejects(typeLine('sleep infinity', sessionKeys(session, { tick: createClock().tick })), /never ends/);
});
