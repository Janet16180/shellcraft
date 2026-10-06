import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputScript, splitOutput } from '../../difftest/protocol.js';

const RS = '\u001e';

test('the input defines aliases and replays cds before the first marker, hidden from history', () => {
  const text = inputScript(['ls', 'pwd'], { cds: ['/tmp'], aliases: { ll: 'ls -alF' } });
  const lines = text.split('\n');
  assert.equal(lines[0], " alias ll='ls -alF'");
  assert.equal(lines[1], " cd '/tmp'");
  assert.ok(lines.filter(l => !['ls', 'pwd', ''].includes(l)).every(l => l.startsWith(' ')));
  assert.ok(lines.includes('ls') && lines.includes('pwd'));
});

test('each line keeps the previous status for $?', () => {
  assert.match(inputScript(['false', 'echo $?'], { cds: [], aliases: {} }), /\(exit "\$__st"\)\necho \$\?/);
});

test('output splits back into one stdout, stderr and status per line', () => {
  const stdout = `noise${RS}B0${RS}a\n${RS}E0${RS}${RS}B1${RS}${RS}E2${RS}`;
  const stderr = `job control noise\n${RS}B0${RS}${RS}B1${RS}oops\n${RS}Z${RS}exit\n`;
  assert.deepEqual(splitOutput(stdout, stderr, 2), [{ out: 'a\n', err: '', status: 0 }, { out: '', err: 'oops\n', status: 2 }]);
});

test('a line whose end marker never came has a null status', () => {
  assert.equal(splitOutput(`${RS}B0${RS}x`, '', 1)[0].status, null);
});
