import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, NOW } from '../helpers.js';
import { formatDate } from '../../../src/shell/commands/info.js';

test('whoami, id, groups and hostname describe the user and machine', async () => {
  const b = await shell();
  assert.equal((await run(b, 'whoami')).out, 'hero\n');
  assert.equal((await run(b, 'id')).out, 'uid=1000(hero) gid=1000(hero) groups=1000(hero)\n');
  assert.equal((await run(b, 'groups')).out, 'hero\n');
  assert.equal((await run(b, 'hostname')).out, 'kernelia\n');
});

test('pwd prints the working directory', async () => {
  const b = await shell();
  await run(b, 'cd forest');
  assert.equal((await run(b, 'pwd')).out, '/home/hero/forest\n');
});

test('date prints the clock in UTC like the C locale', async () => {
  assert.equal(formatDate(Date.UTC(2026, 9, 6, 9, 5, 3)), 'Tue Oct  6 09:05:03 UTC 2026');
  assert.equal((await run(await shell(), 'date')).out, 'Tue Oct  6 10:00:00 UTC 2026\n');
});

test('echo joins its arguments; -n drops the newline and -e reads escapes', async () => {
  const b = await shell();
  assert.equal((await run(b, 'echo a   b')).out, 'a b\n');
  assert.equal((await run(b, 'echo -n a')).out, 'a');
  assert.equal((await run(b, 'echo -e "a\\tb\\nc"')).out, 'a\tb\nc\n');
});

test('true and false only set the status', async () => {
  const b = await shell();
  assert.equal((await run(b, 'true')).status, 0);
  assert.equal((await run(b, 'false')).status, 1);
});

test('uname names the kernel', async () => {
  const b = await shell();
  assert.equal((await run(b, 'uname')).out, 'Linux\n');
  assert.match((await run(b, 'uname -a')).out, /^Linux kernelia /);
});

test('uname prints the fields asked for, in the standard order', async () => {
  const b = await shell();
  assert.equal((await run(b, 'uname -n')).out, 'kernelia\n');
  assert.equal((await run(b, 'uname -sr')).out, 'Linux 6.8.0-kernelia\n');
  assert.equal((await run(b, 'uname -a')).out, 'Linux kernelia 6.8.0-kernelia #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n');
});

test('id -u, -g, -G and -n print single fields', async () => {
  const b = await shell();
  assert.equal((await run(b, 'id -u')).out, '1000\n');
  assert.equal((await run(b, 'id -un')).out, 'hero\n');
  assert.equal((await run(b, 'id -Gn')).out, 'hero\n');
});

test('whoami takes no operands', async () => {
  const r = await run(await shell(), 'whoami now');
  assert.deepEqual([r.err, r.status], ["whoami: extra operand ‘now’\nTry 'whoami --help' for more information.\n", 1]);
});

test('echo -e reads every bash escape and stops at \\c', async () => {
  const b = await shell();
  assert.equal((await run(b, "echo -e 'a\\x41\\0102\\\\b'")).out, 'aAB\\b\n');
  assert.equal((await run(b, "echo -e 'stop\\cnever'")).out, 'stop');
  assert.equal((await run(b, "echo -E 'a\\nb'")).out, 'a\\nb\n');
});

test('clear has no --help: it rejects the option like ncurses clear, with status 1', async () => {
  const r = await run(await shell(), 'clear --help');
  assert.deepEqual([r.out, r.status], ['', 1]);
  assert.equal(r.err, "clear: invalid option -- '-'\nUsage: clear [options]\n\nOptions:\n  -T TERM     use this instead of $TERM\n  -V          print curses-version\n  -x          do not try to clear scrollback\n");
});

test('clear -x keeps the scrollback', async () => {
  assert.equal((await run(await shell(), 'clear -x')).out, '\u001b[H\u001b[2J');
});

test('whoami rejects options like coreutils and treats any other word as an extra operand', async () => {
  const b = await shell();
  assert.deepEqual(await run(b, 'whoami -help').then(r => [r.err, r.status]), ["whoami: invalid option -- 'h'\nTry 'whoami --help' for more information.\n", 1]);
  assert.equal((await run(b, 'whoami --foo')).err, "whoami: unrecognized option '--foo'\nTry 'whoami --help' for more information.\n");
  assert.equal((await run(b, 'whoami -')).err, "whoami: extra operand ‘-’\nTry 'whoami --help' for more information.\n");
});

test('pwd accepts -L and -P, ignores operands, and rejects other options like bash', async () => {
  const b = await shell();
  assert.equal((await run(b, 'pwd -P')).out, '/home/hero\n');
  assert.equal((await run(b, 'pwd foo')).out, '/home/hero\n');
  assert.deepEqual(await run(b, 'pwd -help').then(r => [r.out, r.err, r.status]), ['', 'bash: pwd: -h: invalid option\npwd: usage: pwd [-LP]\n', 2]);
});

test('who lists the login on the terminal with the time the session started', async () => {
  let clock = NOW;
  const b = await shell([], { now: () => clock });
  clock += 3 * 3_600_000;
  assert.equal((await run(b, 'who')).out, 'hero     pts/0        2026-10-06 10:00\n');
  assert.equal((await run(b, 'who -s')).out, 'hero     pts/0        2026-10-06 10:00\n');
});

test('who am i and who -m list the login of the terminal on standard input', async () => {
  const b = await shell();
  assert.equal((await run(b, 'who am i')).out, 'hero     pts/0        2026-10-06 10:00\n');
  assert.equal((await run(b, 'who -m')).out, 'hero     pts/0        2026-10-06 10:00\n');
  assert.equal((await run(b, 'echo | who am i')).out, '');
  assert.equal((await run(b, 'who -m < readme.txt')).out, '');
});

test('who -H adds headings and who -q counts the users', async () => {
  const b = await shell();
  assert.equal((await run(b, 'who -H')).out, 'NAME     LINE         TIME             COMMENT\nhero     pts/0        2026-10-06 10:00\n');
  assert.equal((await run(b, 'who -q')).out, 'hero\n# users=1\n');
  assert.equal((await run(b, 'who -Hq')).out, 'hero\n# users=1\n');
});

test('who reading a file other than the login records finds no one', async () => {
  const b = await shell();
  assert.deepEqual([(await run(b, 'who readme.txt')).out, (await run(b, 'who readme.txt')).status], ['', 0]);
  assert.equal((await run(b, 'who -H nofile')).out, 'NAME     LINE         TIME             COMMENT\n');
  assert.equal((await run(b, 'who -q nofile')).out, '\n# users=0\n');
});

test('who rejects unknown options and a third operand', async () => {
  const b = await shell();
  const bad = await run(b, 'who -x');
  assert.deepEqual([bad.err, bad.status], ["who: invalid option -- 'x'\nTry 'who --help' for more information.\n", 1]);
  const extra = await run(b, 'who a b c');
  assert.deepEqual([extra.err, extra.status], ["who: extra operand ‘c’\nTry 'who --help' for more information.\n", 1]);
});

test('hostname prints its version and usage like net-tools hostname', async () => {
  const b = await shell();
  for (const line of ['hostname --version', 'hostname -V', 'hostname -sV']) assert.equal((await run(b, line)).out, 'hostname 3.23\n');
  const help = await run(b, 'hostname --help');
  assert.match(help.out, /^Usage: hostname \[-b\] \{hostname\|-F file\} {9}set host name \(from file\)\n/);
  assert.match(help.out, /\n {4}-s, --short {12}short host name\n/);
  assert.equal(help.out.split('\n').length, 34);
  assert.equal(help.status, 255);
  assert.deepEqual([(await run(b, 'hostname -hV')).out, (await run(b, 'hostname -h')).status], [help.out, 255]);
});

test('hostname rejects bad options and too many operands with its usage', async () => {
  const b = await shell();
  const usage = (await run(b, 'hostname --help')).out;
  const bad = await run(b, 'hostname -x');
  assert.deepEqual([bad.out, bad.err, bad.status], [usage, "hostname: invalid option -- 'x'\n", 255]);
  const long = await run(b, 'hostname --bogus');
  assert.deepEqual([long.out, long.err, long.status], [usage, "hostname: unrecognized option '--bogus'\n", 255]);
  const many = await run(b, 'hostname x y');
  assert.deepEqual([many.out, many.err, many.status], ['', usage, 255]);
});

test('hostname -s and -b print the name, and only root may change it', async () => {
  const b = await shell();
  for (const line of ['hostname -s', 'hostname --short', 'hostname -b']) assert.equal((await run(b, line)).out, 'kernelia\n');
  for (const line of ['hostname castle', 'hostname -F /etc/hostname']) {
    const r = await run(b, line);
    assert.deepEqual([r.err, r.status], ['hostname: you must be root to change the host name\n', 1]);
  }
});

test('hostname options that look up the network say they are not simulated', async () => {
  const b = await shell();
  for (const option of ['-f', '--fqdn', '-d', '-a', '-i', '-I', '-A', '-y']) {
    const r = await run(b, `hostname ${option}`);
    assert.deepEqual([r.out, r.err, r.status], ['', '', 1]);
    assert.equal(r.note, `hostname ${option} looks up the network, which this game does not simulate.`);
  }
});
