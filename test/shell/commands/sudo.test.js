import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run, NOW } from '../helpers.js';
import { put, dir, file, login } from '../../../src/backend/spec.js';

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
