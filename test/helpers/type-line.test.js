import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeLine } from './type-line.js';

const COMPLETIONS = { 'cd fo': 'cd forest/', 'cd forest/ca': 'cd forest/cave/' };

function keyboard() {
  const calls = [];
  return {
    calls,
    complete: async line => {
      calls.push(['complete', line]);
      return { line: COMPLETIONS[line] ?? line, candidates: [] };
    },
    submit: async line => {
      calls.push(['submit', line]);
      return `ran ${line}`;
    },
  };
}

test('a line without a tab is submitted as it is', async () => {
  const keys = keyboard();
  assert.equal(await typeLine('pwd', keys), 'ran pwd');
  assert.deepEqual(keys.calls, [['submit', 'pwd']]);
});

test('a tab completes the text before it, then the rest is typed after the completion', async () => {
  const keys = keyboard();
  await typeLine('cd fo\t', keys);
  assert.deepEqual(keys.calls, [['complete', 'cd fo'], ['submit', 'cd forest/']]);
});

test('several tabs complete one after another', async () => {
  const keys = keyboard();
  await typeLine('cd fo\tca\t', keys);
  assert.deepEqual(keys.calls, [['complete', 'cd fo'], ['complete', 'cd forest/ca'], ['submit', 'cd forest/cave/']]);
});

test('Ctrl+C and Ctrl+Z written after the text are keys pressed while the line runs', async () => {
  const calls = [];
  const keys = { complete: async line => ({ line }), submit: async (line, pressed) => calls.push([line, pressed]) };
  await typeLine('sleep 100\u001a', keys);
  await typeLine('fg\u0003', keys);
  await typeLine('ls', keys);
  assert.deepEqual(calls, [['sleep 100', ['ctrl-z']], ['fg', ['ctrl-c']], ['ls', []]]);
});
