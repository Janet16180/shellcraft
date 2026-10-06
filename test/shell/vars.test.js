import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseEnvironment, varValue } from '../../src/shell/vars.js';

const sys = () => ({ home: '/home/hero', user: 'hero', host: 'kernelia', cwd: '/tmp', oldpwd: null, vars: {}, shellPid: 733, lastStatus: 2 });

test('the base environment has the login variables', () => {
  assert.deepEqual(baseEnvironment(sys()), { HOME: '/home/hero', USER: 'hero', SHELL: '/bin/bash', PWD: '/tmp', PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' });
});

test('special parameters, braces and user variables expand', () => {
  const s = sys();
  s.vars.HOME = '/elsewhere';
  s.vars.X = '1';
  assert.equal(varValue(s, '$'), '733');
  assert.equal(varValue(s, '?'), '2');
  assert.equal(varValue(s, '{X}'), '1');
  assert.equal(varValue(s, 'HOME'), '/elsewhere');
  assert.equal(varValue(s, 'HOSTNAME'), 'kernelia');
});

test('unset variables expand to nothing', () => {
  assert.equal(varValue(sys(), 'NOPE'), '');
  assert.equal(varValue(sys(), 'OLDPWD'), '');
});
