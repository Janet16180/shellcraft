import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialize, loginRecord } from '../../difftest/materialize.js';
import { put, remove, cd, proc, dir, file } from '../../src/backend/spec.js';

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
  assert.ok(lines.includes(`[ ! -e '/home/hero/forest/a.txt' ] || touch -h -d @${T / 1000} -- '/home/hero/forest/a.txt'`));
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

test('account files the container manages are left alone', () => {
  const { script } = materialize([put('/etc', dir({ passwd: file('x'), motd: file('hi\n') }))], T);
  assert.doesNotMatch(script, /\/etc\/passwd/);
  assert.match(script, /\/etc\/motd/);
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
