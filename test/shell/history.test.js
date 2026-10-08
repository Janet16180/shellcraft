import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandHistory } from '../../src/shell/history.js';
import { shell, run } from './helpers.js';

const H = ['ls nope', 'echo one two', 'echo "a b" > f; cat f'];
const ex = line => expandHistory(line, H);

test('a line without a history event is left alone', () => {
  assert.deepEqual(ex('echo hi'), { line: 'echo hi', expanded: false, error: null });
});

test('!! is the previous line, !N line N, !-N the Nth from the end', () => {
  assert.equal(ex('!!').line, H[2]);
  assert.equal(ex('echo !!x').line, `echo ${H[2]}x`);
  assert.equal(ex('!1').line, 'ls nope');
  assert.equal(ex('!-2 | wc').line, 'echo one two | wc');
  assert.equal(ex('!!').expanded, true);
});

test('!string is the last line that starts with it; !?string? the last that contains it', () => {
  assert.equal(ex('!ec').line, 'echo "a b" > f; cat f');
  assert.equal(ex('!ls;echo').line, 'ls nope;echo');
  assert.equal(ex('!?two?').line, 'echo one two');
});

test('word designators pick words of the event', () => {
  assert.equal(ex('echo !$').line, 'echo f');
  assert.equal(ex('echo !-2:1 !-2:$ !-2:^ !-2:*').line, 'echo one two one one two');
  assert.equal(ex('echo !!:1').line, 'echo "a b"');
  assert.deepEqual(ex('echo !-3:5').error, 'bash: :5: bad word specifier');
});

test('an event that is not there is an error, and the line does not run', () => {
  assert.deepEqual(ex('echo "#!/bin/bash" > f'), { line: null, expanded: false, error: 'bash: !/bin/bash: event not found' });
  assert.equal(ex('!99').error, 'bash: !99: event not found');
  assert.equal(ex('!nope').error, 'bash: !nope: event not found');
  assert.equal(ex('echo "a\'!\'b"').error, "bash: !'b: event not found");
  assert.equal(expandHistory('!!', []).error, 'bash: !!: event not found');
});

test('! is literal in single quotes, after a backslash, before a blank, = or (, at the end, before a closing double quote, and in $!, ${!x} and [!x]', () => {
  for (const line of ["echo '#!/bin/bash'", 'echo \\!!', 'echo ! x', 'echo x!= x!(', 'echo a!', 'echo "c!" "!"', 'echo $!', 'echo ${!HO*}', "echo '!!' \"x\"", 'ls [!a-z]*']) {
    assert.deepEqual(ex(line), { line, expanded: false, error: null }, line);
  }
});

test('at the prompt, an expanded line is echoed, run and remembered as expanded', async () => {
  const b = await shell();
  await run(b, 'echo one');
  const r = await run(b, '!! | wc -l');
  assert.deepEqual([r.out, r.err, r.status], ['1\n', 'echo one | wc -l\n', 0]);
  assert.equal((await run(b, 'history')).out, '    1  echo one\n    2  echo one | wc -l\n    3  history\n');
});

test('at the prompt, a missing event runs nothing, keeps $?, and is not remembered', async () => {
  const b = await shell();
  await run(b, 'false');
  const r = await run(b, 'echo "#!/bin/bash" > f');
  assert.deepEqual([r.out, r.err, r.status, r.result.commands], ['', 'bash: !/bin/bash: event not found\n', 1, []]);
  assert.equal((await b.observe()).tree.children.home.children.hero.children.f, undefined);
  assert.equal((await run(b, 'history')).out, '    1  false\n    2  history\n');
});
