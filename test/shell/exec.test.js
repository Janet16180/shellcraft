import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from './helpers.js';
import { put, file } from '../../src/backend/spec.js';

test('&& runs the next pipeline only after success, || only after failure', async () => {
  const b = await shell();
  assert.equal((await run(b, 'false && echo no || echo yes')).out, 'yes\n');
  assert.equal((await run(b, 'true && echo a; false')).out, 'a\n');
  assert.equal((await run(b, 'echo $?')).out, '1\n');
});

test('a pipe feeds one command into the next and only the last prints', async () => {
  const r = await run(await shell(), 'cat readme.txt | wc -l');
  assert.equal(r.out, '2\n');
});

test('> replaces a file, >> appends, < reads one', async () => {
  const b = await shell();
  await run(b, 'echo one > notes.txt');
  await run(b, 'echo two >> notes.txt');
  assert.equal((await run(b, 'cat < notes.txt')).out, 'one\ntwo\n');
  await run(b, 'echo three > notes.txt');
  assert.equal((await run(b, 'cat notes.txt')).out, 'three\n');
});

test('a new file from a redirect belongs to the user with mode 644', async () => {
  const b = await shell();
  await run(b, 'echo x > new.txt');
  const node = (await b.observe()).tree.children.home.children.hero.children['new.txt'];
  assert.deepEqual([node.owner, node.group, node.mode], ['hero', 'hero', 0o644]);
});

test('redirect failures are reported by bash and fail the command', async () => {
  const b = await shell();
  assert.deepEqual(await run(b, 'echo x > /root/a').then(r => [r.err, r.status]), ['bash: /root/a: Permission denied\n', 1]);
  assert.equal((await run(b, 'echo x > nope/a')).err, 'bash: nope/a: No such file or directory\n');
  assert.equal((await run(b, 'echo x > forest')).err, 'bash: forest: Is a directory\n');
  assert.equal((await run(b, 'cat < missing')).err, 'bash: missing: No such file or directory\n');
});

test('output sent to /dev/null disappears', async () => {
  const b = await shell();
  assert.equal((await run(b, 'echo gone > /dev/null')).out, '');
  assert.equal((await run(b, 'cat /dev/null')).out, '');
});

test('an unknown command fails with 127 and a note for common mistakes', async () => {
  const b = await shell();
  const r = await run(b, 'cd..');
  assert.deepEqual([r.err, r.status], ['bash: cd..: command not found\n', 127]);
  assert.match(r.note, /space between cd and the dots/);
  assert.match((await run(b, 'LS')).note, /case-sensitive. Try ls/);
  assert.equal((await run(b, 'florp')).note, '');
});

test('aliases expand in the first word unless it is quoted', async () => {
  const b = await shell();
  const r = await run(b, 'll');
  assert.equal(r.result.commands[0].name, 'ls');
  assert.deepEqual(r.result.commands[0].args, ['-alF']);
  assert.equal((await run(b, "'ll'")).status, 127);
});

test('NAME=value sets a variable for later lines', async () => {
  const b = await shell();
  await run(b, 'SPELL=lumos');
  assert.equal((await run(b, 'echo $SPELL')).out, 'lumos\n');
});

test('--help prints the usage of a command with a manual page', async () => {
  const r = await run(await shell(), 'ls --help');
  assert.match(r.out, /^Usage: ls/);
});

test('an executable script runs its lines; without the x bit it is refused', async () => {
  const b = await shell([put('/home/hero/spell.sh', file('#!/bin/bash\necho magic\n', { owner: 'hero' }))]);
  const denied = await run(b, './spell.sh');
  assert.deepEqual([denied.err, denied.status], ['bash: ./spell.sh: Permission denied\n', 126]);
  const r = await runAll(b, ['chmod +x spell.sh', './spell.sh']);
  assert.equal(r.out, 'magic\n');
  assert.deepEqual(r.result.commands.map(c => c.name), ['./spell.sh']);
});

test('a program in /usr/bin runs by its full path', async () => {
  assert.equal((await run(await shell(), '/usr/bin/whoami')).out, 'hero\n');
});

test('clear writes the clear-screen sequence tagged with tone clear', async () => {
  const r = await (await shell()).run('clear');
  assert.deepEqual(r.output, [{ stream: 'out', text: '\u001b[H\u001b[2J\u001b[3J', tone: 'clear' }]);
});

test('syntax errors print the bash message and set status 2', async () => {
  const r = await run(await shell(), 'ls >');
  assert.deepEqual([r.err, r.status], ["bash: syntax error near unexpected token `newline'\n", 2]);
});

test('a line that ends where bash would ask for more fails with a note about the > prompt', async () => {
  const b = await shell();
  for (const line of ['ls |', "echo 'open"]) {
    const r = await run(b, line);
    assert.equal(r.status, 2);
    assert.match(r.note, /wait for the rest of the command/);
  }
});

test('variables expand when each command runs, after the commands before it', async () => {
  const b = await shell();
  assert.equal((await run(b, 'cd forest; echo $PWD')).out, '/home/hero/forest\n');
  assert.equal((await run(b, 'false; echo $?')).out, '1\n');
  assert.equal((await run(b, 'X=1; echo $X')).out, '1\n');
});

test('> creates the file before the command runs, so ls sees it', async () => {
  const b = await shell();
  await run(b, 'ls > list.txt');
  assert.equal((await run(b, 'cat list.txt')).out, 'forest\nlist.txt\nreadme.txt\n');
});

test('2> sends errors to a file and 2>&1 joins them to the output', async () => {
  const b = await shell();
  const quiet = await run(b, 'ls nope 2> err.txt');
  assert.deepEqual([quiet.err, quiet.status], ['', 2]);
  assert.equal((await run(b, 'cat err.txt')).out, "ls: cannot access 'nope': No such file or directory\n");
  assert.equal((await run(b, 'ls nope 2>&1 | wc -l')).out, '1\n');
  assert.equal((await run(b, 'ls nope 2>/dev/null; echo $?')).out, '2\n');
});

test('command substitution runs the inner line and inserts its output', async () => {
  const b = await shell();
  assert.equal((await run(b, 'echo "I am $(whoami) in $(pwd)"')).out, 'I am hero in /home/hero\n');
});

test('an assignment before a command applies to that command only', async () => {
  const b = await shell();
  assert.equal((await run(b, 'SPELL=fire printenv SPELL')).out, 'fire\n');
  assert.equal((await run(b, 'echo "[$SPELL]"')).out, '[]\n');
});

test('errors inside a script name the script and line', async () => {
  const b = await shell([put('/home/hero/s.sh', file('echo start\nnosuchcmd\n', { owner: 'hero', mode: 0o755 }))]);
  const r = await run(b, './s.sh');
  assert.deepEqual([r.out, r.err, r.status], ['start\n', './s.sh: line 2: nosuchcmd: command not found\n', 127]);
});

test('a script run with 2>/dev/null hides its errors', async () => {
  const b = await shell([put('/home/hero/s.sh', file('nosuchcmd\n', { owner: 'hero', mode: 0o755 }))]);
  assert.equal((await run(b, './s.sh 2>/dev/null')).err, '');
});
