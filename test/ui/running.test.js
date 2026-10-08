import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runningKey, wireRunning } from '../../src/ui/running.js';

// An element whose listeners run in order and honour stopImmediatePropagation, as the DOM's do.
function element() {
  const listeners = {};
  return {
    hidden: false,
    focused: 0,
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    focus() { this.focused++; },
    fire(type, fields = {}) {
      const event = { defaultPrevented: false, stopped: false, ...fields };
      event.preventDefault = () => { event.defaultPrevented = true; };
      event.stopImmediatePropagation = () => { event.stopped = true; };
      for (const fn of listeners[type] ?? []) if (!event.stopped) fn(event);
      return event;
    },
  };
}

const keydown = (key, more = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...more });
const button = k => ({ target: { closest: () => ({ dataset: { k } }) } });

function setup() {
  const parts = { input: element(), promptEl: element(), keys: element() };
  const sent = [];
  const later = [];
  const running = wireRunning(parts, name => sent.push(name));
  parts.input.addEventListener('keydown', event => later.push(event.key));
  parts.keys.addEventListener('click', () => later.push('click'));
  return { parts, sent, later, running };
}

test('Ctrl+C is SIGINT and Ctrl+Z is SIGTSTP; other keys are not signals', () => {
  assert.equal(runningKey(keydown('c', { ctrlKey: true })), 'INT');
  assert.equal(runningKey(keydown('Z', { ctrlKey: true, shiftKey: true })), 'TSTP');
  assert.equal(runningKey(keydown('c')), null);
  assert.equal(runningKey(keydown('c', { ctrlKey: true, altKey: true })), null);
});

test('while a command runs the prompt hides, and Ctrl+C and Ctrl+Z go to it, nothing else', () => {
  const { parts, sent, later, running } = setup();
  running.set(true);
  assert.equal(parts.promptEl.hidden, true);
  const ctrlZ = parts.input.fire('keydown', keydown('z', { ctrlKey: true }));
  assert.equal(ctrlZ.defaultPrevented, true);
  parts.input.fire('keydown', keydown('c', { ctrlKey: true }));
  assert.deepEqual(sent, ['TSTP', 'INT']);
  assert.deepEqual(later, []);
});

test('while a command runs Enter, Tab, the arrows and Ctrl keys do nothing; letters and paste work', () => {
  const { parts, sent, later, running } = setup();
  running.set(true);
  for (const key of ['Enter', 'Tab', 'ArrowUp', 'ArrowDown']) assert.equal(parts.input.fire('keydown', keydown(key)).defaultPrevented, true);
  assert.equal(parts.input.fire('keydown', keydown('r', { ctrlKey: true })).defaultPrevented, true);
  assert.equal(parts.input.fire('keydown', keydown('l')).defaultPrevented, false);
  assert.equal(parts.input.fire('keydown', keydown('v', { ctrlKey: true })).defaultPrevented, false);
  assert.deepEqual(sent, []);
  assert.deepEqual(later, ['l', 'v']);
});

test('the Ctrl+C touch key sends SIGINT while a command runs; the other touch keys wait', () => {
  const { parts, sent, later, running } = setup();
  running.set(true);
  parts.keys.fire('click', button('C-c'));
  parts.keys.fire('click', button('Enter'));
  assert.deepEqual(sent, ['INT']);
  assert.deepEqual(later, []);
  assert.equal(parts.input.focused, 2);
});

test('when the command ends the prompt comes back and the keys are the terminal own again', () => {
  const { parts, sent, later, running } = setup();
  running.set(true);
  running.set(false);
  assert.equal(parts.promptEl.hidden, false);
  parts.input.fire('keydown', keydown('c', { ctrlKey: true }));
  parts.keys.fire('click', button('C-c'));
  assert.deepEqual(sent, []);
  assert.deepEqual(later, ['c', 'click']);
});
