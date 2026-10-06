import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePosix } from '../../src/shell/regex.js';

const matches = (pattern, line, opts = {}) => {
  const { regex, error } = compilePosix([pattern], opts);
  assert.equal(error, null, `${pattern}: ${error}`);
  return regex.test(line);
};
const errorOf = (pattern, opts = {}) => compilePosix([pattern], opts).error;

test('in a basic expression + ? | ( ) { } are literal characters', () => {
  assert.equal(matches('a+', 'aa'), false);
  assert.equal(matches('a+', 'a+'), true);
  assert.equal(matches('a|b', 'a|b'), true);
  assert.equal(matches('a|b', 'a'), false);
  assert.equal(matches('(x)', '(x)'), true);
});

test('GNU basic expressions accept \\+ \\? \\| \\( \\) and \\{m,n\\}', () => {
  assert.equal(matches('o\\+n', 'potion'), true);
  assert.equal(matches('a\\?p', 'pp'), true);
  assert.equal(matches('apple\\|torch', 'torch'), true);
  assert.equal(matches('\\(ap\\)\\1', 'apap'), true);
  assert.equal(matches('x\\{2\\}', 'axxb'), true);
  assert.equal(matches('x\\{2\\}', 'axb'), false);
});

test('extended expressions use + ? | ( ) { } directly', () => {
  assert.equal(matches('o+n', 'potion', { extended: true }), true);
  assert.equal(matches('apple|torch', 'apple', { extended: true }), true);
  assert.equal(matches('(ap)+', 'apap', { extended: true }), true);
  assert.equal(matches('o{2}', 'foo', { extended: true }), true);
  assert.equal(matches('a{,2}b', 'b', { extended: true }), true);
  assert.equal(matches('a\\+', 'a+', { extended: true }), true);
});

test('anchors, dot, star and bracket expressions with classes', () => {
  assert.equal(matches('^s', 'sword'), true);
  assert.equal(matches('h$', 'torch'), true);
  assert.equal(matches('p.t', 'potion'), true);
  assert.equal(matches('[[:digit:]]', '9 bolts'), true);
  assert.equal(matches('[^a-z]', 'abc'), false);
  assert.equal(matches('[]x]', ']'), true);
  assert.equal(matches('[a\\]', '\\'), true);
  assert.equal(matches('*a', '*a'), true);
  assert.equal(matches('a^b', 'a^b'), true);
});

test('word boundaries \\< \\> \\b and classes \\w \\s', () => {
  assert.equal(matches('\\<sw', 'a sword'), true);
  assert.equal(matches('\\<sw', 'asword'), false);
  assert.equal(matches('rd\\>', 'sword'), true);
  assert.equal(matches('\\bpot', 'potion'), true);
  assert.equal(matches('\\w\\s\\w', 'a b'), true);
});

test('fixed strings match literally; several patterns are alternatives', () => {
  assert.equal(matches('o+', 'o+', { fixed: true }), true);
  assert.equal(matches('o+', 'oo', { fixed: true }), false);
  const { regex } = compilePosix(['potion', 'map'], {});
  assert.ok(regex.test('map') && regex.test('potion') && !regex.test('sword'));
});

test('-i, -w and -x change what counts as a match', () => {
  assert.equal(matches('LINE', 'line 1', { ignoreCase: true }), true);
  assert.equal(matches('pot', 'potion', { word: true }), false);
  assert.equal(matches('pot', 'a pot.', { word: true }), true);
  assert.equal(matches('potion', 'potions', { line: true }), false);
});

test('malformed expressions give GNU grep messages', () => {
  assert.equal(errorOf('['), 'Invalid regular expression');
  assert.equal(errorOf('[a'), 'Unmatched [, [^, [:, [., or [=');
  assert.equal(errorOf('[[:foo:]]'), 'Invalid character class name');
  assert.equal(errorOf('[b-a]'), 'Invalid range end');
  assert.equal(errorOf('a\\{1'), 'Unmatched \\{');
  assert.equal(errorOf('a\\{x\\}'), 'Invalid content of \\{\\}');
  assert.equal(errorOf('\\(a'), 'Unmatched ( or \\(');
  assert.equal(errorOf('a\\)'), 'Unmatched ) or \\)');
  assert.equal(errorOf('\\1'), 'Invalid back reference');
  assert.equal(errorOf('a\\'), 'Trailing backslash');
  assert.equal(errorOf('(', { extended: true }), 'Unmatched ( or \\(');
  assert.equal(errorOf('a{2,1}', { extended: true }), 'Invalid content of \\{\\}');
});

test('an extended ) or { that cannot be special is literal', () => {
  assert.equal(matches('a)', 'a)b', { extended: true }), true);
  assert.equal(matches('a{', 'a{b', { extended: true }), true);
  assert.equal(matches('a{x}', 'a{x}', { extended: true }), true);
});

test('a leading + or * in an extended expression is ignored with a warning', () => {
  const r = compilePosix(['+a'], { extended: true });
  assert.equal(r.warning, '+ at start of expression');
  assert.ok(r.regex.test('cat'));
});
