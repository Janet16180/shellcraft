import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runningKey, wireRunning } from '../../src/ui/running.js';

// An element whose listeners run in order and honour stopImmediatePropagation, as the DOM's do.
function element() {
  const listeners = {};
  return {
    hidden: false,
    focused: 0,
    innerHTML: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
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
  const parts = { input: element(), promptEl: element(), keys: element(), busy: element(), note: element() };
  parts.input.setAttribute('aria-label', 'Type a command and press Enter');
  parts.busy.hidden = true;
  parts.note.hidden = true;
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

test('while a command runs a busy mark replaces the prompt and the task strip says which keys stop it', () => {
  const { parts, running } = setup();
  running.set(true);
  assert.equal(parts.busy.hidden, false);
  assert.equal(parts.note.hidden, false);
  assert.match(parts.note.innerHTML, /Running/);
  assert.match(parts.note.innerHTML, /<kbd>Ctrl\+C<\/kbd> stops it/);
  assert.match(parts.note.innerHTML, /<kbd>Ctrl\+Z<\/kbd> pauses it/);
});

test('while a command runs the input is labelled with what is going on, for screen readers', () => {
  const { parts, running } = setup();
  running.set(true);
  assert.match(parts.input.getAttribute('aria-label'), /A command is running.*Ctrl\+C stops it.*Ctrl\+Z pauses it/);
  running.set(false);
  assert.equal(parts.input.getAttribute('aria-label'), 'Type a command and press Enter');
});

test('when the command ends the busy mark and the strip note go, and the note is emptied', () => {
  const { parts, running } = setup();
  running.set(true);
  running.set(false);
  assert.equal(parts.busy.hidden, true);
  assert.equal(parts.note.hidden, true);
  assert.equal(parts.note.innerHTML, '');
});

test('saying the same state twice changes nothing, so the label is never lost', () => {
  const { parts, running } = setup();
  running.set(true);
  running.set(true);
  running.set(false);
  running.set(false);
  assert.equal(parts.input.getAttribute('aria-label'), 'Type a command and press Enter');
  assert.equal(parts.promptEl.hidden, false);
});

test('the Ctrl+Z touch key sends SIGTSTP while a command runs', () => {
  const { parts, sent, running } = setup();
  running.set(true);
  parts.keys.fire('click', button('C-z'));
  assert.deepEqual(sent, ['TSTP']);
});
