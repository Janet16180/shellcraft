import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialVars, varValue, setVar, exportedVars } from '../../src/shell/vars.js';

const sys = () => ({ home: '/home/hero', user: 'hero', host: 'kernelia', cwd: '/home/hero', vars: initialVars({ user: 'hero', home: '/home/hero', host: 'kernelia' }), shellPid: 733, lastStatus: 2 });

test('a login starts with the usual exported variables', () => {
  const s = sys();
  assert.equal(varValue(s, 'HOME'), '/home/hero');
  assert.equal(varValue(s, 'USER'), 'hero');
  assert.equal(varValue(s, 'PWD'), '/home/hero');
  assert.equal(varValue(s, 'PATH'), '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin');
  assert.equal(varValue(s, 'LANG'), 'C.UTF-8');
  assert.equal(varValue(s, 'HOSTNAME'), 'kernelia');
  assert.equal(varValue(s, 'OLDPWD'), '');
  assert.equal(varValue(s, 'COLUMNS'), '80');
  assert.ok(!('HOSTNAME' in exportedVars(s)));
  assert.equal(exportedVars(s).HOME, '/home/hero');
});

test('special parameters expand to the shell state', () => {
  const s = sys();
  assert.equal(varValue(s, '$'), '733');
  assert.equal(varValue(s, '?'), '2');
  assert.equal(varValue(s, '0'), 'bash');
  assert.equal(varValue(s, '#'), '0');
  assert.equal(varValue(s, '1'), '');
});

test('setVar keeps the export flag of an existing variable and can export', () => {
  const s = sys();
  setVar(s, 'HOME', '/x');
  assert.equal(exportedVars(s).HOME, '/x');
  setVar(s, 'SPELL', 'fire');
  assert.ok(!('SPELL' in exportedVars(s)));
  setVar(s, 'SPELL', 'ice', true);
  assert.equal(exportedVars(s).SPELL, 'ice');
});

test('unset variables expand to nothing', () => {
  assert.equal(varValue(sys(), 'NOPE'), '');
});
