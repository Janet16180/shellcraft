import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, runAll } from './helpers.js';
import { put, dir, file } from '../../src/backend/spec.js';

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

test('an unknown command fails with 127 and leaves teaching notes to the game', async () => {
  const b = await shell();
  for (const line of ['cd..', 'LS', 'cls', 'florp']) {
    const r = await run(b, line);
    assert.deepEqual([r.err, r.status, r.note], [`bash: ${line}: command not found\n`, 127, '']);
  }
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

test('an arithmetic error stops the rest of the line with status 1', async () => {
  const b = await shell();
  const r = await run(b, 'echo $((1/0)); echo after');
  assert.deepEqual([r.out, r.err, r.status], ['', 'bash: 1/0: division by 0 (error token is "0")\n', 1]);
});

test('--version prints the program version, as the real program does', async () => {
  const b = await shell();
  const r = await run(b, 'ls --version');
  assert.deepEqual([r.out.split('\n')[0], r.status], ['ls (GNU coreutils) 9.4', 0]);
  assert.equal((await run(b, 'cat --version')).out.split('\n')[0], 'cat (GNU coreutils) 9.4');
  assert.equal((await run(b, 'echo --version')).out, '--version\n');
});

test('a real command the game does not simulate gets a note saying so', async () => {
  const b = await shell();
  const du = await run(b, 'du -sh');
  assert.deepEqual([du.err, du.status], ['bash: du: command not found\n', 127]);
  assert.equal(du.note, 'du is a real command on Ubuntu, but this game does not simulate it.');
  assert.equal((await run(b, 'florp')).note, '');
});

test('a bash builtin the game does not simulate is not reported as missing', async () => {
  const b = await shell();
  for (const [line, name] of [['printf hi', 'printf'], ['test -e x', 'test'], ['read x', 'read'], ['[ -e x ]', '[']]) {
    const r = await run(b, line);
    assert.deepEqual([r.out, r.err, r.status], ['', '', 1]);
    assert.equal(r.note, `${name} is built into bash, but this game does not simulate it.`);
  }
});

test('a short --help says that the real one lists more options', async () => {
  assert.equal((await run(await shell(), 'ls --help')).note, 'Real ls --help prints a longer list of options.');
});

test('a command substitution writes its errors to the terminal and sets $? for assignments', async () => {
  const b = await shell();
  const shown = await run(b, 'echo $(ls nope)');
  assert.deepEqual([shown.out, shown.err], ['\n', "ls: cannot access 'nope': No such file or directory\n"]);
  const assigned = await run(b, 'x=$(ls nope); echo $?');
  assert.deepEqual([assigned.out, assigned.err], ['2\n', "ls: cannot access 'nope': No such file or directory\n"]);
  assert.equal((await run(b, 'x=$(false); echo $?')).out, '1\n');
  assert.equal((await run(b, 'x=$(true); echo $?')).out, '0\n');
  assert.equal((await run(b, '$(false); echo $?')).out, '1\n');
  assert.equal((await run(b, 'echo $(false); echo $?')).out, '\n0\n');
});

const localBin = (mode, content = '#!/bin/bash\necho hi\n') => [
  put('/usr/local', dir({ bin: dir({ glimmer: file(content, { mode }) }) })),
];

test('a script in a PATH directory runs by its name, like ./script', async () => {
  const b = await shell(localBin(0o755));
  assert.equal((await run(b, 'which glimmer')).out, '/usr/local/bin/glimmer\n');
  const r = await run(b, 'glimmer');
  assert.deepEqual([r.out, r.err, r.status], ['hi\n', '', 0]);
  assert.equal(r.result.commands[0].name, 'glimmer');
  assert.equal((await run(b, 'type glimmer')).out, 'glimmer is hashed (/usr/local/bin/glimmer)\n');
});

test('a script in PATH without the execute bit is found but refused with 126', async () => {
  const r = await run(await shell(localBin(0o644)), 'glimmer');
  assert.deepEqual([r.out, r.err, r.status], ['', 'bash: /usr/local/bin/glimmer: Permission denied\n', 126]);
});

test('errors inside a script found in PATH name its full path', async () => {
  const r = await run(await shell(localBin(0o755, 'nosuch\n')), 'glimmer');
  assert.equal(r.err, '/usr/local/bin/glimmer: line 1: nosuch: command not found\n');
});

test('a script gets its arguments as $0, $1 to $9, $# and "$@"', async () => {
  const b = await shell([put('/home/hero/s.sh', file('echo arg=$1 n=$# 0=$0 ${2}\ntouch "$@"\n', { owner: 'hero', mode: 0o755 }))]);
  assert.equal((await run(b, './s.sh Tux')).out, 'arg=Tux n=1 0=./s.sh\n');
  assert.equal((await run(b, 'bash s.sh "a b" c')).out, 'arg=a b n=2 0=s.sh c\n');
  assert.equal((await run(b, 'ls -1')).out, 'Tux\n\'a b\'\nc\nforest\nreadme.txt\ns.sh\n');
  assert.equal((await run(b, 'sh s.sh y')).out, 'arg=y n=1 0=s.sh\n');
});

test('the interactive shell has no arguments, and a script does not change that', async () => {
  const b = await shell([put('/home/hero/s.sh', file('echo $1\n', { owner: 'hero', mode: 0o755 }))]);
  await run(b, './s.sh x');
  assert.equal((await run(b, 'echo $0 $# [$1] [$@]')).out, 'bash 0 [] []\n');
});

test('a script sees only exported variables, plus assignments typed before it', async () => {
  const b = await shell();
  await run(b, "echo 'echo [$spell] [$V]' > t.sh");
  assert.equal((await run(b, 'spell=x; bash t.sh')).out, '[] []\n');
  assert.equal((await run(b, 'export spell; bash t.sh')).out, '[x] []\n');
  assert.equal((await run(b, 'V=1 bash t.sh; echo "[$V]"')).out, '[x] [1]\n[]\n');
});

test('what a script changes stays in the script: variables, aliases and cd', async () => {
  const b = await shell([put('/home/hero/s.sh', file('cd /tmp\nz=1\nalias zz=ls\npwd\n', { owner: 'hero', mode: 0o755 }))]);
  assert.equal((await run(b, './s.sh')).out, '/tmp\n');
  const r = await run(b, 'pwd; echo "[$z]"; type zz');
  assert.deepEqual([r.out, r.err], ['/home/hero\n[]\n', 'bash: type: zz: not found\n']);
});

test('a script does not see the aliases of the shell that runs it', async () => {
  const b = await shell([put('/home/hero/s.sh', file('ll\n', { owner: 'hero', mode: 0o755 }))]);
  assert.equal((await run(b, "alias ll='ls -l'; ./s.sh")).err, './s.sh: line 1: ll: command not found\n');
});
