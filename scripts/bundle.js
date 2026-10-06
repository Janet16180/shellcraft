/**
 * Build the page the artifact host publishes: index.html with every local
 * stylesheet inlined and the ES modules bundled into one classic script, so
 * the published page is a single self-contained file. Development keeps the
 * separate modules and needs no build step.
 *
 *   node scripts/bundle.js        writes dist/index.html
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const ENTRY = 'src/main.js';
const OUT = join(ROOT, 'dist', 'index.html');

const LOCAL_STYLE = /<link rel="stylesheet" href="(?!https?:)([^"]+)">/g;
const MODULE_SCRIPT = /<script type="module" src="[^"]+"><\/script>/g;

function styleBlock(path, css) {
  if (/<\/style/i.test(css)) throw new Error(`${path} contains </style, which would end the inlined style element`);
  return `<style>\n${css}</style>`;
}

/**
 * Inline a page's local stylesheets and replace its module script with an
 * inline classic script.
 *
 * @param {string} html The page content, as index.html holds it.
 * @param {{readStyle: (path: string) => string, script: string}} parts The text
 *   of a stylesheet by its href, and the bundled script.
 * @returns {string} The self-contained page content.
 * @throws {Error} If the page does not have exactly one module script, or a
 *   stylesheet contains `</style`.
 */
export function inlinePage(html, { readStyle, script }) {
  const scripts = html.match(MODULE_SCRIPT) ?? [];
  if (scripts.length !== 1) throw new Error(`the page must have exactly one module script, found ${scripts.length}`);

  // In a script element, "</script" ends the element; "<\/script" means the same in JavaScript.
  const safeScript = script.replaceAll('</script', '<\\/script');
  return html
    .replace(LOCAL_STYLE, (_, path) => styleBlock(path, readStyle(path)))
    .replace(scripts[0], () => `<script>\n${safeScript}\n</script>`);
}

/**
 * Bundle the game into one self-contained page.
 *
 * @returns {Promise<string>} The page content, without the document skeleton the host adds.
 */
export async function bundlePage() {
  const result = await build({
    entryPoints: [join(ROOT, ENTRY)],
    bundle: true,
    format: 'iife',
    target: 'es2023',
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  });
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const styles = new Map();
  for (const [, path] of html.matchAll(LOCAL_STYLE)) styles.set(path, await readFile(join(ROOT, path), 'utf8'));
  return inlinePage(html, { readStyle: path => styles.get(path), script: result.outputFiles[0].text });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const page = await bundlePage();
  await mkdir(join(ROOT, 'dist'), { recursive: true });
  await writeFile(OUT, page);
  console.log(`wrote ${OUT} (${Math.round(page.length / 1024)} KB)`);
}
