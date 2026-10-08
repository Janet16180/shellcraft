import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerminal } from '../../src/ui/terminal.js';

// Just enough of the DOM for the terminal: elements that hold children,
// attributes and listeners, and the few globals it reads.
function element() {
  const listeners = {};
  const attributes = {};
  const el = {
    children: [], innerHTML: '', textContent: '', className: '', value: '', type: 'text', style: {},
    selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollHeight: 0, clientWidth: 800,
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    fire: (type, event = {}) => { for (const fn of listeners[type] ?? []) fn({ preventDefault() {}, ...event }); },
    setAttribute: (name, value) => { attributes[name] = String(value); },
    getAttribute: name => attributes[name] ?? null,
    append: child => {
      child.parent = el;
      el.children.push(child);
    },
    remove() { if (el.parent) el.parent.children = el.parent.children.filter(c => c !== el); },
    replaceChildren: () => { el.children = []; },
    get childElementCount() { return el.children.length; },
    get firstElementChild() { return el.children[0]; },
    focus() {},
    setSelectionRange() {},
    getBoundingClientRect: () => ({ width: 80 }),
    closest: () => null,
  };
  return el;
}

function page() {
  globalThis.document = { createElement: () => element(), fonts: { ready: new Promise(() => {}) } };
  globalThis.ResizeObserver = function ResizeObserver() { return { observe() {} }; };
  globalThis.getComputedStyle = () => ({ paddingLeft: '0', paddingRight: '0' });
  globalThis.requestAnimationFrame = fn => fn();
  globalThis.getSelection = () => ({ toString: () => '' });
  const parts = Object.fromEntries(['out', 'screen', 'cmd', 'prompt', 'termTitle', 'keys'].map(id => [id, element()]));
  parts.cmd.setAttribute('aria-label', 'Type a command and press Enter');
  const root = { querySelector: selector => parts[selector.slice(1)] };
  const sent = { lines: [], answers: [], completions: [] };
  const queue = { add: step => Promise.resolve().then(step) };
  const terminal = createTerminal({
    root, queue, onComplete: async line => { sent.completions.push(line); return { line, candidates: [] }; },
    onSubmit: async line => { sent.lines.push(line); },
    onAnswer: async text => { sent.answers.push(text); },
  });
  terminal.setPrompt({ user: 'hero', host: 'kernelia', cwd: '/home/hero', home: '/home/hero' });
  const key = (k, more = {}) => parts.cmd.fire('keydown', { key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...more });
  const typeKeys = text => {
    parts.cmd.value += text;
    parts.cmd.fire('input');
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  const shown = () => parts.out.children.map(c => c.innerHTML).join('\n');
  return { terminal, parts, sent, key, typeKeys, settle, shown };
}

const ASK = { prompt: '[sudo] password for hero: ', hidden: true };

test('asking for hidden input shows the prompt before the input and labels it password', () => {
  const { terminal, parts } = page();
  parts.cmd.value = 'half a command';
  terminal.ask(ASK);
  assert.equal(parts.prompt.innerHTML, '[sudo] password for hero: ');
  assert.equal(parts.cmd.getAttribute('aria-label'), 'password');
  assert.equal(parts.cmd.type, 'password');
  assert.equal(parts.cmd.value, '');
});

test('typed characters never show, Backspace takes one back, and Enter sends the line as an answer', async () => {
  const { terminal, parts, sent, key, typeKeys, settle, shown } = page();
  terminal.ask(ASK);
  typeKeys('dragx');
  assert.equal(parts.cmd.value, '');
  key('Backspace');
  typeKeys('on');
  key('Enter');
  await settle();
  assert.deepEqual(sent.answers, ['dragon']);
  assert.deepEqual(sent.lines, []);
  assert.doesNotMatch(shown(), /drag/);
});

test('after the answer the input is a command line again, and the password is not in its history', async () => {
  const { terminal, parts, sent, key, typeKeys, settle } = page();
  parts.cmd.value = 'sudo ls';
  key('Enter');
  await settle();
  terminal.ask(ASK);
  typeKeys('dragon');
  key('Enter');
  await settle();
  assert.equal(parts.cmd.getAttribute('aria-label'), 'Type a command and press Enter');
  assert.equal(parts.cmd.type, 'text');
  assert.match(parts.prompt.innerHTML, /hero@kernelia/);
  key('ArrowUp');
  assert.equal(parts.cmd.value, 'sudo ls');
  typeKeys(' -l');
  assert.equal(parts.cmd.value, 'sudo ls -l');
  assert.deepEqual(sent.lines, ['sudo ls']);
});

test('Ctrl+C at the prompt sends no line (null); Tab and the arrows do nothing there', async () => {
  const { terminal, parts, sent, key, typeKeys, settle } = page();
  terminal.ask(ASK);
  typeKeys('dra');
  key('Tab');
  key('ArrowUp');
  assert.equal(parts.cmd.value, '');
  key('c', { ctrlKey: true });
  await settle();
  assert.deepEqual(sent.answers, [null]);
  assert.equal(parts.cmd.getAttribute('aria-label'), 'Type a command and press Enter');
});

test('a new shell prompt arriving while the program asks waits until the answer is sent', async () => {
  const { terminal, parts, key, settle } = page();
  terminal.ask(ASK);
  terminal.setPrompt({ user: 'hero', host: 'kernelia', cwd: '/tmp', home: '/home/hero' });
  assert.equal(parts.prompt.innerHTML, '[sudo] password for hero: ');
  key('Enter');
  await settle();
  assert.match(parts.prompt.innerHTML, /\/tmp/);
});

const touch = (parts, k) => parts.keys.fire('click', { target: { closest: () => ({ dataset: { k } }) } });

test('the touch keys for history and Tab do nothing at a password prompt, and their letters stay hidden', async () => {
  const { terminal, parts, sent, settle } = page();
  parts.cmd.value = 'sudo ls';
  parts.cmd.fire('keydown', { key: 'Enter', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false });
  await settle();
  terminal.ask(ASK);
  touch(parts, 'Up');
  assert.equal(parts.cmd.value, '');
  touch(parts, 'Tab');
  touch(parts, '/');
  assert.equal(parts.cmd.value, '');
  touch(parts, 'Enter');
  await settle();
  assert.deepEqual(sent.answers, ['/']);
  assert.deepEqual(sent.completions, []);
});

test('abandoning a prompt (a new world was loaded) makes the input a command line again without sending an answer', async () => {
  const { terminal, parts, sent, key, typeKeys, settle } = page();
  terminal.ask(ASK);
  typeKeys('drag');
  terminal.abandon();
  assert.equal(parts.cmd.type, 'text');
  assert.equal(parts.cmd.getAttribute('aria-label'), 'Type a command and press Enter');
  assert.match(parts.prompt.innerHTML, /hero@kernelia/);
  typeKeys('ls');
  key('Enter');
  await settle();
  assert.deepEqual(sent.lines, ['ls']);
  assert.deepEqual(sent.answers, []);
});

test('abandon does nothing when no program is asking', () => {
  const { terminal, parts } = page();
  parts.cmd.value = 'ls';
  terminal.abandon();
  assert.equal(parts.cmd.value, 'ls');
});

test('a screen reader hears the prompt: a hidden line in the output log says it, and goes when the answer is sent', async () => {
  const { terminal, parts, key, settle } = page();
  terminal.ask(ASK);
  const said = parts.out.children.at(-1);
  assert.equal(said.className, 'ln sr-only');
  assert.match(said.innerHTML, /\[sudo\] password for hero:.*nothing you type shows/);
  key('Enter');
  await settle();
  assert.equal(parts.out.children.includes(said), false);
});
