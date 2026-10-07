import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from '../helpers.js';
import { put, file, dir } from '../../../src/backend/spec.js';

test('man prints a page with a note about the pager, and errors like man-db', async () => {
  const b = await shell();
  const r = await run(b, 'man ls');
  assert.match(r.out, /^LS\(1\)/);
  assert.match(r.note, /pager/);
  assert.deepEqual(await run(b, 'man nope').then(x => [x.err, x.status]), ['No manual entry for nope\n', 16]);
  assert.equal((await run(b, 'man')).status, 1);
});

test('which finds programs in PATH; builtins without a program are not found', async () => {
  const b = await shell();
  assert.equal((await run(b, 'which ls')).out, '/usr/bin/ls\n');
  const cd = await run(b, 'which cd');
  assert.deepEqual([cd.out, cd.status], ['', 1]);
});

test('type tells aliases, builtins and programs apart', async () => {
  const r = await run(await shell(), 'type ll cd ls nope');
  assert.equal(r.out, "ll is aliased to `ls -alF'\ncd is a shell builtin\nls is /usr/bin/ls\n");
  assert.equal(r.err, 'bash: type: nope: not found\n');
});

test('alias defines and shows aliases', async () => {
  const b = await shell();
  await run(b, "alias l='ls -1'");
  assert.equal((await run(b, 'alias l')).out, "alias l='ls -1'\n");
  assert.equal((await run(b, 'l')).out, 'forest\nreadme.txt\n');
  assert.equal((await run(b, 'alias zz')).err, 'bash: alias: zz: not found\n');
});

test('export sets variables that env and printenv show', async () => {
  const b = await shell();
  await run(b, 'export SPELL=fire');
  assert.match((await run(b, 'env')).out, /^SPELL=fire$/m);
  assert.equal((await run(b, 'printenv SPELL HOME')).out, 'fire\n/home/hero\n');
});

test('sudo refuses a user outside the sudoers file', async () => {
  const r = await run(await shell(), 'sudo ls');
  assert.equal(r.status, 1);
  assert.match(r.err, /hero is not in the sudoers file/);
});

test('editors, exit and a bare bash explain themselves with a note', async () => {
  const b = await shell();
  for (const cmd of ['nano x', 'vim x', 'exit', 'bash']) assert.notEqual((await run(b, cmd)).note, '', cmd);
});

test('bash FILE runs a script without needing the execute bit', async () => {
  const b = await shell([put('/home/hero/s.sh', file('echo hi\necho there\n', { owner: 'hero' }))]);
  assert.equal((await run(b, 'bash s.sh')).out, 'hi\nthere\n');
});

test('help lists the simulated commands without game helpers', async () => {
  const r = await run(await shell(), 'help');
  assert.match(r.out, /grep/);
  assert.doesNotMatch(r.out, /hint|quest/);
});

test('type says a program is hashed after it has run', async () => {
  const b = await shell();
  assert.equal((await run(b, 'type ls')).out, 'ls is /usr/bin/ls\n');
  await run(b, 'ls > /dev/null');
  assert.equal((await run(b, 'type ls')).out, 'ls is hashed (/usr/bin/ls)\n');
});

test('unalias removes an alias', async () => {
  const b = await shell();
  await run(b, 'unalias ll');
  assert.equal((await run(b, 'll')).status, 127);
  assert.equal((await run(b, 'unalias zz')).err, 'bash: unalias: zz: not found\n');
});

test('printenv fails with no output for an unset variable', async () => {
  const r = await run(await shell(), 'printenv NOPE');
  assert.deepEqual([r.out, r.status], ['', 1]);
});

test('history skips lines that start with a space and repeated lines, like Ubuntu', async () => {
  const r = await runAll(await shell(), ['pwd', 'pwd', ' echo secret', 'ls', 'history']);
  assert.equal(r.out, '    1  pwd\n    2  ls\n    3  history\n');
});

test('export alone lists the environment as declare -x lines; unset removes a variable', async () => {
  const b = await shell();
  await run(b, 'export SPELL=\'say "hi"\'');
  assert.match((await run(b, 'export')).out, /^declare -x SPELL="say \\"hi\\""$/m);
  await run(b, 'unset SPELL');
  assert.equal((await run(b, 'echo "[$SPELL]"')).out, '[]\n');
});

test('a builtin given --help prints its bash usage line and summary, with status 2', async () => {
  const b = await shell();
  const pwd = await run(b, 'pwd --help');
  assert.deepEqual([pwd.out, pwd.status], ['pwd: pwd [-LP]\n    Print the name of the current working directory.\n', 2]);
  assert.match(pwd.note, /help pwd/);
  assert.equal((await run(b, 'cd --help')).out.split('\n')[0], 'cd: cd [-L|[-P [-e]] [-@]] [dir]');
  assert.equal((await run(b, 'echo --help')).out, '--help\n');
  assert.equal((await run(b, 'true --help')).status, 0);
});

test('help NAME shows a builtin the same way, with status 0', async () => {
  const r = await run(await shell(), 'help cd');
  assert.deepEqual([r.out.split('\n')[1], r.status], ['    Change the shell working directory.', 0]);
  assert.equal((await run(await shell(), 'help nope')).err, 'bash: help: no help topics match `nope\'.  Try `help help\' or `man -k nope\' or `info nope\'.\n');
});

test('builtins like cd have no manual page; the note points to help', async () => {
  const r = await run(await shell(), 'man cd');
  assert.deepEqual([r.err, r.status], ['No manual entry for cd\n', 16]);
  assert.match(r.note, /help cd/);
});

test('the clear page describes clear itself', async () => {
  const page = (await run(await shell(), 'man clear')).out;
  assert.doesNotMatch(page, /Ctrl\+L/);
  assert.match(page, /scrollback/);
});

test('man -k searches page names and descriptions like apropos', async () => {
  const b = await shell();
  const r = await run(b, 'man -k directory');
  assert.match(r.out, /^ls \(1\) {15}- list directory contents$/m);
  assert.match(r.out, /^pwd \(1\) {14}- print name of current\/working directory$/m);
  assert.match(r.note, /only the pages of the commands it simulates/);
  assert.deepEqual(await run(b, 'man -k zzz').then(x => [x.err, x.status]), ['zzz: nothing appropriate.\n', 16]);
  assert.deepEqual(await run(b, 'man -k').then(x => [x.out, x.err, x.status]), ['apropos what?\n', '', 1]);
  assert.deepEqual(await run(b, 'man -f').then(x => [x.out, x.err, x.status]), ['whatis what?\n', '', 1]);
});

test('apropos and whatis search the pages like man -k and man -f', async () => {
  const b = await shell();
  const found = await run(b, 'apropos directory');
  assert.equal(found.out, (await run(b, 'man -k directory')).out);
  assert.match(found.note, /only the pages of the commands it simulates/);
  assert.equal((await run(b, 'whatis ls')).out, 'ls (1)               - list directory contents\n');
  const missing = await run(b, 'whatis ls nope');
  assert.deepEqual([missing.out, missing.err, missing.status], ['ls (1)               - list directory contents\n', 'nope: nothing appropriate.\n', 16]);
  assert.deepEqual(await run(b, 'apropos').then(x => [x.out, x.status]), ['apropos what?\n', 1]);
  assert.deepEqual(await run(b, 'whatis').then(x => [x.out, x.status]), ['whatis what?\n', 1]);
  assert.equal((await run(b, 'whatis apropos whatis')).out,
    'apropos (1)          - search the manual page names and descriptions\nwhatis (1)           - display one-line manual page descriptions\n');
});

test('apropos and whatis reject options the game does not simulate', async () => {
  const r = await run(await shell(), 'apropos -x dir');
  assert.deepEqual([r.err, r.status], ["apropos: invalid option -- 'x'\nTry 'apropos --help' or 'apropos --usage' for more information.\n", 1]);
});

test('man -f gives the one-line description of a page', async () => {
  const b = await shell();
  assert.equal((await run(b, 'man -f ls')).out, 'ls (1)               - list directory contents\n');
  assert.deepEqual(await run(b, 'man -f cd').then(x => [x.err, x.status]), ['cd: nothing appropriate.\n', 16]);
});

test('man takes a section number before the page', async () => {
  const b = await shell();
  assert.match((await run(b, 'man 1 ls')).out, /^LS\(1\)/);
  assert.deepEqual(await run(b, 'man 9 ls').then(x => [x.err, x.status]), ['No manual entry for ls in section 9\n', 16]);
  assert.deepEqual(await run(b, 'man 1').then(x => [x.err, x.status]), ["No manual entry for 1\n(Alternatively, what manual page do you want from section 1?)\nFor example, try 'man man'.\n", 1]);
});

test('the man pages give the real synopses', async () => {
  const b = await shell();
  assert.match((await run(b, 'man whoami')).out, /^ {7}whoami \[OPTION\]\.\.\.$/m);
  assert.match((await run(b, 'man whoami')).out, /Same as id -un\./);
  assert.match((await run(b, 'man pwd')).out, /^ {7}pwd \[OPTION\]\.\.\.$/m);
  assert.match((await run(b, 'man clear')).out, /^ {7}clear \[-x\] \[-T terminal-type\]$/m);
  assert.match((await run(b, 'man man')).out, /^ {7}man \[man options\] \[\[section\] page \.\.\.\] \.\.\.$/m);
  assert.match((await run(b, 'man ls')).note, /^A real man page is longer and opens in a pager/);
});

test('type knows the bash builtins the game does not simulate', async () => {
  assert.equal((await run(await shell(), 'type printf read')).out, 'printf is a shell builtin\nread is a shell builtin\n');
});

test('man -h and -help show its usage, and other unknown letters are invalid options', async () => {
  const b = await shell();
  for (const line of ['man -help', 'man -h', 'man -?']) {
    const r = await run(b, line);
    assert.match(r.out, /^Usage: man /, line);
    assert.equal(r.status, 0);
    assert.equal(r.note, 'Real man --help prints a longer list of options.');
  }
  const bad = await run(b, 'man -version');
  assert.deepEqual([bad.err, bad.status], ["man: invalid option -- 'v'\nTry 'man --help' or 'man --usage' for more information.\n", 1]);
  assert.equal((await run(b, 'man -V')).out, 'man 2.12.0\n');
});

test('which reads only -a and -s, and rejects anything else as debianutils does', async () => {
  const b = await shell();
  for (const [line, letter] of [['which --help', '-'], ['which --version', '-'], ['which -x ls', 'x']]) {
    const r = await run(b, line);
    assert.deepEqual([r.out, r.err, r.status, r.note], ['Usage: /usr/bin/which [-as] args\n', `Illegal option -${letter}\n`, 2, ''], line);
  }
  assert.deepEqual(await run(b, 'which -s ls').then(r => [r.out, r.status]), ['', 0]);
  assert.deepEqual(await run(b, 'which -s nope').then(r => [r.out, r.status]), ['', 1]);
  assert.equal((await run(b, 'which -a ls')).out, '/usr/bin/ls\n');
  assert.deepEqual(await run(b, 'which -- ls').then(r => [r.out, r.status]), ['/usr/bin/ls\n', 0]);
  assert.deepEqual(await run(b, 'which ls -a').then(r => [r.out, r.status]), ['/usr/bin/ls\n', 1]);
  assert.deepEqual(await run(b, 'which').then(r => [r.out, r.err, r.status]), ['', '', 1]);
});

test('bash -c runs a command line in a child shell, with a name and arguments after it', async () => {
  const b = await shell();
  assert.equal((await run(b, "bash -c 'echo $0 $# $1'")).out, 'bash 0\n');
  assert.equal((await run(b, "bash -c 'echo $0 $# $1' spell fire")).out, 'spell 1 fire\n');
  assert.equal((await run(b, "V=1 bash -c 'cd /tmp; echo [$V]'; pwd")).out, '[1]\n/home/hero\n');
  const missing = await run(b, "bash -c 'nosuch'");
  assert.deepEqual([missing.err, missing.status], ['bash: line 1: nosuch: command not found\n', 127]);
  assert.equal((await run(b, "bash -c nosuch spell")).err, 'spell: line 1: nosuch: command not found\n');
  const bare = await run(b, 'bash -c');
  assert.deepEqual([bare.err, bare.status], ['bash: -c: option requires an argument\n', 2]);
});

test('source and . run a file in the current shell, with arguments as positional parameters', async () => {
  const lines = "cd /tmp\nspell=fire\nalias zap='echo zap'\necho [$1] [$#]\n";
  const b = await shell([put('/home/hero/s.sh', file(lines, { owner: 'hero' }))]);
  assert.equal((await run(b, 'source s.sh A B')).out, '[A] [2]\n');
  const after = await runAll(b, ['echo $#', 'echo $spell; pwd; zap']);
  assert.equal(after.out, 'fire\n/tmp\nzap\n');
  assert.equal((await run(b, '. /home/hero/s.sh')).out, '[] [0]\n');
});

test('source finds a readable file in PATH before the working directory', async () => {
  const b = await shell([put('/usr/local', dir({ bin: dir({ s: file('echo path\n', { mode: 0o644 }) }) })), put('/home/hero/s', file('echo here\n', { owner: 'hero' }))]);
  assert.equal((await run(b, 'source s')).out, 'path\n');
  assert.equal((await run(b, 'source ./s')).out, 'here\n');
});

test('source fails like bash for a missing file, a directory, an unreadable file and no file', async () => {
  const b = await shell();
  const status = async line => run(b, line).then(r => [r.err, r.status]);
  assert.deepEqual(await status('source nofile'), ['bash: nofile: No such file or directory\n', 1]);
  assert.deepEqual(await status('source /tmp'), ['bash: source: /tmp: is a directory\n', 1]);
  assert.deepEqual(await status('. /etc/shadow'), ['bash: /etc/shadow: Permission denied\n', 1]);
  assert.deepEqual(await status('source'), ['bash: source: filename argument required\nsource: usage: source filename [arguments]\n', 2]);
  assert.deepEqual(await status('.'), ['bash: .: filename argument required\n.: usage: . filename [arguments]\n', 2]);
});

test('source returns the status of the last command it ran', async () => {
  const b = await shell([put('/home/hero/f.sh', file('true\nfalse\n', { owner: 'hero' }))]);
  assert.equal((await run(b, 'source f.sh')).status, 1);
});
