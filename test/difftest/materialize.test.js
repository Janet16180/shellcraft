import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialize, loginRecord } from '../../difftest/materialize.js';
import { put, remove, cd, proc, dir, file, symlink, link, password } from '../../src/backend/spec.js';

const T = Date.UTC(2026, 9, 6, 10);

test('put replaces the path and builds every node with owner, mode and time', () => {
  const { script } = materialize([put('/home/hero/forest', dir({ 'a.txt': file("it's\n", { owner: 'hero' }) }, { owner: 'hero' }))], T);
  const lines = script.trim().split('\n');
  assert.equal(lines[0], 'set -e');
  assert.ok(lines.includes("rm -rf -- '/home/hero/forest'"));
  assert.ok(lines.includes("mkdir -- '/home/hero/forest'"));
  assert.ok(script.includes("printf '%s' 'it'\\''s\n' > '/home/hero/forest/a.txt'"));
  assert.ok(lines.includes("chown 'hero:hero' -- '/home/hero/forest/a.txt'"));
  assert.ok(lines.includes("chmod 0644 -- '/home/hero/forest/a.txt'"));
  assert.ok(lines.includes(`if [ -e '/home/hero/forest/a.txt' ] || [ -L '/home/hero/forest/a.txt' ]; then touch -h -d @${T / 1000} -- '/home/hero/forest/a.txt'; fi`));
});

test('system directories are kept and only receive the children', () => {
  const { script } = materialize([put('/etc', dir({ motd: file('hi\n') }))], T);
  assert.doesNotMatch(script, /rm -rf -- '\/etc'/);
  assert.match(script, /mkdir -p -- '\/etc'/);
  assert.match(script, /printf '%s' 'hi\n' > '\/etc\/motd'/);
});

test('sticky and setuid modes keep four octal digits', () => {
  assert.match(materialize([put('/tmp', dir({}, { mode: 0o1777 }))], T).script, /chmod 1777 -- '\/tmp'/);
});

test('owners and groups that do not exist are created first', () => {
  const { script } = materialize([put('/srv', dir({}, { owner: 'keeper', group: 'guild' }))], T);
  assert.ok(script.indexOf('groupadd') < script.indexOf('chown'));
  assert.match(script, /getent passwd 'keeper' >\/dev\/null \|\| useradd -M -N 'keeper'/);
});

test('remove deletes, cd is returned for the shell, proc is ignored', () => {
  const { script, cds } = materialize([remove('/home/hero/junk'), cd('/tmp'), proc({ key: 'd', user: 'hero', cmd: 'x' })], T);
  assert.match(script, /rm -rf -- '\/home\/hero\/junk'/);
  assert.deepEqual(cds, ['/tmp']);
});

test('account and network files the container manages are left alone', () => {
  const { script } = materialize([put('/etc', dir({ shadow: file('x'), hostname: file('h\n'), motd: file('hi\n') }))], T);
  assert.doesNotMatch(script, /\/etc\/shadow|\/etc\/hostname/);
  assert.match(script, /\/etc\/motd/);
});

test('the users and groups of /etc/passwd and /etc/group are written before anything is owned', () => {
  const passwd = 'hero:x:1000:1000::/home/hero:/bin/bash\nmira:x:1001:1001::/home/mira:/bin/bash\n';
  const { script } = materialize([put('/home/hero/f', file('', { owner: 'mira' })), put('/etc', dir({ passwd: file(passwd), group: file('mira:x:1001:\n') }))], T);
  const written = script.indexOf("> '/etc/passwd'");
  assert.ok(written > 0 && written < script.indexOf('getent') && written < script.indexOf("chown 'mira:mira'"));
  assert.ok(script.indexOf("> '/etc/group'") < script.indexOf('getent'));
  assert.ok(script.includes(`printf '%s' '${passwd}' > '/etc/passwd'`));
});

test('a child of a kept system directory is replaced, not merged', () => {
  const { script } = materialize([put('/var', dir({ log: dir({ syslog: file('x') }) }))], T);
  assert.ok(script.indexOf("rm -rf -- '/var/log'") < script.indexOf("mkdir -- '/var/log'"));
  assert.doesNotMatch(script, /rm -rf -- '\/var'\n/);
});

test('the login record puts the user on the terminal at the given time, as utmpdump reads it', () => {
  assert.equal(loginRecord('hero', 'pts/0', T),
    "printf '%s\\n' '[7] [00000] [ts/0] [hero] [pts/0] [] [0.0.0.0] [2026-10-06T10:00:00,000000+00:00]' | utmpdump -r -o /run/utmp\n");
});

test('numeric owners and groups are used as ids, not created as accounts', () => {
  const { script } = materialize([put('/srv/f', file('', { owner: '1234', group: '4321' }))], T);
  assert.doesNotMatch(script, /useradd '1234'|groupadd '4321'/);
  assert.match(script, /chown '1234:4321' -- '\/srv\/f'/);
});

test('a symbolic link is made with ln -s and owned with chown -h; it has no mode to set', () => {
  const { script } = materialize([put('/home/hero/d', dir({ portal: symlink('../x y', { owner: 'hero' }) }, { owner: 'hero' }))], T);
  const lines = script.trim().split('\n');
  assert.ok(lines.includes("ln -s -- '../x y' '/home/hero/d/portal'"));
  assert.ok(lines.includes("chown -h 'hero:hero' -- '/home/hero/d/portal'"));
  assert.doesNotMatch(script, /chmod \d+ -- '\/home\/hero\/d\/portal'/);
  assert.ok(lines.includes(`if [ -e '/home/hero/d/portal' ] || [ -L '/home/hero/d/portal' ]; then touch -h -d @${T / 1000} -- '/home/hero/d/portal'; fi`));
});

test('a hard link is made with ln and keeps the owner and mode of the file it names', () => {
  const { script } = materialize([put('/home/hero/a', file('a', { owner: 'hero' })), put('/home/hero/b', link('/home/hero/a'))], T);
  const lines = script.trim().split('\n');
  assert.ok(lines.includes("ln -- '/home/hero/a' '/home/hero/b'"));
  assert.doesNotMatch(script, /(chown|chmod) .* '\/home\/hero\/b'/);
});

test("password sets the player's password with chpasswd, after the accounts exist", () => {
  const { script } = materialize([put('/etc', dir({ passwd: file('hero:x:1000:1000::/home/hero:/bin/bash\n') })), password("it's")], T);
  const set = script.indexOf("printf '%s\\n' 'hero:it'\\''s' | chpasswd");
  assert.ok(set > script.indexOf("> '/etc/passwd'"), script);
  assert.doesNotMatch(materialize([password(null)], T).script, /chpasswd/);
});
