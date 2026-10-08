import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, NOW } from '../helpers.js';
import { put, dir, file, login, password } from '../../../src/backend/spec.js';

const outcome = r => [r.out, r.err, r.status];
const mine = { owner: 'hero' };
const PASSWD = 'root:x:0:0:root:/root:/bin/bash\nhero:x:1000:1000:Hero,,,:/home/hero:/bin/bash\nmira:x:1001:1001::/home/mira:/bin/bash\n';
const groupFile = sudoers => `root:x:0:\nsudo:x:27:${sudoers}\nhero:x:1000:\nmira:x:1001:\nsmiths:x:1100:mira\n`;
const NOPASSWD = put('/etc/sudoers.d', dir({ hero: file('hero ALL=(ALL:ALL) NOPASSWD: ALL\n', { mode: 0o440 }) }));

// hero, mira, the sudo group (hero in it when admin), and a few files.
function realm({ admin = true, extra = [] } = {}) {
  return shell([
    put('/etc/passwd', file(PASSWD)),
    put('/etc/group', file(groupFile(admin ? 'hero' : ''))),
    login(),
    put('/home/mira', dir({}, { owner: 'mira', mode: 0o750 })),
    put('/home/hero/blade.txt', file('steel\n', mine)),
    put('/var', dir({ log: dir({ 'auth.log': file('', { owner: 'syslog', group: 'adm', mode: 0o640 }) }) })),
    ...extra,
  ]);
}

test('sudo runs one command as root when policy allows it and no password is needed', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  assert.deepEqual(outcome(await run(b, 'sudo whoami')), ['root\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'sudo cat /root/secret.txt')), ['x\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'sudo id')), ['uid=0(root) gid=0(root) groups=0(root)\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'whoami; cat /root/secret.txt')), ['hero\n', 'cat: /root/secret.txt: Permission denied\n', 1]);
});

test('files a sudo command creates belong to root; sudo -u gives them to that user', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  await run(b, 'cd /tmp; sudo touch r; sudo -u mira touch m; sudo mkdir rd');
  assert.match((await run(b, 'ls -l r m')).out, /^-rw-rw-r-- 1 mira mira 0 .* m\n-rw-r--r-- 1 root root 0 .* r\n$/);
  assert.match((await run(b, 'ls -ld rd')).out, /^drwxr-xr-x 2 root root /);
  assert.deepEqual(outcome(await run(b, 'sudo -u mira whoami; sudo --user=mira whoami; sudo -uroot whoami')), ['mira\nmira\nroot\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'sudo -u mira cat /root/secret.txt')), ['', 'cat: /root/secret.txt: Permission denied\n', 1]);
});

test('the shell does a redirection before sudo starts, as the player, so sudo echo > root-file is refused', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  assert.deepEqual(outcome(await run(b, 'sudo echo x > /etc/motd')), ['', 'bash: /etc/motd: Permission denied\n', 1]);
  assert.deepEqual(outcome(await run(b, 'echo x | sudo tee /etc/motd')), ['x\n', '', 0]);
  assert.match((await run(b, 'ls -l /etc/motd; cat /etc/motd')).out, /^-rw-r--r-- 1 root root 2 .* \/etc\/motd\nx\n$/);
  assert.deepEqual(outcome(await run(b, 'sudo cat /root/secret.txt | wc -l')), ['1\n', '', 0]);
});

test('sudo cd is not a program: sudo explains that cd is built into the shell', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  assert.deepEqual(outcome(await run(b, 'sudo cd /root')), ['', [
    'sudo: cd: command not found',
    'sudo: "cd" is a shell built-in command, it cannot be run directly.',
    'sudo: the -s option may be used to run a privileged shell.',
    'sudo: the -D option may be used to run a command in a specific directory.',
  ].join('\n') + '\n', 1]);
  assert.deepEqual(outcome(await run(b, 'sudo nosuch; sudo alias')), ['', 'sudo: nosuch: command not found\nsudo: alias: command not found\n', 1]);
});

test('sudo finds programs on its secure path and runs a script given by path', async () => {
  const b = await realm({ extra: [NOPASSWD, put('/home/hero/fix.sh', file('#!/bin/bash\nwhoami\ntouch /etc/fixed\n', { owner: 'hero', mode: 0o755 }))] });
  assert.deepEqual(outcome(await run(b, 'sudo ./fix.sh')), ['root\n', '', 0]);
  assert.match((await run(b, 'ls -l /etc/fixed')).out, / root root /);
  assert.deepEqual(outcome(await run(b, 'sudo /usr/bin/whoami; sudo -- whoami')), ['root\nroot\n', '', 0]);
});

test('sudo names an unknown user and bad options like sudo 1.9.15', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  assert.deepEqual(outcome(await run(b, 'sudo -u nosuch whoami')), ['', 'sudo: unknown user nosuch\nsudo: error initializing audit plugin sudoers_audit\n', 1]);
  const usage = (await run(b, 'sudo')).err;
  assert.match(usage, /^usage: sudo -h \| -K \| -k \| -V\nusage: sudo -v \[-ABkNnS\]/);
  assert.equal(usage.split('\n').length, 11);
  assert.deepEqual(outcome(await run(b, 'sudo -x')), ['', `sudo: invalid option -- 'x'\n${usage}`, 1]);
  assert.deepEqual(outcome(await run(b, 'sudo -u')), ['', `sudo: option requires an argument -- 'u'\n${usage}`, 1]);
  assert.deepEqual(outcome(await run(b, 'sudo --bogus')), ['', `sudo: unrecognized option '--bogus'\n${usage}`, 1]);
  assert.match((await run(b, 'sudo -h')).out, /^sudo - execute a command as another user\n\nusage:/);
  assert.equal((await run(b, 'sudo -V')).out.split('\n')[0], 'Sudo version 1.9.15p5');
  assert.match((await run(b, 'sudo -E whoami')).note, /sudo -E is a real option, but this game does not simulate it/);
});

test('sudo -l lists the matching defaults and rules, wrapped to the terminal like sudo', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  assert.deepEqual(outcome(await run(b, 'sudo -l')), [[
    'Matching Defaults entries for hero on kernelia:',
    '    env_reset, mail_badpass,',
    '    secure_path=/usr/local/sbin\\:/usr/local/bin\\:/usr/sbin\\:/usr/bin\\:/sbin\\:/bin\\:/snap/bin,',
    '    use_pty',
    '',
    'User hero may run the following commands on kernelia:',
    '    (ALL : ALL) ALL',
    '    (ALL : ALL) NOPASSWD: ALL',
    '',
  ].join('\n'), '', 0]);
  assert.match((await run(b, 'sudo -l | cat')).out, /^ {4}env_reset, mail_badpass, secure_path=\S+, use_pty\n/m);
  assert.deepEqual(outcome(await run(b, 'sudo -l whoami; sudo -l nosuch')), ['/usr/bin/whoami\n', 'sudo: nosuch: command not found\n', 1]);
});

test('a sudoers rule can allow only some commands, as one user', async () => {
  const rules = put('/etc/sudoers.d', dir({ smiths: file('%smiths ALL=(root) NOPASSWD: /usr/bin/chown, /usr/bin/whoami\n', { mode: 0o440 }) }));
  const b = await realm({ admin: false, extra: [rules, put('/etc/group', file(groupFile('').replace('smiths:x:1100:mira', 'smiths:x:1100:mira,hero'))), login()] });
  assert.match((await run(b, 'sudo -l')).out, /\n {4}\(root\) NOPASSWD: \/usr\/bin\/chown, \/usr\/bin\/whoami\n$/);
  assert.deepEqual(outcome(await run(b, 'sudo whoami')), ['root\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'sudo ls /root')), ['', "Sorry, user hero is not allowed to execute '/usr/bin/ls /root' as root on kernelia.\n", 1]);
  assert.deepEqual(outcome(await run(b, 'sudo -u mira whoami')), ['', "Sorry, user hero is not allowed to execute '/usr/bin/whoami' as mira on kernelia.\n", 1]);
});

test('without a password set, sudo skips the prompt with a note; a stranger to sudoers is refused', async () => {
  const admin = await realm();
  const ran = await run(admin, 'sudo whoami');
  assert.deepEqual(outcome(ran), ['root\n', '', 0]);
  assert.match(ran.note, /password/);
  const stranger = await realm({ admin: false });
  const refused = await run(stranger, 'sudo ls');
  assert.deepEqual(outcome(refused), ['', 'hero is not in the sudoers file.\n', 1]);
  assert.match(refused.note, /password/);
  assert.deepEqual(outcome(await run(stranger, 'sudo -l')), ['', 'Sorry, user hero may not run sudo on kernelia.\n', 1]);
});

test('sudo -i and sudo -s would open a root shell: the game refuses with a note', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  for (const line of ['sudo -i', 'sudo -s', 'sudo -i whoami']) {
    const r = await run(b, line);
    assert.deepEqual(outcome(r), ['', '', 1], line);
    assert.match(r.note, /root shell/, line);
  }
});

test('a sudo line records sudo as the player, then the command it ran as root', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  const r = (await run(b, 'echo x | sudo tee /etc/motd > /dev/null')).result;
  assert.deepEqual(r.commands.map(c => [c.name, c.args, c.user, c.status, c.stage]), [
    ['echo', ['x'], 'hero', 0, 0],
    ['sudo', ['tee', '/etc/motd'], 'hero', 0, 1],
    ['tee', ['/etc/motd'], 'root', 0, 1],
  ]);
  assert.equal(r.commands[1].asUser, 'root');
  assert.equal(r.commands[2].via, 'sudo');
  assert.deepEqual(r.commands[2].redirects, [{ op: '>', target: '/dev/null' }]);
  const refused = (await run(b, 'sudo -u mira cat /root/secret.txt')).result.commands;
  assert.deepEqual(refused.map(c => [c.name, c.user, c.status, c.asUser]), [['sudo', 'hero', 1, 'mira'], ['cat', 'mira', 1, undefined]]);
  assert.deepEqual((await run(b, 'sudo nosuch')).result.commands.map(c => c.name), ['sudo']);
});

test('sudo writes what it ran to /var/log/auth.log like Ubuntu', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  await run(b, 'sudo chown mira blade.txt');
  const log = (await run(b, 'sudo cat /var/log/auth.log')).out.split('\n');
  const stamp = new Date(NOW).toISOString().replace('Z', '000+00:00');
  assert.deepEqual(log.slice(0, 3), [
    `${stamp} kernelia sudo:     hero : TTY=pts/0 ; PWD=/home/hero ; USER=root ; COMMAND=/usr/bin/chown mira blade.txt`,
    `${stamp} kernelia sudo: pam_unix(sudo:session): session opened for user root(uid=0) by hero(uid=1000)`,
    `${stamp} kernelia sudo: pam_unix(sudo:session): session closed for user root`,
  ]);
});

const PROMPT = '[sudo] password for hero: ';
const promptLine = { stream: 'out', text: `${PROMPT}\n` };
const asks = { prompt: PROMPT, hidden: true };

test('a line that needs the password waits for hidden input, then the answer finishes it', async () => {
  const b = await realm({ extra: [password('dragon')] });
  const first = await b.run('echo before; sudo whoami; echo after');
  assert.deepEqual(first, { output: [{ stream: 'out', text: 'before\n' }], status: 0, commands: [], blocked: [], input: asks });
  const done = await b.answer('dragon');
  assert.deepEqual(done.output, [promptLine, { stream: 'out', text: 'root\n' }, { stream: 'out', text: 'after\n' }]);
  assert.equal(done.status, 0);
  assert.equal(done.input, undefined);
  assert.deepEqual(done.commands.map(c => [c.name, c.user]), [['echo', 'hero'], ['sudo', 'hero'], ['whoami', 'root'], ['echo', 'hero']]);
});

test('a wrong password gets Sorry, try again, and the third ends sudo with status 1', async () => {
  const b = await realm({ extra: [password('dragon')] });
  await b.run('sudo cat /root/secret.txt; echo s=$?');
  const second = await b.answer('wrong');
  assert.deepEqual([second.output, second.input], [[promptLine, { stream: 'out', text: 'Sorry, try again.\n' }], asks]);
  await b.answer('');
  const last = await b.answer('dragn');
  assert.deepEqual(last.output, [promptLine, { stream: 'err', text: 'sudo: 3 incorrect password attempts\n' }, { stream: 'out', text: 's=1\n' }]);
  assert.equal(last.input, undefined);
  assert.deepEqual(last.commands.map(c => [c.name, c.status]), [['sudo', 1], ['echo', 0]]);
});

test('Ctrl+C at the prompt (a null answer) gives up: a password is required, and the line goes on', async () => {
  const b = await realm({ extra: [password('dragon')] });
  await b.run('sudo whoami; echo after');
  const r = await b.answer(null);
  assert.deepEqual(r.output, [promptLine, { stream: 'err', text: 'sudo: a password is required\n' }, { stream: 'out', text: 'after\n' }]);
  await b.run('sudo whoami');
  await b.answer('nope');
  assert.equal((await b.answer(null)).output.at(-1).text, 'sudo: 1 incorrect password attempt\n');
});

test('what ran before the prompt ran once, and the password stays out of history and the observation', async () => {
  const b = await realm({ extra: [password('dragon')] });
  await b.run('echo x >> log.txt; ps > /dev/null; sudo whoami');
  await b.answer('dragon');
  assert.equal((await run(b, 'cat log.txt')).out, 'x\n');
  assert.deepEqual((await run(b, 'history')).out.split('\n').slice(0, 2).map(l => l.trim()), ['1  echo x >> log.txt; ps > /dev/null; sudo whoami', '2  cat log.txt']);
  assert.doesNotMatch(JSON.stringify(await b.observe()), /dragon/);
});

test('a correct password is remembered for 15 minutes of the clock; sudo -k forgets it', async () => {
  let now = NOW;
  const b = await shell([], { now: () => now });
  await b.load([put('/etc/group', file('root:x:0:\nsudo:x:27:hero\nhero:x:1000:\n')), login(), password('dragon')]);
  assert.ok((await b.run('sudo whoami')).input);
  await b.answer('dragon');
  now += 14 * 60 * 1000;
  assert.deepEqual(outcome(await run(b, 'sudo whoami')), ['root\n', '', 0]);
  now += 15 * 60 * 1000;
  assert.ok((await b.run('sudo whoami')).input);
  await b.answer('dragon');
  assert.deepEqual(outcome(await run(b, 'sudo -k; sudo -v')), ['', '', 0]);
  assert.equal((await b.answer('dragon')).status, 0);
  assert.equal((await run(b, 'sudo -n true')).status, 0);
  assert.deepEqual(outcome(await run(b, 'sudo -k; sudo -n true')), ['', 'sudo: a password is required\n', 1]);
});

test('a stranger to sudoers types the password, then is refused; auth.log records both', async () => {
  const b = await realm({ admin: false, extra: [password('dragon')] });
  await b.run('sudo ls');
  assert.deepEqual((await b.answer('dragon')).output, [promptLine, { stream: 'err', text: 'hero is not in the sudoers file.\n' }]);
  const log = (await b.observe()).tree.children.var.children.log.children['auth.log'].content;
  assert.match(log, / sudo: {5}hero : user NOT in sudoers ; TTY=pts\/0 ; PWD=\/home\/hero ; USER=root ; COMMAND=\/usr\/bin\/ls\n$/);
  await b.run('sudo ls');
  await b.answer('x');
  await b.answer('y');
  await b.answer('z');
  const failed = (await b.observe()).tree.children.var.children.log.children['auth.log'].content;
  assert.match(failed, /pam_unix\(sudo:auth\): authentication failure; logname=hero uid=1000 euid=0 tty=\/dev\/pts\/0 ruser=hero rhost= {2}user=hero\n.* sudo: {5}hero : 3 incorrect password attempts ; TTY=pts\/0 ; PWD=\/home\/hero ; USER=root ; COMMAND=\/usr\/bin\/ls\n$/);
});

test('while a line waits for input, run raises; answer raises when nothing waits', async () => {
  const b = await realm({ extra: [password('dragon')] });
  await assert.rejects(b.answer('x'), /no line is waiting/);
  await b.run('sudo whoami');
  await assert.rejects(b.run('ls'), /waiting for input/);
  await b.answer(null);
  assert.equal((await b.run('pwd')).status, 0);
});

test('as root, chown gives files away: to a user, to user:group, and a whole tree with -R', async () => {
  const b = await realm({ extra: [NOPASSWD, put('/home/hero/forge', dir({ 'a.txt': file('a\n', mine), inner: dir({ 'b.txt': file('b\n', mine) }, mine) }, mine))] });
  assert.deepEqual(outcome(await run(b, 'chown mira blade.txt')), ['', "chown: changing ownership of 'blade.txt': Operation not permitted\n", 1]);
  assert.deepEqual(outcome(await run(b, 'sudo chown mira blade.txt')), ['', '', 0]);
  assert.match((await run(b, 'ls -l blade.txt')).out, / mira hero /);
  assert.deepEqual(outcome(await run(b, 'sudo chown -v mira:smiths blade.txt')), ["changed ownership of 'blade.txt' from mira:hero to mira:smiths\n", '', 0]);
  assert.deepEqual(outcome(await run(b, 'sudo chown -R mira:smiths forge')), ['', '', 0]);
  assert.match((await run(b, 'ls -ld forge forge/a.txt forge/inner forge/inner/b.txt')).out, /^(\S+ \d+ mira smiths .*\n){4}$/);
  assert.deepEqual(outcome(await run(b, 'cat forge/a.txt')), ['a\n', '', 0]);
  assert.deepEqual(outcome(await run(b, 'echo x >> blade.txt')), ['', 'bash: blade.txt: Permission denied\n', 1]);
  assert.deepEqual(outcome(await run(b, 'sudo chown hero: blade.txt; ls -l blade.txt')).slice(1), ['', 0]);
  assert.match((await run(b, 'ls -l blade.txt')).out, / hero hero /);
});

test('loading a patch abandons a line waiting for input', async () => {
  const b = await realm({ extra: [password('dragon')] });
  await b.run('sudo whoami');
  await b.load([]);
  await assert.rejects(b.answer('dragon'), /no line is waiting/);
  assert.equal((await run(b, 'whoami')).out, 'hero\n');
});

test('sudo is a setuid program owned by root, with a manual page', async () => {
  const b = await realm();
  assert.match((await run(b, 'ls -l /usr/bin/sudo')).out, /^-rwsr-xr-x 1 root root /);
  assert.match((await run(b, 'man sudo')).out, /^SUDO\(1\)[\s\S]*execute a command as another user/);
});

const sudoRecord = r => r.commands.findLast(c => c.name === 'sudo');

test('the sudo record says how authentication went: ok, failed, cancelled, not-needed or not-allowed', async () => {
  const b = await realm({ extra: [password('dragon')] });
  await b.run('sudo whoami');
  assert.equal(sudoRecord(await b.answer('dragon')).auth, 'ok');
  assert.equal(sudoRecord((await b.run('sudo whoami'))).auth, 'not-needed');
  await b.run('sudo -k whoami');
  await b.answer('a');
  await b.answer('b');
  assert.deepEqual([sudoRecord(await b.answer('c'))].map(c => [c.auth, c.status, c.asUser]), [['failed', 1, 'root']]);
  await b.run('sudo -k whoami');
  assert.equal(sudoRecord(await b.answer(null)).auth, 'cancelled');
  assert.equal(sudoRecord(await b.run('sudo -k; sudo -n whoami')).auth, 'cancelled');
  assert.equal(sudoRecord(await b.run('sudo --version')).auth, null);
  const stranger = await realm({ admin: false, extra: [password('dragon')] });
  await stranger.run('sudo ls');
  assert.deepEqual([sudoRecord(await stranger.answer('dragon'))].map(c => [c.auth, c.asUser]), [['not-allowed', 'root']]);
  const nopass = await realm({ extra: [NOPASSWD] });
  assert.equal(sudoRecord(await nopass.run('sudo whoami')).auth, 'not-needed');
});

test('sudo su, sudo su -, sudo bash and sudo -s would open a root shell: a note, after the password', async () => {
  const b = await realm({ extra: [NOPASSWD] });
  for (const line of ['sudo su', 'sudo su -', 'sudo su - root', 'sudo bash', 'sudo -s', 'sudo sh', 'sudo bash -l']) {
    const r = await run(b, line);
    assert.deepEqual(outcome(r), ['', '', 1], line);
    assert.match(r.note, /root shell/, line);
  }
  assert.deepEqual(outcome(await run(b, "sudo bash -c 'whoami'")), ['root\n', '', 0]);
  const asked = await realm({ extra: [password('dragon')] });
  assert.ok((await asked.run('sudo su')).input);
  const r = await asked.answer('dragon');
  assert.match(r.output.find(c => c.stream === 'note').text, /root shell/);
  assert.equal(sudoRecord(r).auth, 'ok');
});

const SU_PROMPT = { prompt: 'Password: ', hidden: true };

test('su asks for root\'s password, which Ubuntu locks: Authentication failure, status 1, and a note', async () => {
  const b = await realm({ extra: [password('dragon')] });
  for (const line of ['su', 'su -', 'su root -c whoami', 'su mira']) {
    assert.deepEqual((await b.run(`${line}; echo s=$?`)).input, SU_PROMPT, line);
    const r = await b.answer('dragon');
    assert.deepEqual(r.output.filter(c => c.stream !== 'note').map(c => c.text), ['Password: \n', 'su: Authentication failure\n', 's=1\n'], line);
    assert.match(r.output.find(c => c.stream === 'note').text, /sudo/, line);
  }
});

test('su names a missing user at once, and Ctrl+C at its prompt ends the line with 130', async () => {
  const b = await realm();
  assert.deepEqual(outcome(await run(b, 'su nosuch')), ['', 'su: user nosuch does not exist or the user entry does not contain all the required fields\n', 1]);
  assert.deepEqual(outcome(await run(b, 'su -z')), ['', "su: invalid option -- 'z'\nTry 'su --help' for more information.\n", 1]);
  await b.run('su; echo after');
  const r = await b.answer(null);
  assert.deepEqual([r.output.map(c => c.text), r.status], [['Password: \n'], 130]);
});
