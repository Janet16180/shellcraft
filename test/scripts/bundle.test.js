import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { inlinePage, bundlePage } from '../../scripts/bundle.js';

const PAGE = `<title>Shellcraft</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans&display=swap">
<link rel="stylesheet" href="styles/tokens.css">
<link rel="stylesheet" href="styles/game.css">
<div id="app"></div>
<script type="module" src="src/main.js"></script>
`;

const STYLES = { 'styles/tokens.css': ':root { --ink: #000; }\n', 'styles/game.css': 'body { color: var(--ink); }\n' };
const readStyle = path => STYLES[path];

test('local stylesheets are inlined in their order and font links stay', () => {
  const page = inlinePage(PAGE, { readStyle, script: '' });
  assert.ok(page.includes('href="https://fonts.googleapis.com/css2?family=Pixelify+Sans&display=swap"'));
  assert.ok(!page.includes('href="styles/'));
  assert.ok(page.indexOf(':root { --ink: #000; }') < page.indexOf('body { color: var(--ink); }'));
});

test('the module script becomes one inline classic script', () => {
  const page = inlinePage(PAGE, { readStyle, script: 'console.log(1);' });
  assert.ok(!page.includes('type="module"'));
  assert.ok(!page.includes('src="src/main.js"'));
  assert.ok(page.includes('<script>\nconsole.log(1);\n</script>'));
});

test('a closing script tag inside the bundle cannot end the script early', () => {
  const page = inlinePage(PAGE, { readStyle, script: 'const s = "</script><b>";' });
  assert.ok(page.includes('const s = "<\\/script><b>";'));
  assert.equal(page.match(/<\/script>/g).length, 1);
});

test('the title stays first, where the host looks for it', () => {
  assert.ok(inlinePage(PAGE, { readStyle, script: '' }).startsWith('<title>Shellcraft</title>'));
});

test('a page without exactly one module script is refused', () => {
  assert.throws(() => inlinePage('<title>x</title>', { readStyle, script: '' }), /exactly one module script/);
  const twice = `${PAGE}<script type="module" src="src/other.js"></script>`;
  assert.throws(() => inlinePage(twice, { readStyle, script: '' }), /exactly one module script/);
});

test('a stylesheet that would close the style element is refused', () => {
  const broken = path => (path === 'styles/game.css' ? 'a { } </style><b>' : STYLES[path]);
  assert.throws(() => inlinePage(PAGE, { readStyle: broken, script: '' }), /styles\/game\.css.*<\/style/);
});

test('the real game bundles into one page with no file references left', async () => {
  const page = await bundlePage();
  assert.ok(page.startsWith('<title>Shellcraft</title>'));
  assert.doesNotMatch(page, /<link rel="stylesheet" href="styles\//);
  assert.doesNotMatch(page, /<script[^>]*\bsrc=/);
  const scripts = [...page.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map(m => m[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Script(scripts[0]), 'the bundle must compile as a classic script, with no import or export');
  assert.ok(page.includes('createSimBackend'));
  assert.ok(page.includes('--c-ink'));
});
