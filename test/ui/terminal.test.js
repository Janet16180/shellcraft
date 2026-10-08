import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerminal } from '../../src/ui/terminal.js';

// Just enough of the DOM for the terminal: elements that hold children,
// attributes and listeners, and the few globals it reads.
function element() {
  const listeners = {};
  const attributes = {};
  const classes = new Set();
  const el = {
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
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
    setSelectionRange(start, end) {
      el.selectionStart = start;
      el.selectionEnd = end;
    },
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
  const parts = Object.fromEntries(['out', 'screen', 'cmd', 'prompt', 'termTitle', 'keys', 'searchTail', 'busy', 'runNote'].map(id => [id, element()]));
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

async function withHistory(lines) {
  const p = page();
  for (const line of lines) {
    p.parts.cmd.value = line;
    p.key('Enter');
  }
  await p.settle();
  p.sent.lines.length = 0;
  return p;
}

const HISTORY = ['echo alpha', 'echo beta', 'ls alpha'];
const ctrl = (key, k) => key(k, { ctrlKey: true });
const decode = html => html.replace(/<[^>]+>/g, '').replace(/&#39;/g, '\'').replace(/&amp;/g, '&');
const tailText = parts => decode(parts.searchTail.innerHTML);

test('Ctrl+R turns the prompt into bash\'s search prompt, and typing shows the newest match with the match marked', async () => {
  const { parts, key, typeKeys } = await withHistory(HISTORY);
  ctrl(key, 'r');
  assert.equal(parts.prompt.innerHTML, '(reverse-i-search)`');
  assert.equal(tailText(parts), '\': ');
  typeKeys('al');
  assert.equal(parts.cmd.value, 'al');
  assert.equal(tailText(parts), '\': ls alpha');
  assert.match(parts.searchTail.innerHTML, /ls <mark[^>]*>al<\/mark>pha/);
  assert.equal(parts.cmd.getAttribute('aria-label'), 'Search the history');
});

test('Ctrl+R again finds an older match, and a search that runs out says failed', async () => {
  const { parts, key, typeKeys } = await withHistory(HISTORY);
  ctrl(key, 'r');
  typeKeys('al');
  ctrl(key, 'r');
  assert.equal(tailText(parts), '\': echo alpha');
  ctrl(key, 'r');
  assert.equal(parts.prompt.innerHTML, '(failed reverse-i-search)`');
  assert.equal(tailText(parts), '\': echo alphano match');
  assert.doesNotMatch(parts.searchTail.innerHTML, /<mark/);
});

test('Enter runs the match exactly as found, echoed after the shell prompt, and saves it in history', async () => {
  const { parts, sent, key, typeKeys, settle, shown } = await withHistory(HISTORY);
  ctrl(key, 'r');
  typeKeys('beta');
  key('Enter');
  await settle();
  assert.deepEqual(sent.lines, ['echo beta']);
  assert.match(shown(), /\$ echo beta$/);
  assert.match(parts.prompt.innerHTML, /hero@kernelia/);
  assert.equal(parts.cmd.value, '');
  key('ArrowUp');
  assert.equal(parts.cmd.value, 'echo beta');
});

test('Escape keeps the match on the input line for editing, with the cursor where the match starts', async () => {
  const { parts, sent, key, typeKeys } = await withHistory(HISTORY);
  ctrl(key, 'r');
  typeKeys('b');
  key('Escape');
  assert.equal(parts.cmd.value, 'echo beta');
  assert.equal(parts.cmd.selectionStart, 5);
  assert.match(parts.prompt.innerHTML, /hero@kernelia/);
  assert.equal(parts.cmd.getAttribute('aria-label'), 'Type a command and press Enter');
  assert.deepEqual(sent.lines, []);
});

test('the left and right arrows keep the match and move the cursor one place from the start of the match', async () => {
  for (const [arrow, at] of [['ArrowLeft', 4], ['ArrowRight', 6]]) {
    const { parts, key, typeKeys } = await withHistory(HISTORY);
    ctrl(key, 'r');
    typeKeys('b');
    key(arrow);
    assert.equal(parts.cmd.value, 'echo beta');
    assert.equal(parts.cmd.selectionStart, at);
  }
});

test('Up after a search goes on from the line found', async () => {
  const { parts, key, typeKeys } = await withHistory(HISTORY);
  ctrl(key, 'r');
  typeKeys('ls');
  key('ArrowUp');
  assert.equal(parts.cmd.value, 'echo beta');
});

test('Ctrl+G gives back the line that was being typed, and Ctrl+C prints the search with ^C and empties the line', async () => {
  const g = await withHistory(HISTORY);
  g.parts.cmd.value = 'ec';
  g.parts.cmd.selectionStart = 2;
  ctrl(g.key, 'r');
  g.typeKeys('ls');
  ctrl(g.key, 'g');
  assert.equal(g.parts.cmd.value, 'ec');
  assert.match(g.parts.prompt.innerHTML, /hero@kernelia/);

  const c = await withHistory(HISTORY);
  ctrl(c.key, 'r');
  c.typeKeys('b');
  ctrl(c.key, 'c');
  assert.match(decode(c.shown()), /\(reverse-i-search\)`b': echo beta\^C$/);
  assert.equal(c.parts.cmd.value, '');
  assert.match(c.parts.prompt.innerHTML, /hero@kernelia/);
  assert.deepEqual(c.sent.lines, []);
});

test('Backspace in the search string searches again', async () => {
  const { parts, key, typeKeys } = await withHistory(HISTORY);
  ctrl(key, 'r');
  typeKeys('al');
  parts.cmd.value = 'a';
  parts.cmd.fire('input');
  assert.match(parts.searchTail.innerHTML, /ls <mark[^>]*>a<\/mark>lpha/);
});

test('the touch keys work in a search: Enter runs the match and Ctrl+C ends it', async () => {
  const { parts, sent, typeKeys, key, settle } = await withHistory(HISTORY);
  ctrl(key, 'r');
  typeKeys('ech');
  touch(parts, 'Enter');
  await settle();
  assert.deepEqual(sent.lines, ['echo beta']);
  touch(parts, 'C-r');
  touch(parts, '-');
  assert.equal(parts.cmd.value, '-');
  touch(parts, 'C-c');
  assert.equal(parts.cmd.value, '');
});

test('Ctrl+R at a password prompt does nothing, so the page does not reload', () => {
  const { terminal, parts } = page();
  terminal.ask(ASK);
  let prevented = false;
  parts.cmd.fire('keydown', { key: 'r', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(parts.prompt.innerHTML, '[sudo] password for hero: ');
});

test('Ctrl+A and Ctrl+E move the cursor to the start and the end of the line', () => {
  const { parts, key } = page();
  parts.cmd.value = 'cat note.txt';
  parts.cmd.selectionStart = 4;
  parts.cmd.selectionEnd = 4;
  key('a', { ctrlKey: true });
  assert.deepEqual([parts.cmd.selectionStart, parts.cmd.selectionEnd], [0, 0]);
  key('e', { ctrlKey: true });
  assert.deepEqual([parts.cmd.selectionStart, parts.cmd.selectionEnd], [12, 12]);
});

test('Ctrl+L clears the screen and keeps the line being typed', () => {
  const { terminal, parts, key } = page();
  terminal.printLine('old output');
  parts.cmd.value = 'ls';
  key('l', { ctrlKey: true });
  assert.equal(parts.out.children.length, 0);
  assert.equal(parts.cmd.value, 'ls');
});

test('Ctrl+Z at the prompt does nothing, as in bash: the line stays and the browser does not undo it', () => {
  const { parts, key } = page();
  parts.cmd.value = 'sleep 5';
  let prevented = false;
  key('z', { ctrlKey: true, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(parts.cmd.value, 'sleep 5');
});

test('the Ctrl+Z and Ctrl+R touch keys type nothing when no command runs: not at the prompt, a password prompt or a search', async () => {
  const { terminal, parts, sent, key, settle } = page();
  parts.cmd.value = 'ls';
  touch(parts, 'C-z');
  assert.equal(parts.cmd.value, 'ls');
  parts.cmd.value = '';
  touch(parts, 'C-r');
  touch(parts, 'C-z');
  assert.equal(parts.cmd.value, '');
  key('Escape');
  terminal.ask(ASK);
  touch(parts, 'C-z');
  touch(parts, 'C-r');
  touch(parts, 'Enter');
  await settle();
  assert.deepEqual(sent.answers, ['']);
});
