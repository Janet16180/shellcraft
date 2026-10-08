import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimBackend } from '../../src/shell/backend.js';
import { put, remove, proc, stop, cd, dir, file } from '../../src/backend/spec.js';
import { shell, run, NOW } from './helpers.js';

test('every port method returns a promise', async () => {
  const b = createSimBackend({ now: () => NOW });
  const calls = [b.load([]), b.run('pwd'), b.observe(), b.complete('pw'), b.resize(100)];
  for (const c of calls) assert.ok(c instanceof Promise);
  await Promise.all(calls);
});

test('a run result has output chunks, a status, command records and blocked reasons', async () => {
  const b = await shell();
  const r = await b.run('cat readme.txt | head -n 1 > /tmp/first; ls nope');
  assert.deepEqual(Object.keys(r).sort(), ['blocked', 'commands', 'output', 'status']);
  assert.equal(r.status, 2);
  assert.deepEqual(r.blocked, []);
  assert.deepEqual(r.output, [{ stream: 'err', text: "ls: cannot access 'nope': No such file or directory\n" }]);
  assert.deepEqual(r.commands.map(c => [c.name, c.pipeline, c.stage, c.stages]), [['cat', 0, 0, 2], ['head', 0, 1, 2], ['ls', 1, 0, 1]]);
  assert.deepEqual(r.commands[0], {
    name: 'cat', args: ['readme.txt'], cwd: '/home/hero', status: 0, stdout: 'Dear apprentice,\nwelcome.\n',
    pipeline: 0, stage: 0, stages: 2, redirects: [],
  });
  assert.deepEqual(r.commands[1].redirects, [{ op: '>', target: '/tmp/first' }]);
  assert.equal(r.commands[1].stdout, 'Dear apprentice,\n');
});

test('< input redirection is recorded on the command that reads it, in a pipeline too', async () => {
  const b = await shell();
  const r = await b.run('sort < readme.txt | uniq; grep e < readme.txt | wc -l');
  assert.deepEqual(r.commands.map(c => [c.name, c.redirects]), [
    ['sort', [{ op: '<', target: '/home/hero/readme.txt' }]], ['uniq', []],
    ['grep', [{ op: '<', target: '/home/hero/readme.txt' }]], ['wc', []],
  ]);
});

test('an observation shows the user, host, home, working directory, tree and processes', async () => {
  const b = await shell([proc({ key: 'daemon', user: 'hero', cmd: './shadow_daemon', cpu: 99.7 })]);
  const obs = await b.observe();
  assert.equal(obs.user, 'hero');
  assert.equal(obs.host, 'kernelia');
  assert.equal(obs.home, '/home/hero');
  assert.equal(obs.cwd, '/home/hero');
  assert.deepEqual(obs.tree.children.home.children.hero.children['readme.txt'], {
    type: 'file', mode: 0o644, owner: 'hero', group: 'hero', size: 26, mtime: NOW, content: 'Dear apprentice,\nwelcome.\n',
  });
  assert.equal(obs.tree.children.tmp.mode, 0o1777);
  const daemon = obs.procs.find(p => p.key === 'daemon');
  assert.equal(daemon.cmd, './shadow_daemon');
  assert.equal(daemon.cpu, 99.7);
  assert.equal(typeof daemon.pid, 'number');
});

test('an observation is a snapshot that later commands do not change', async () => {
  const b = await shell();
  const before = await b.observe();
  await b.run('rm readme.txt');
  assert.ok(before.tree.children.home.children.hero.children['readme.txt']);
});

test('the backend owns /usr/bin with one executable per external command, and /dev/null', async () => {
  const obs = await (await shell()).observe();
  const bin = obs.tree.children.usr.children.bin.children;
  assert.ok(bin.ls && bin.cat && bin.grep);
  assert.equal(bin.ls.mode, 0o755);
  assert.equal(bin.cd, undefined);
  assert.equal(obs.tree.children.dev.children.null.mode, 0o666);
});

test('the system processes are init, kthreadd, cron, sshd and the player shell', async () => {
  const obs = await (await shell()).observe();
  assert.deepEqual(obs.procs.map(p => p.cmd), ['/sbin/init', '[kthreadd]', '/usr/sbin/cron -f', '/usr/sbin/sshd -D', '-bash']);
  assert.deepEqual(obs.procs.slice(0, 2).map(p => p.pid), [1, 2]);
});

test('PIDs depend on the random source', async () => {
  const shellPid = async random => (await (await shell([], { random })).observe()).procs.find(p => p.cmd === '-bash').pid;
  assert.notEqual(await shellPid(() => 0.1), await shellPid(() => 0.9));
});

test('load applies put, remove, proc, stop and cd in order', async () => {
  const b = await shell();
  await b.load([
    put('/home/hero/camp', dir({ 'tent.txt': file('tent\n') }, { owner: 'hero' })),
    remove('/home/hero/forest'),
    proc({ key: 'a', user: 'hero', cmd: 'sleep 9999', tty: 'pts/0' }),
    proc({ key: 'b', user: 'hero', cmd: 'sleep 1' }),
    stop('b'),
    cd('/home/hero/camp'),
  ]);
  const obs = await b.observe();
  const home = obs.tree.children.home.children.hero.children;
  assert.ok(home.camp);
  assert.equal(home.forest, undefined);
  assert.deepEqual(obs.procs.filter(p => p.key).map(p => p.key), ['shell', 'a']);
  assert.equal(obs.cwd, '/home/hero/camp');
});

test('a patch whose parent is missing raises', async () => {
  const b = await shell();
  await assert.rejects(b.load([put('/nowhere/x', file(''))]), /not a directory/);
});

test('a patch that touches /usr/bin or /dev raises', async () => {
  const b = await shell();
  await assert.rejects(b.load([put('/usr', dir())]), /belong to the backend/);
  await assert.rejects(b.load([remove('/dev/null')]), /belong to the backend/);
});

test('a proc patch for a running key keeps the process it already has', async () => {
  const b = await shell([proc({ key: 'd', user: 'hero', cmd: 'sleep 9' })]);
  const pid = (await b.observe()).procs.find(p => p.key === 'd').pid;
  await b.load([proc({ key: 'd', user: 'hero', cmd: 'sleep 9' })]);
  assert.deepEqual((await b.observe()).procs.filter(p => p.key === 'd').map(p => p.pid), [pid]);
});

test('removing the working directory in a patch moves the shell to its nearest ancestor', async () => {
  const b = await shell([cd('/home/hero/forest/cave')]);
  await b.load([remove('/home/hero/forest')]);
  assert.equal((await b.observe()).cwd, '/home/hero');
});

test('rm -r of the home or one of its ancestors is blocked and leaves the world unchanged', async () => {
  const b = await shell();
  for (const line of ['rm -r ~', 'rm -rf /home', 'rm -r ../hero']) {
    const r = await b.run(line);
    assert.equal(r.blocked.length, 1, line);
    assert.match(r.blocked[0], /home directory/);
  }
  assert.ok((await b.observe()).tree.children.home.children.hero.children['readme.txt']);
});

test('rm -rf / is a real refusal, not a block', async () => {
  const r = await run(await shell(), 'rm -rf /');
  assert.deepEqual(r.result.blocked, []);
  assert.match(r.err, /dangerous to operate recursively on '\/'/);
});

test('SIGKILL and SIGHUP to the player shell are blocked; SIGTERM is ignored by it', async () => {
  const b = await shell();
  assert.equal((await b.run('kill -9 $$')).blocked.length, 1);
  assert.equal((await b.run('kill -HUP $$')).blocked.length, 1);
  const term = await run(b, 'kill $$');
  assert.deepEqual(term.result.blocked, []);
  assert.match(term.note, /ignores SIGTERM/);
  assert.ok((await b.observe()).procs.some(p => p.cmd === '-bash'));
});

test('a process that ignores TERM survives kill, which still exits 0, and dies to kill -9', async () => {
  const b = await shell([proc({ key: 'daemon', user: 'hero', cmd: './shadow_daemon', ignores: ['TERM'] })]);
  const pid = (await b.observe()).procs.find(p => p.key === 'daemon').pid;
  assert.equal((await run(b, `kill ${pid}`)).status, 0);
  assert.ok((await b.observe()).procs.some(p => p.key === 'daemon'));
  await b.run(`kill -9 ${pid}`);
  assert.equal((await b.observe()).procs.some(p => p.key === 'daemon'), false);
});

test('an empty line runs nothing and keeps the previous status', async () => {
  const b = await shell();
  await b.run('false');
  const r = await b.run('   ');
  assert.deepEqual(r, { output: [], status: 1, commands: [], blocked: [] });
});

test('complete returns the completed line and the candidates when ambiguous', async () => {
  const b = await shell();
  assert.deepEqual(await b.complete('cat rea'), { line: 'cat readme.txt ', candidates: [] });
  assert.deepEqual(await b.complete('cd fo'), { line: 'cd forest/', candidates: [] });
});

test('an observation lists the groups the player belongs to', async () => {
  const b = createSimBackend({ now: () => NOW });
  const obs = await b.observe();
  assert.deepEqual(obs.groups, ['hero']);
});

test("the player's own interactive shell carries the key 'shell'", async () => {
  const b = createSimBackend({ now: () => NOW });
  const obs = await b.observe();
  const shells = obs.procs.filter(p => p.key === 'shell');
  assert.equal(shells.length, 1);
  assert.equal(shells[0].cmd, '-bash');
  assert.equal(shells[0].user, 'hero');
});

test('resize sets the terminal width that bash reports in COLUMNS', async () => {
  const b = await shell();
  await b.resize(120);
  assert.equal((await run(b, 'echo $COLUMNS')).out, '120\n');
});

test('resize raises for anything but a positive integer', async () => {
  const b = await shell();
  for (const bad of [0, -3, 2.5, '80', NaN]) await assert.rejects(b.resize(bad), /positive integer/, String(bad));
});

const PROTOTYPE_NAMES = Object.getOwnPropertyNames(Object.prototype);

test('a missing file named like an object member is missing, not forbidden', async () => {
  const b = await shell();
  for (const name of ['constructor', 'toString']) {
    const r = await run(b, `cat ${name}`);
    assert.deepEqual([r.err, r.status], [`cat: ${name}: No such file or directory\n`, 1]);
  }
});

test('ls takes an operand named constructor as a file, not an option', async () => {
  const r = await run(await shell(), 'ls constructor');
  assert.deepEqual([r.err, r.status], ["ls: cannot access 'constructor': No such file or directory\n", 2]);
});

test('touch __proto__ creates an ordinary entry that ls and observe show', async () => {
  const b = await shell();
  assert.equal((await run(b, 'touch __proto__')).status, 0);
  assert.equal((await run(b, 'ls -1 __proto__')).out, '__proto__\n');
  const home = (await b.observe()).tree.children.home.children.hero.children;
  assert.ok(Object.hasOwn(home, '__proto__'));
  assert.equal(home.__proto__.type, 'file');
  assert.equal(Object.getPrototypeOf(home), Object.prototype);
});

test('a redirection can create a file named hasOwnProperty', async () => {
  const b = await shell();
  assert.equal((await run(b, 'echo hi > hasOwnProperty')).status, 0);
  assert.equal((await run(b, 'cat hasOwnProperty')).out, 'hi\n');
});

test('mkdir valueOf creates the directory', async () => {
  const b = await shell();
  assert.deepEqual(await run(b, 'mkdir valueOf').then(r => [r.err, r.status]), ['', 0]);
  assert.equal((await run(b, 'cd valueOf; pwd')).out, '/home/hero/valueOf\n');
});

test('rm of a missing constructor file fails like any missing file', async () => {
  const r = await run(await shell(), 'rm constructor');
  assert.deepEqual([r.err, r.status], ["rm: cannot remove 'constructor': No such file or directory\n", 1]);
});

test('typing an object member name as a command is an unknown command', async () => {
  const r = await run(await shell(), 'constructor');
  assert.deepEqual([r.err, r.status], ['bash: constructor: command not found\n', 127]);
});

test('a world can put a file named like an object member', async () => {
  const b = await shell([put('/home/hero/constructor', file('built\n', { owner: 'hero' }))]);
  assert.equal((await run(b, 'cat constructor')).out, 'built\n');
});

const NAME_LINES = [
  'cat NAME', 'ls NAME', 'rm NAME', 'head NAME', 'wc NAME', 'chmod 644 NAME', 'tree NAME', 'cd NAME', 'ls *NAME*',
  'touch NAME', 'ls -l NAME', 'echo hi > NAME', 'cat NAME', 'cp NAME NAME.bak', 'mv NAME.bak NAME.old', 'grep hi NAME NAME.old',
  'find . -name NAME', 'rm NAME NAME.old', 'mkdir NAME', 'cd NAME', 'pwd', 'cd ..', 'rmdir NAME',
  'NAME', 'NAME --version', 'NAME --help', 'help NAME', 'type NAME', 'which NAME', 'man NAME', 'man -f NAME',
  'echo ~NAME', 'echo $NAME', 'NAME=v; echo $NAME', 'echo $((NAME + 1))', 'export NAME=w; printenv NAME', 'unset NAME; echo "[$NAME]"',
  'alias NAME', "alias NAME='echo aliased'", 'NAME', 'type NAME', 'unalias NAME', 'NAME',
  'ls --NAME', 'grep --NAME x readme.txt', 'kill -s NAME 1', 'kill -NAME 1', 'find . -NAME', 'echo hi | grep "[[:NAME:]]"', 'ls [[:NAME:]]*', 'find . -name "[[:NAME:]]*"', 'pkill NAME',
];

test('every name an object inherits behaves like an ordinary name', async () => {
  const ordinary = 'zzq';
  const lines = name => NAME_LINES.map(line => line.replaceAll('NAME', name));
  const want = await runAllLines(await shell(), lines(ordinary));
  for (const name of PROTOTYPE_NAMES) {
    const got = await runAllLines(await shell(), lines(name));
    got.forEach((r, i) => {
      const swap = text => text.replaceAll(ordinary, name);
      assert.deepEqual([r.out, r.err, r.status], [swap(want[i].out), swap(want[i].err), want[i].status], `${name}: ${lines(name)[i]}`);
    });
  }
});

async function runAllLines(b, lines) {
  const results = [];
  for (const line of lines) results.push(await run(b, line));
  return results;
}

const HOSTILE = [
  `echo $(( ${'('.repeat(20000)}1${')'.repeat(20000)} ))`,
  `echo $(( ${'-'.repeat(20000)}1 ))`,
  `echo $(( ${'!'.repeat(20000)}1 ))`,
  'a=a; echo $((a))',
  `echo ${'$(echo '.repeat(20000)}hi${')'.repeat(20000)}`,
  `echo ${'"$(echo '.repeat(5000)}hi${')"'.repeat(5000)}`,
  `cat ${'a/'.repeat(3000)}x`,
  `touch ${'b'.repeat(300)}`,
  `mkdir -p ${'d/'.repeat(2100)}`,
  Array(5000).fill('echo x').join(' | '),
  Array(5000).fill('true').join(' && '),
  "echo 'bash x.sh' > x.sh; bash x.sh",
  "echo './y.sh' > y.sh; chmod +x y.sh; ./y.sh",
  "alias a='b'; alias b='a'; a",
  `x=${'$x'.repeat(5000)}; echo \${#x}`,
  `find / -maxdepth 0 ${'! '.repeat(20000)}-false`,
  `find / -maxdepth 0 ${'\\( '.repeat(20000)}-true ${'\\) '.repeat(20000)}`,
  `find / -maxdepth 0 ${'-true -o '.repeat(20000)}-true`,
  `touch ${'a'.repeat(200)}; ls ${'*'.repeat(40)}zz; ls ${'*a'.repeat(30)}b; find . -name '${'*a'.repeat(30)}b'`,
];

test('run() resolves on hostile input instead of throwing', async () => {
  for (const line of HOSTILE) {
    const r = await (await shell()).run(line);
    assert.equal(typeof r.status, 'number', line.slice(0, 60));
  }
});

test('hostile nesting gets the messages bash would print', async () => {
  const b = await shell();
  assert.equal((await run(b, 'a=a; echo $((a))')).err, 'bash: a: expression recursion level exceeded (error token is "a")\n');
  assert.match((await run(b, `echo $(( ${'('.repeat(2000)}1${')'.repeat(2000)} ))`)).err, /^bash: \(+1\)+: expression recursion level exceeded \(error token is "\(+1\)+"\)\n$/);
  assert.match((await run(b, `cat ${'a/'.repeat(3000)}x`)).err, /^cat: (a\/)+x: File name too long\n$/);
  assert.match((await run(b, `touch ${'b'.repeat(256)}`)).err, /^touch: cannot touch 'b+': File name too long\n$/);
  assert.match((await run(b, `cd ${'a/'.repeat(3000)}`)).err, /^bash: cd: (a\/)+: File name too long\n$/);
  assert.match((await run(b, `echo ${'$(echo '.repeat(100)}hi${')'.repeat(100)}`)).err, /^bash: command substitution: maximum nesting level exceeded\n$/);
  assert.equal((await run(b, "echo 'bash x.sh' > x.sh; bash x.sh")).err.split('\n')[0], 'x.sh: line 1: x.sh: maximum nesting level exceeded');
});

test('a tree as deep as path limits allow still observes, copies, searches and removes', async () => {
  const b = await shell();
  const step = 'd/'.repeat(300);
  const deep = await run(b, `mkdir -p ${step}`);
  assert.match(deep.err, /^mkdir: cannot create directory ‘(d\/)+’: File name too long\n$/);
  await b.observe();
  for (const line of ['cp -r d e', 'find . -name zz', 'grep -r zz .', 'tree -d d', 'rm -r d e']) {
    assert.equal(typeof (await b.run(line)).status, 'number', line);
  }
  await b.observe();
});

test('cp and mv refuse to grow the tree past its depth limit', async () => {
  const b = await shell();
  const path = Array(200).fill('d').join('/');
  await run(b, `mkdir -p ${path} ${Array(100).fill('e').join('/')}`);
  const copied = await run(b, `cp -r e ${path}/copy`);
  assert.equal(copied.err, `cp: cannot create directory '${path}/copy': File name too long\n`);
  const moved = await run(b, `mv e ${path}/x`);
  assert.equal(moved.err, `mv: cannot move 'e' to '${path}/x': File name too long\n`);
  assert.equal((await run(b, `cp -r e ${Array(100).fill('d').join('/')}/copy`)).status, 0);
});

test('the shell starts at the first load and reads ~/.bashrc then, quietly', async () => {
  const b = createSimBackend({ now: () => NOW });
  await b.load([put('/home/hero/.bashrc', file("alias ll='ls -alF'\nspell=fire\ncd /home\nnosuch\n", { owner: 'hero' }))]);
  const r = await run(b, 'type ll; echo $spell; pwd');
  assert.deepEqual([r.out, r.err], ["ll is aliased to `ls -alF'\nfire\n/home\n", '']);
  await b.load([put('/home/hero/.bashrc', file('spell=ice\n', { owner: 'hero' }))]);
  assert.equal((await run(b, 'echo $spell; history')).out, 'fire\n    1  type ll; echo $spell; pwd\n    2  echo $spell; history\n');
});

test('without a ~/.bashrc the shell has no aliases', async () => {
  const b = createSimBackend({ now: () => NOW });
  await b.load([]);
  assert.equal((await run(b, 'alias')).out, '');
});
