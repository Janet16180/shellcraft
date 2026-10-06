import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { resolve } from 'node:path';
import { wrapPage, contentType, resolveInside, startServer } from '../../scripts/serve.js';

const ROOT = resolve(import.meta.dirname, '../..');

function request(url, path) {
  const { hostname, port } = new URL(url);
  return new Promise((done, fail) => {
    get({ hostname, port, path }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', fail);
  });
}

test('the page is wrapped in the host skeleton: doctype, charset, viewport, then the content', () => {
  const page = wrapPage('<title>Shellcraft</title>');
  assert.match(page, /^<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">/);
  assert.match(page, /\[hidden\]:not\(\[hidden=until-found i\]\)\{display:none!important\}/);
  assert.ok(page.endsWith('<body><title>Shellcraft</title>'));
});

test('scripts, styles and pages get their media types', () => {
  assert.equal(contentType('src/main.js'), 'text/javascript; charset=utf-8');
  assert.equal(contentType('styles/game.css'), 'text/css; charset=utf-8');
  assert.equal(contentType('test/map/harness.html'), 'text/html; charset=utf-8');
  assert.equal(contentType('shot.PNG'), 'image/png');
  assert.equal(contentType('notes.weird'), 'application/octet-stream');
});

test('the site root serves index.html', () => {
  assert.equal(resolveInside('/srv/game', '/'), '/srv/game/index.html');
  assert.equal(resolveInside('/srv/game', '/src/main.js'), '/srv/game/src/main.js');
});

test('paths that climb out of the root, plainly or encoded, are refused', () => {
  assert.equal(resolveInside('/srv/game', '/../etc/passwd'), null);
  assert.equal(resolveInside('/srv/game', '/src/%2e%2e/%2e%2e/etc/passwd'), null);
  assert.equal(resolveInside('/srv/game', '/a%00b'), null);
  assert.equal(resolveInside('/srv/game', '/%E0%A4%A'), null);
});

test('the server wraps index.html, serves other files raw, and refuses the rest', async () => {
  const { server, url } = await startServer({ root: ROOT, port: 0 });
  try {
    const page = await request(url, '/');
    assert.equal(page.status, 200);
    assert.equal(page.type, 'text/html; charset=utf-8');
    assert.match(page.body, /^<!doctype html>.*<body><title>Shellcraft<\/title>/s);
    const script = await request(url, '/src/main.js');
    assert.equal(script.type, 'text/javascript; charset=utf-8');
    assert.match(script.body, /^\/\*\*/);
    assert.equal((await request(url, '/src/..%2f..%2f..%2f..%2fetc%2fpasswd')).status, 403);
    assert.match((await request(url, '/../package.json')).body, /"name": "shellcraft"/, 'the URL parser keeps a plain .. inside the root');
    assert.equal((await request(url, '/no/such/file.js')).status, 404);
    assert.equal((await request(url, '/src')).status, 404);
  } finally {
    server.close();
  }
});

test('the server listens on 127.0.0.1 only', async () => {
  const { server, url } = await startServer({ root: ROOT, port: 0 });
  const { address } = server.address();
  server.close();
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(address, '127.0.0.1');
});
