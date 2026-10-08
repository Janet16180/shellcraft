import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/shell/lexer.js';
import { expandWords, expandTarget, expandAssignment } from '../../src/shell/expand.js';
import { newDir, newFile } from '../../src/shell/fs.js';

const meta = { mode: 0o755, owner: 'hero', group: 'hero', mtime: 0 };
const env = () => ({
  sys: { root: newDir({ d: newDir({ 'a.txt': newFile('', meta), 'b.txt': newFile('', meta) }, meta) }, meta), cwd: '/d', user: 'hero', gids: [1000] },
  lookupVar: name => ({ HOME: '/home/hero', X: 'a  b', E: '', S: ' lead trail ', G: '*.txt' })[name] ?? '',
  homeOf: user => ({ root: '/root', hero: '/home/hero' })[user] ?? null,
  substitute: line => `out of ${line}\n\n`,
  fail: () => {},
  positional: () => ['a  b', 'c'],
});
const words = line => tokenize(line).tokens;
const expand = line => expandWords(words(line), env());

test('quote removal leaves the text', () => {
  assert.deepEqual(expand(`echo 'a  b' "c d" e\\ f`), ['echo', 'a  b', 'c d', 'e f']);
});

test('unquoted variables split on blanks; quoted ones stay one word', () => {
  assert.deepEqual(expand('echo $X "$X" x$X'), ['echo', 'a', 'b', 'a  b', 'xa', 'b']);
  assert.deepEqual(expand('echo $S.'), ['echo', 'lead', 'trail', '.']);
});

test('an empty unquoted expansion disappears; an empty quoted one is an empty word', () => {
  assert.deepEqual(expand('echo $E x "$E" \'\''), ['echo', 'x', '', '']);
});

test('tilde expands to the home of the user, or stays when the user is unknown', () => {
  assert.deepEqual(expand('echo ~ ~/f ~root ~nobody "~"'), ['echo', '/home/hero', '/home/hero/f', '/root', '~nobody', '~']);
});

test('globs expand after variables, but not inside quotes', () => {
  assert.deepEqual(expand('ls *.txt "*.txt" $G "$G" nomatch*'), ['ls', 'a.txt', 'b.txt', '*.txt', 'a.txt', 'b.txt', '*.txt', 'nomatch*']);
});

test('command substitution inserts the output without its trailing newlines', () => {
  assert.deepEqual(expand('echo "$(pwd)" $(ls)'), ['echo', 'out of pwd', 'out', 'of', 'ls']);
});

test('a redirection target expands to one word or is ambiguous', () => {
  assert.deepEqual(expandTarget(words('~/out.txt')[0], env()), { value: '/home/hero/out.txt', error: null });
  assert.deepEqual(expandTarget(words('$X')[0], env()), { value: null, error: 'bash: $X: ambiguous redirect' });
  assert.deepEqual(expandTarget(words('$E')[0], env()), { value: null, error: 'bash: $E: ambiguous redirect' });
});

test('an assignment value expands without splitting or globbing', () => {
  assert.equal(expandAssignment(words('V=$X*')[0], env()), 'a  b*');
});

test('arithmetic expansion computes with variables', () => {
  const e = { ...env(), lookupVar: name => ({ N: '4' })[name] ?? '' };
  assert.deepEqual(expandWords(words('echo $((N*2+1)) "$(( $N - 1 ))"'), e), ['echo', '9', '3']);
});

test('an arithmetic error is reported through fail', () => {
  const failures = [];
  expandWords(words('echo $((1/0))'), { ...env(), fail: m => failures.push(m) });
  assert.deepEqual(failures, ['bash: 1/0: division by 0 (error token is "0")']);
});

test('"$@" makes one word per argument; $@ and $* split them', () => {
  assert.deepEqual(expand('echo "$@" "<$@>" $@ "$*"'), ['echo', 'a  b', 'c', '<a  b', 'c>', 'a', 'b', 'c', 'a  b c']);
  assert.equal(expandAssignment(words('x="$@"')[0], env()), 'a  b c');
});

test('"$@" with no arguments is no word at all', () => {
  const none = { ...env(), positional: () => [] };
  assert.deepEqual(expandWords(words('echo "$@" "x$@"'), none), ['echo', 'x']);
});

test('brace expansion comes first, then tilde, variables and globs on each word', () => {
  assert.deepEqual(expand('echo {a,b} x{1..2}y "{a,b}" {a} {}'), ['echo', 'a', 'b', 'x1y', 'x2y', '{a,b}', '{a}', '{}']);
  assert.deepEqual(expand('echo {~,x} ~{root,nobody} {$X,c}'), ['echo', '/home/hero', 'x', '/root', '~nobody', 'a', 'b', 'c']);
  assert.deepEqual(expand('ls {a,b}.txt {*.txt,c} {#a,b} {a,""}'), ['ls', 'a.txt', 'b.txt', 'a.txt', 'b.txt', 'c', '#a', 'b', 'a', '']);
  assert.deepEqual(expand('echo {,}'), ['echo']);
});

test('a redirection target that braces make into two words is ambiguous', () => {
  assert.deepEqual(expandTarget(words('{a,b}')[0], env()), { value: null, error: 'bash: {a,b}: ambiguous redirect' });
});

test('${v#pat} and ${v##pat} cut the shortest and longest matching prefix', () => {
  const e = { ...env(), lookupVar: name => ({ V: 'dir/sub/file.tar.gz', P: 'dir', S: '*', W: 'a*b', X: 'a  b' })[name] ?? '' };
  const ex = line => expandWords(words(line), e);
  assert.deepEqual(ex('echo ${V#*/} ${V##*/} ${V#nomatch} "${V#d?r}"'), ['echo', 'sub/file.tar.gz', 'file.tar.gz', 'dir/sub/file.tar.gz', '/sub/file.tar.gz']);
  assert.deepEqual(ex('echo ${V%.*} ${V%%.*} ${V%/*} ${V%}'), ['echo', 'dir/sub/file.tar', 'dir/sub/file', 'dir/sub', 'dir/sub/file.tar.gz']);
  assert.deepEqual(ex(`echo "\${V#$P/}" "\${V#"$S"}" "\${V#$S}" "\${V#'d'*/}" "\${V#\\d}" x\${U#x}`), ['echo', 'sub/file.tar.gz', 'dir/sub/file.tar.gz', 'dir/sub/file.tar.gz', 'sub/file.tar.gz', 'ir/sub/file.tar.gz', 'x']);
  assert.deepEqual(ex(`echo "\${W#a\\*}" "\${W#"a*"}" "\${W%%[*]*}"`), ['echo', 'b', 'b', 'a']);
  assert.deepEqual(ex('echo ${X#a} "${X#a}"'), ['echo', 'b', '  b']);
});

test('${#v} is the length of the value', () => {
  const e = { ...env(), lookupVar: name => ({ V: 'dir/sub/file.tar.gz' })[name] ?? '' };
  assert.deepEqual(expandWords(words('echo ${#V} ${#U}'), e), ['echo', '19', '0']);
});
