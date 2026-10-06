import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutColumns } from '../../src/shell/columns.js';

const greek = ['alpha', 'beta', 'chi', 'delta', 'epsilon', 'eta', 'gamma', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'omega', 'omicron', 'phi', 'pi', 'psi', 'rho', 'sigma', 'tau', 'theta', 'upsilon', 'xi', 'zeta'];
const plain = names => names.map(n => ({ text: n, width: n.length }));

test('names fill columns top to bottom, padded with tabs like GNU ls', () => {
  assert.equal(layoutColumns(plain(greek), 80), [
    'alpha  delta\tgamma  lambda  omega\tpi   sigma  upsilon',
    'beta   epsilon\tiota   mu      omicron\tpsi  tau    xi',
    'chi    eta\tkappa  nu      phi\trho  theta  zeta',
  ].join('\n') + '\n');
});

test('a narrower terminal gives fewer columns', () => {
  assert.equal(layoutColumns(plain(greek), 40), [
    'alpha\t gamma\t omega\t  sigma', 'beta\t iota\t omicron  tau', 'chi\t kappa\t phi\t  theta',
    'delta\t lambda  pi\t  upsilon', 'epsilon  mu\t psi\t  xi', 'eta\t nu\t rho\t  zeta',
  ].join('\n') + '\n');
});

test('quoted names and padded plain names keep their display widths', () => {
  const items = [' 10.txt', ' 9.txt', ' B', ' Banana.txt', ' Zebra', ' _under', "'a$b'", ' apple.txt', ' cherry', '"it\'s"', "'my notes.txt'", ' run.sh', "'tab'$'\\t''x'"];
  assert.equal(layoutColumns(plain(items), 80), [
    ' 10.txt   Banana.txt  \'a$b\'\t  "it\'s"\t  \'tab\'$\'\\t\'\'x\'',
    ' 9.txt\t  Zebra        apple.txt  \'my notes.txt\'',
    ' B\t  _under       cherry\t   run.sh',
  ].join('\n') + '\n');
  assert.equal(layoutColumns(plain(items), 20), items.join('\n') + '\n');
});

test('one name, or none, gives one line or nothing', () => {
  assert.equal(layoutColumns(plain(['one']), 80), 'one\n');
  assert.equal(layoutColumns([], 80), '');
});

test('the html form of each name can be laid out with the same padding', () => {
  const items = [{ text: 'a', width: 1, html: '<b>a</b>' }, { text: 'b', width: 1 }];
  assert.equal(layoutColumns(items, 80, 'html'), '<b>a</b>  b\n');
});
