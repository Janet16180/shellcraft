import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimBackend } from '../../src/shell/backend.js';
import { put, remove, proc, stop, cd, dir, file } from '../../src/backend/spec.js';
import { shell, run, NOW } from './helpers.js';

test('every port method returns a promise', async () => {
  const b = createSimBackend({ now: () => NOW });
  const calls = [b.load([]), b.run('pwd'), b.observe(), b.complete('pw')];
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
