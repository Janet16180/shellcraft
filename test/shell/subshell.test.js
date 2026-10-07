import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystem } from '../../src/shell/system.js';
import { setVar, varValue } from '../../src/shell/vars.js';
import { enterChild, leaveChild } from '../../src/shell/subshell.js';

const make = () => createSystem({ user: 'hero', host: 'kernelia', home: '/home/hero', now: () => 3, random: () => 0.5, binaries: ['ls'] });

test('a child shell starts with the exported variables, the extra environment and SHLVL one higher', () => {
  const sys = make();
  setVar(sys, 'spell', 'x');
  setVar(sys, 'shown', 'y', true);
  enterChild(sys, { zero: 's.sh', args: ['a'], env: { V: '1' } });
  assert.deepEqual(['spell', 'shown', 'V', 'SHLVL', 'HOSTNAME', 'COLUMNS', '0', '1', '-'].map(n => varValue(sys, n)), ['', 'y', '1', '2', 'kernelia', '', 's.sh', 'a', 'hB']);
  assert.equal(sys.vars.V.exported, true);
});

test('leaving a child shell gives back everything the parent had', () => {
  const sys = make();
  sys.aliases.zz = 'ls';
  const saved = enterChild(sys, { zero: 's.sh', args: [], env: {} });
  assert.deepEqual(Object.keys(sys.aliases), []);
  setVar(sys, 'z', '1');
  sys.cwd = '/';
  sys.umask = 0o077;
  sys.hashed.set('ls', '/usr/bin/ls');
  leaveChild(sys, saved);
  assert.deepEqual([varValue(sys, 'z'), sys.cwd, sys.umask, sys.hashed.size, sys.aliases.zz, varValue(sys, '0'), varValue(sys, '-')], ['', '/home/hero', 0o022, 0, 'ls', 'bash', 'himBHs']);
});
