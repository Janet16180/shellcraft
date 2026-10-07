import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from './helpers.js';
import { put, file, dir } from '../../src/backend/spec.js';

const script = (name, text) => put(`/home/hero/${name}`, file(text, { owner: 'hero', mode: 0o755 }));
const outcome = r => [r.out, r.err, r.status];

test('for runs its body once per word, globs and "$@" included', async () => {
  const b = await shell([put('/home/hero/ore', dir({ a: file(''), b: file('') }, { owner: 'hero' }))]);
  assert.equal((await run(b, 'for f in ~/ore/*; do echo $f; done')).out, '/home/hero/ore/a\n/home/hero/ore/b\n');
  assert.equal((await run(b, 'for x in 1 2; do echo $x | wc -c; done; echo $x')).out, '2\n2\n2\n');
  assert.equal((await run(b, "bash -c 'for a in \"$@\"; do echo [$a]; done' n 'x y' z")).out, '[x y]\n[z]\n');
  assert.equal((await run(b, "bash -c 'for a; do echo [$a]; done' n p q")).out, '[p]\n[q]\n');
  assert.deepEqual(outcome(await run(b, 'for y in; do echo no; done')), ['', '', 0]);
});

test('a loop can be redirected and piped as one command', async () => {
  const b = await shell();
  assert.equal((await run(b, 'for x in a b; do echo $x; done > o; cat o')).out, 'a\nb\n');
  assert.equal((await run(b, 'for x in a b; do echo $x; done | sort -r')).out, 'b\na\n');
  assert.equal((await run(b, 'for x in a; do ls; done | cat')).out, 'forest\no\nreadme.txt\n');
  assert.equal((await run(b, 'for x in a; do nosuch; done 2>/dev/null; echo $?')).out, '127\n');
});

test('each command inside a loop is recorded, the loop itself is not', async () => {
  const r = await run(await shell(), 'for x in a b; do echo $x; done');
  assert.deepEqual(r.result.commands.map(c => [c.name, c.args]), [['echo', ['a']], ['echo', ['b']]]);
});

test('if runs the first branch whose condition succeeds', async () => {
  const b = await shell();
  assert.equal((await run(b, 'if true; then echo t; fi')).out, 't\n');
  assert.equal((await run(b, 'if false; then echo t; elif true; then echo e; else echo f; fi')).out, 'e\n');
  assert.equal((await run(b, 'if false; then echo t; else echo f; fi')).out, 'f\n');
  assert.deepEqual(outcome(await run(b, 'if false; then echo t; fi')), ['', '', 0]);
  assert.equal((await run(b, 'if ls nope 2>/dev/null; then echo y; else echo n $?; fi')).out, 'n 2\n');
});

test('! inverts the status of a pipeline', async () => {
  const b = await shell();
  assert.equal((await run(b, '! true; echo $?; ! false; echo $?')).out, '1\n0\n');
  assert.equal((await run(b, 'if ! false; then echo neg; fi')).out, 'neg\n');
});

test('break and continue leave loops, nested ones with a count', async () => {
  const b = await shell();
  assert.equal((await run(b, 'for i in 1 2; do for j in a b; do echo $i$j; continue 2; done; done')).out, '1a\n2a\n');
  assert.equal((await run(b, 'for i in 1 2; do for j in a b; do echo $i$j; break 2; done; done; echo $?')).out, '1a\n0\n');
  assert.equal((await run(b, 'for i in 1 2; do for j in a b; do echo $i$j; break; done; done')).out, '1a\n2a\n');
  assert.equal((await run(b, 'for i in 1 2; do echo $i; continue 9; echo no; done')).out, '1\n2\n');
  assert.deepEqual(outcome(await run(b, 'break; echo $?')), ['0\n', "bash: break: only meaningful in a `for', `while', or `until' loop\n", 0]);
  assert.deepEqual(outcome(await run(b, 'for i in 1 2; do break 0; echo no; done; echo $?')), ['1\n', 'bash: break: 0: loop count out of range\n', 0]);
  assert.deepEqual(outcome(await run(b, 'for i in 1 2; do break x; echo no; done; echo no')), ['', 'bash: break: x: numeric argument required\n', 128]);
});

test('a script runs command by command, a loop across lines included', async () => {
  const b = await shell([script('s.sh', 'echo one\nfor x in a b\ndo\n  echo $x\n  nosuch\ndone\n# done\necho end\n')]);
  const r = await run(b, './s.sh');
  assert.deepEqual(outcome(r), ['one\na\nb\nend\n', './s.sh: line 5: nosuch: command not found\n./s.sh: line 5: nosuch: command not found\n', 0]);
});

test('a runtime error names the line a command ends on, and its substitutions the same', async () => {
  const b = await shell([script('s.sh', 'nosuch \\\n  arg\necho \\\n "$(nosuch2)"\nfor 1 in a\ndo echo\ndone\n')]);
  const r = await run(b, './s.sh');
  assert.equal(r.err, "./s.sh: line 2: nosuch: command not found\n./s.sh: line 4: nosuch2: command not found\n./s.sh: line 7: `1': not a valid identifier\n");
});

test('a syntax error in a script stops it after the commands before it, with status 2', async () => {
  const b = await shell([
    script('a.sh', 'echo one\necho >\necho never\n'),
    script('b.sh', 'echo one\nfor x in a b; do\n  echo $x\n'),
    script('c.sh', 'echo one\necho "abc\necho two\n'),
    script('d.sh', 'for x in a b\n  echo $x\ndone\n'),
  ]);
  assert.deepEqual(outcome(await run(b, './a.sh')), ['one\n', "./a.sh: line 2: syntax error near unexpected token `newline'\n./a.sh: line 2: `echo >'\n", 2]);
  assert.deepEqual(outcome(await run(b, 'bash b.sh')), ['one\n', 'b.sh: line 4: syntax error: unexpected end of file\n', 2]);
  assert.deepEqual(outcome(await run(b, './c.sh')), ['one\n', "./c.sh: line 2: unexpected EOF while looking for matching `\"'\n", 2]);
  assert.equal((await run(b, './d.sh')).err, "./d.sh: line 2: syntax error near unexpected token `echo'\n./d.sh: line 2: `  echo $x'\n");
});

test('bash -c names -c in syntax errors, and counts a missing newline at the end', async () => {
  const b = await shell();
  assert.equal((await run(b, "bash -c 'for x'")).err, 'bash: -c: line 2: syntax error: unexpected end of file\n');
  assert.equal((await run(b, "bash -c 'echo a; fi'")).err, "bash: -c: line 1: syntax error near unexpected token `fi'\nbash: -c: line 1: `echo a; fi'\n");
});

test('a syntax error in a file sourced at the prompt names the file', async () => {
  const b = await shell([script('s.sh', 'echo a\nfi\n')]);
  const r = await run(b, 'source s.sh; echo $?');
  assert.deepEqual([r.out, r.err], ['a\n2\n', "bash: s.sh: line 2: syntax error near unexpected token `fi'\nbash: s.sh: line 2: `fi'\n"]);
});

test('a syntax error at the prompt names no line and runs nothing on the line', async () => {
  const r = await run(await shell(), 'echo a; for x in a; echo $x; done');
  assert.deepEqual(outcome(r), ['', "bash: syntax error near unexpected token `echo'\n", 2]);
  assert.match((await run(await shell(), 'for x in a; do echo')).note, /wait for the rest/);
});

test('exit ends a script with its status, or the last one', async () => {
  const b = await shell([script('e.sh', 'echo a\nexit 4\necho never\n'), script('f.sh', 'false\nexit\n'), script('g.sh', 'exit abc\necho never\n')]);
  assert.deepEqual(outcome(await run(b, './e.sh')), ['a\n', '', 4]);
  assert.equal((await run(b, './f.sh')).status, 1);
  assert.deepEqual(outcome(await run(b, './g.sh')), ['', './g.sh: line 1: exit: abc: numeric argument required\n', 2]);
  assert.deepEqual(outcome(await run(b, "bash -c 'for i in 1 2; do exit 3; done; echo no'; echo $?")), ['3\n', '', 0]);
});

test('exit at the prompt still only explains itself', async () => {
  const r = await run(await shell(), 'exit; echo still');
  assert.equal(r.out, 'still\n');
  assert.match(r.note, /closes the shell/);
});

test('exit inside a command substitution leaves only the substitution', async () => {
  const b = await shell();
  assert.equal((await run(b, 'echo $(echo a; exit 5; echo no) $?')).out, 'a 5\n');
});
