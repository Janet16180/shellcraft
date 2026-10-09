import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputScript, splitOutput, masked, unorderedStreams } from '../../difftest/protocol.js';

const RS = '\u001e';

test('the input reads ~/.bashrc and replays cds before the first marker, hidden from history', () => {
  const text = inputScript(['ls', 'pwd'], { cds: ['/tmp'] });
  const lines = text.split('\n');
  assert.equal(lines[0], ' if [ -r ~/.bashrc ]; then . ~/.bashrc; fi');
  assert.equal(lines[1], " cd '/tmp'");
  assert.ok(lines.filter(l => !['ls', 'pwd', ''].includes(l)).every(l => l.startsWith(' ')));
  assert.ok(lines.includes('ls') && lines.includes('pwd'));
});

test('each line keeps the previous status for $?', () => {
  assert.match(inputScript(['false', 'echo $?'], { cds: [] }), /\(exit "\$__st"\)\necho \$\?/);
});

test('each line is stamped with the container clock when it starts and ends', () => {
  const text = inputScript(['ls'], { cds: [] });
  assert.ok(text.includes(`printf '${RS}B0 %(%s)T${RS}' -1`));
  assert.ok(text.includes(`printf '${RS}E%d %(%s)T${RS}' "$__st" -1`));
});

test('output splits back into one stdout, stderr, status and clock per line', () => {
  const stdout = `noise${RS}B0 100${RS}a\n${RS}E0 101${RS}${RS}B1 101${RS}${RS}E2 102${RS}`;
  const stderr = `job control noise\n${RS}B0${RS}${RS}B1${RS}oops\n${RS}Z${RS}exit\n`;
  assert.deepEqual(splitOutput(stdout, stderr, 2), [
    { out: 'a\n', err: '', status: 0, started: 100, ended: 101 },
    { out: '', err: 'oops\n', status: 2, started: 101, ended: 102 },
  ]);
});

test('a line whose end marker never came has a null status', () => {
  assert.equal(splitOutput(`${RS}B0 5${RS}x`, '', 1)[0].status, null);
});

test('masks replace what differs by nature, like PIDs, on both sides before they are compared', () => {
  const masks = ['(?<=^\\[\\d+\\] )\\d+$'];
  assert.equal(masked('[1] 4242\n[1]+  Done                    sleep 1\n', masks), '[1] PID\n[1]+  Done                    sleep 1\n');
  assert.equal(masked('same\n', []), 'same\n');
});

test('unordered directory streams preserve status and leave other streams exact', () => {
  const r = { out: 'z\na\n', err: 'z\na\n', status: 1 };
  assert.deepEqual(unorderedStreams(r, ['err']), { out: 'z\na\n', err: 'a\nz\n', status: 1 });
  assert.deepEqual(r, { out: 'z\na\n', err: 'z\na\n', status: 1 });
  assert.equal(unorderedStreams(null, ['out']), null);
});

test('unordered streams still distinguish missing lines, duplicates, and final newlines', () => {
  const normal = out => unorderedStreams({ out, err: '', status: 0 }, ['out']);
  assert.deepEqual(normal('b\na\na\n'), normal('a\nb\na\n'));
  assert.notDeepEqual(normal('a\na\nb\n'), normal('a\nb\n'));
  assert.notDeepEqual(normal('a\nb\n'), normal('a\nc\n'));
  assert.notDeepEqual(normal('a\nb\n'), normal('a\nb'));
  assert.notDeepEqual(normal(''), normal('\n'));
});
