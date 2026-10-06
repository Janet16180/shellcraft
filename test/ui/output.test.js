import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, displayPath, promptHTML, chunkLine } from '../../src/ui/output.js';

const HERO = { user: 'hero', host: 'kernelia', home: '/home/hero' };

test('escaping turns markup characters into entities', () => {
  assert.equal(esc(`<b class="x">Tom & 'Jerry'</b>`), '&lt;b class=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/b&gt;');
});

test('the home directory shows as a tilde, like bash does in the prompt', () => {
  assert.equal(displayPath('/home/hero', '/home/hero'), '~');
  assert.equal(displayPath('/home/hero/forest/cave', '/home/hero'), '~/forest/cave');
});

test('paths outside home, or that only share a prefix with it, stay absolute', () => {
  assert.equal(displayPath('/', '/home/hero'), '/');
  assert.equal(displayPath('/etc', '/home/hero'), '/etc');
  assert.equal(displayPath('/home/heroic', '/home/hero'), '/home/heroic');
});

test('the prompt is user@host:dir$ with the user and the directory coloured', () => {
  assert.equal(
    promptHTML({ ...HERO, cwd: '/home/hero/forest' }),
    '<span class="pu">hero@kernelia</span>:<span class="pp">~/forest</span>$ ',
  );
});

test('root gets a hash instead of a dollar sign', () => {
  assert.match(promptHTML({ user: 'root', host: 'kernelia', home: '/root', cwd: '/root' }), /<\/span># $/);
});

test('the prompt escapes a directory name that contains markup', () => {
  assert.match(promptHTML({ ...HERO, cwd: '/home/hero/<i>' }), /~\/&lt;i&gt;/);
});

test('standard output loses its final newline and is escaped', () => {
  assert.deepEqual(chunkLine({ stream: 'out', text: 'forest  <readme>.txt\n' }), { cls: 'ln', html: 'forest  &lt;readme&gt;.txt' });
});

test('pre-coloured output is used as given, without its final newline', () => {
  const html = '<span class="c-dir">forest</span>\n';
  assert.deepEqual(chunkLine({ stream: 'out', text: 'forest\n', html }), { cls: 'ln', html: '<span class="c-dir">forest</span>' });
});

test('a lone newline is an empty line that still takes space, as echo prints one', () => {
  assert.deepEqual(chunkLine({ stream: 'out', text: '\n' }), { cls: 'ln', html: '' });
});

test('an empty chunk prints nothing', () => {
  assert.equal(chunkLine({ stream: 'out', text: '' }), null);
});

test('standard error is marked as an error line', () => {
  assert.equal(chunkLine({ stream: 'err', text: 'ls: cannot access x\n' }).cls, 'ln err');
});

test('a note is the game speaking: marked, prefixed and coloured by its tone', () => {
  assert.deepEqual(chunkLine({ stream: 'note', text: 'A real pager opens here.' }), { cls: 'ln note', html: '» A real pager opens here.' });
  assert.equal(chunkLine({ stream: 'note', text: 'Ha!', tone: 'daemon' }).cls, 'ln note tone-daemon');
});
