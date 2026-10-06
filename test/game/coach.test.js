import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dir, file } from '../../src/backend/spec.js';
import { makeContext } from '../../src/game/checks.js';
import { coachNote } from '../../src/game/coach.js';
import { HOME, observation, record } from '../helpers/records.js';

const FOREST = `${HOME}/forest`;

function world() {
  const bin = Object.fromEntries(['cat', 'clear', 'cp', 'ls', 'mv', 'pwd', 'rm', 'whoami'].map(name => [name, file('', { mode: 0o755 })]));
  return dir({
    usr: dir({ bin: dir(bin) }),
    home: dir({
      hero: dir({
        'readme.txt': file('Welcome.\n'),
        forest: dir({ cave: dir({ deep: dir({ 'ancient_key.txt': file('key\n') }) }) }),
      }),
    }),
  });
}

const note = (...commands) => coachNote(makeContext({ commands, before: observation({ tree: world() }), obs: observation({ tree: world() }) }));
const failed = (name, args, fields = {}) => record(name, args, { status: 1, ...fields });
const notFound = (name, args = []) => record(name, args, { status: 127 });

test('a missing space after the command is pointed out', () => {
  assert.equal(note(notFound('cdforest')), 'Put a space between the command and its argument: cd forest');
  assert.equal(note(notFound('cd..')), 'Put a space between the command and its argument: cd ..');
  assert.equal(note(notFound('catreadme.txt')), 'Put a space between the command and its argument: cat readme.txt');
});

test('a missing space before an option is pointed out', () => {
  assert.equal(note(notFound('ls-l')), 'Put a space before the option: ls -l');
  assert.equal(note(notFound('ls-la', ['forest'])), 'Put a space before the option: ls -la forest');
});

test('an unknown word that only starts like a command gets no note', () => {
  assert.equal(note(notFound('catalog')), null);
  assert.equal(note(notFound('lsblk')), null);
});

test('a command typed in capitals is pointed to its lowercase name', () => {
  assert.equal(note(notFound('WHOAMI')), 'Commands are case-sensitive. Try whoami');
  assert.equal(note(notFound('CD', ['forest'])), 'Commands are case-sensitive. Try cd forest');
  assert.equal(note(notFound('Ls')), 'Commands are case-sensitive. Try ls');
});

test('Windows commands are pointed to their Linux names', () => {
  assert.equal(note(notFound('cls')), 'cls is the Windows command. On Linux, use clear.');
  assert.equal(note(notFound('del', ['x'])), 'del is the Windows command. On Linux, use rm.');
  assert.equal(note(notFound('copy')), 'copy is the Windows command. On Linux, use cp.');
  assert.equal(note(notFound('move')), 'move is the Windows command. On Linux, use mv.');
  assert.equal(note(notFound('ren')), 'ren is the Windows command. On Linux, rename with mv.');
  assert.equal(note(notFound('ipconfig')), 'ipconfig is the Windows command. On Linux, try ip addr (not simulated here).');
});

test('a name with the wrong case is pointed to the real one', () => {
  assert.equal(note(failed('cd', ['Forest'])), 'Names are case-sensitive too: the door is forest.');
  assert.equal(note(failed('cat', ['README.txt'])), 'Names are case-sensitive too: the file is readme.txt.');
  assert.equal(note(failed('cd', ['Forest/cave'])), 'Names are case-sensitive too: the door is forest.');
});

test('a missing extension is pointed out', () => {
  assert.equal(note(failed('cat', ['readme'])), 'The file is readme.txt: .txt is part of its name.');
});

test('reading a directory explains doors and files', () => {
  assert.equal(note(failed('cat', ['forest'])), 'forest is a directory (a door). cat reads files. ls forest shows what is inside; cd forest walks in.');
});

test('a name split by an unquoted space is explained', () => {
  const r = failed('cat', ['ancient', 'key.txt'], { cwd: `${FOREST}/cave/deep` });
  assert.equal(note(r), 'Spaces split a line into words, so cat saw two names: ancient and key.txt. The name uses an underscore: ancient_key.txt.');
});

test('a long option written with one dash is explained', () => {
  const r = record('ls', ['-help'], { status: 2 });
  assert.equal(note(r), 'For most commands, one dash starts short options, so -help means -h -e -l -p. Long options take two dashes: --help.');
});

test('repeating the directory you are already in is explained', () => {
  const r = failed('cd', ['forest/cave/deep'], { cwd: FOREST });
  assert.equal(note(r), 'You are already in forest (the prompt shows ~/forest). From here the path is cave/deep.');
});

test('naming the directory you are already in, with nothing after it, gets only the first sentence', () => {
  const r = failed('cd', ['forest/'], { cwd: FOREST });
  assert.equal(note(r), 'You are already in forest (the prompt shows ~/forest).');
});

test('a path from the root that was meant from home is explained', () => {
  assert.equal(note(failed('cd', ['/forest'])), 'A path that starts with / starts at the root, not at your home. Your forest is /home/hero/forest, or ~/forest.');
  assert.equal(note(failed('cd', ['/forest/cave/deep'])), 'A path that starts with / starts at the root, not at your home. Your forest/cave/deep is /home/hero/forest/cave/deep, or ~/forest/cave/deep.');
});

test('the first command of the line with a note wins', () => {
  assert.equal(note(record('pwd'), notFound('cls'), failed('cat', ['readme'])), 'cls is the Windows command. On Linux, use clear.');
});

test('correct lines get no note', () => {
  const lines = [
    [record('cd', ['forest'])],
    [record('cat', ['readme.txt'])],
    [record('ls', ['-la'])],
    [record('ls', ['--help'])],
    [record('cd', ['cave/deep'], { cwd: FOREST })],
    [record('cd', ['/home/hero/forest'])],
  ];
  for (const commands of lines) assert.equal(note(...commands), null, commands[0].args.join(' '));
});

test('a name like an object property gets no note and no error', () => {
  for (const name of ['toString', 'constructor', '__proto__', 'constructor/x']) {
    assert.equal(note(failed('cat', [name])), null, name);
    assert.equal(note(notFound(name)), null, name);
  }
});

test('a plain mistake the coach does not know gets no note', () => {
  assert.equal(note(failed('cd', ['forrest'])), null);
  assert.equal(note(notFound('sl')), null);
});
