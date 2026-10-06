import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToasts } from '../../src/ui/toasts.js';

function harness() {
  const log = [];
  const timers = [];
  const toasts = createToasts({
    show: html => log.push(`show ${html}`),
    hide: () => log.push('hide'),
    wait: done => {
      const timer = { done, cancelled: false, cancel() { this.cancelled = true; } };
      timers.push(timer);
      return timer;
    },
  });
  const elapse = () => timers.filter(t => !t.cancelled).shift()?.done();
  return { toasts, log, elapse };
}

test('toasts show one at a time, each after the one before has gone', () => {
  const { toasts, log, elapse } = harness();
  toasts.add('a');
  toasts.add('b');
  assert.deepEqual(log, ['show a']);
  elapse();
  assert.deepEqual(log, ['show a', 'hide', 'show b']);
});

test('while a card is open no toast shows; they all wait for it to close', () => {
  const { toasts, log } = harness();
  toasts.hold();
  toasts.add('a');
  assert.deepEqual(log, []);
  toasts.release();
  assert.deepEqual(log, ['show a']);
});

test('a toast cut off by a card opening shows again, in full, when the card closes', () => {
  const { toasts, log, elapse } = harness();
  toasts.add('task done');
  toasts.hold();
  assert.deepEqual(log, ['show task done', 'hide']);
  elapse();
  assert.deepEqual(log, ['show task done', 'hide'], 'its old timer no longer fires');
  toasts.release();
  assert.deepEqual(log, ['show task done', 'hide', 'show task done']);
});
