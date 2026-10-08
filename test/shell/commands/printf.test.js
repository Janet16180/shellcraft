import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, run } from '../helpers.js';

const out = async line => (await run(await shell(), line)).out;

test('printf fills %s and %d and decodes escapes in the format', async () => {
  assert.equal(await out("printf 'x=%s y=%d\\n' a 5"), 'x=a y=5\n');
  assert.equal(await out("printf 'a\\tb\\x41\\101\\\\%%\\n'"), 'a\tbAA\\%\n');
  assert.equal(await out('printf hello'), 'hello');
});

test('printf reuses the format for leftover arguments; missing ones are empty or 0', async () => {
  assert.equal(await out("printf 'x=%s y=%d\\n' a 5 b"), 'x=a y=5\nx=b y=0\n');
  assert.equal(await out("printf '%s\\n' one two three"), 'one\ntwo\nthree\n');
  assert.equal(await out("printf 'no spec\\n' a b"), 'no spec\n');
});

test('printf takes widths, flags, precision and the other conversions', async () => {
  assert.equal(await out("printf '%5s|%-3d|%05d|%.2s|%5.1s|\\n' ab 7 42 abcdef abc"), '   ab|7  |00042|ab|    a|\n');
  assert.equal(await out("printf '%c|%x|%X|%o|%u|%i|%b|\\n' hello 255 255 8 3 4 'a\\tb'"), 'h|ff|FF|10|3|4|a\tb|\n');
  assert.equal(await out("printf '%d\\n' -5 +3 0x10 010 \"'A\""), '-5\n3\n16\n8\n65\n');
  assert.equal(await out("printf '%.2f|%s\\n' 3.14159 x"), '3.14|x\n');
});

test('printf reports bad numbers and formats the way bash does', async () => {
  const b = await shell();
  const bad = await run(b, "printf '%d\\n' 3abc");
  assert.deepEqual([bad.out, bad.err, bad.status], ['3\n', 'bash: printf: 3abc: invalid number\n', 1]);
  const word = await run(b, "printf '%d\\n' abc");
  assert.deepEqual([word.out, word.err, word.status], ['0\n', 'bash: printf: abc: invalid number\n', 1]);
  const pct = await run(b, "printf 'a%'");
  assert.deepEqual([pct.out, pct.err, pct.status], ['a', "bash: printf: `%': missing format character\n", 1]);
  const ch = await run(b, "printf 'a%y|'");
  assert.deepEqual([ch.out, ch.err, ch.status], ['a', "bash: printf: `y': invalid format character\n", 1]);
});

test('printf without a format prints its usage; -v stores the text in a variable', async () => {
  const b = await shell();
  const none = await run(b, 'printf');
  assert.deepEqual([none.err, none.status], ['printf: usage: printf [-v var] format [arguments]\n', 2]);
  const opt = await run(b, 'printf -x');
  assert.deepEqual([opt.err, opt.status], ['bash: printf: -x: invalid option\nprintf: usage: printf [-v var] format [arguments]\n', 2]);
  const v = await run(b, 'printf -v');
  assert.deepEqual([v.err, v.status], ['bash: printf: -v: option requires an argument\nprintf: usage: printf [-v var] format [arguments]\n', 2]);
  await run(b, "printf -v greeting 'hi %s' hero");
  assert.equal((await run(b, 'echo "$greeting"')).out, 'hi hero\n');
  assert.equal(await out("printf -- '%s\\n' x"), 'x\n');
});

test('printf %b stops all output at \\c', async () => {
  assert.equal(await out("printf '%b|%s' 'a\\cb' x"), 'a');
});
