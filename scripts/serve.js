/**
 * Serve the game locally the way the artifact host serves it.
 *
 *   node scripts/serve.js PORT [DIR]
 *
 * DIR defaults to the repository; `dist` serves the bundled page that
 * scripts/bundle.js builds, exactly as it is published.
 *
 * Listens on 127.0.0.1 only. index.html is page content without a document
 * skeleton (the host adds one at publish time), so it is served wrapped in the
 * same skeleton; every other file in the repository is served as it is. Paths
 * that leave the repository are refused.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST = '127.0.0.1';
const PAGE = 'index.html';

/** The document the artifact host wraps around the page at publish time. */
export const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Errors that mean "there is no file to serve here", answered with a status instead of a crash.
const MISSING = { ENOENT: 404, ENOTDIR: 404, EISDIR: 404, EACCES: 403 };

/**
 * The page as the host publishes it.
 *
 * @param {string} html The content of index.html.
 * @returns {string} A full HTML document.
 */
export function wrapPage(html) {
  return SKELETON + html;
}

/**
 * The media type for a file name.
 *
 * @param {string} path A file path.
 * @returns {string} The Content-Type value.
 */
export function contentType(path) {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * The file a URL path names inside the root, or null when the path is
 * malformed or would leave the root.
 *
 * @param {string} root Absolute path of the directory being served.
 * @param {string} urlPath The path part of the request URL.
 * @returns {string|null} An absolute file path, or null.
 */
export function resolveInside(root, urlPath) {
  let decoded = null;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
  }
  if (decoded === null || decoded.includes('\0')) return null;
  const file = resolve(root, `.${decoded === '/' ? `/${PAGE}` : decoded}`);
  return file.startsWith(`${root}${sep}`) ? file : null;
}

async function respond(root, req, res) {
  const file = resolveInside(root, new URL(req.url, `http://${HOST}`).pathname);
  if (!file) {
    res.writeHead(403).end('Forbidden\n');
    return;
  }
  let body = null;
  try {
    body = await readFile(file);
  } catch (error) {
    if (!(error.code in MISSING)) throw error;
    res.writeHead(MISSING[error.code]).end(`${error.code}\n`);
    return;
  }
  if (file === join(root, PAGE)) body = wrapPage(String(body));
  res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' }).end(body);
}

/**
 * Start serving a directory on 127.0.0.1.
 *
 * @param {{root: string, port: number}} opts The directory and the port (0 picks a free one).
 * @returns {Promise<{server: import('node:http').Server, url: string}>} The server and its base URL.
 */
export function startServer({ root, port }) {
  const base = resolve(root);
  const server = createServer((req, res) => respond(base, req, res));
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, HOST, () => done({ server, url: `http://${HOST}:${server.address().port}` }));
  });
}

function parsePort(text) {
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`usage: node scripts/serve.js PORT [DIR] (PORT 1 to 65535), got ${text}`);
  return port;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = resolve(import.meta.dirname, '..');
  const root = resolve(repo, process.argv[3] ?? '.');
  const { url } = await startServer({ root, port: parsePort(process.argv[2]) });
  console.log(`Shellcraft at ${url}/  (Ctrl+C stops it)`);
}
