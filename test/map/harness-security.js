import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from '../../scripts/serve.js';
import { browserOptions } from '../../scripts/browser.js';

test('map preview ignores unknown and prototype case names without creating HTML', async () => {
  const { server, url } = await startServer({ root: resolve(import.meta.dirname, '../..'), port: 0 });
  let browser;
  try {
    browser = await chromium.launch(browserOptions());
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const names = ['constructor', '__proto__', '<img src=x onerror=alert(1)>', 'cottage'];
    await page.goto(`${url}/test/map/harness.html?only=${encodeURIComponent(names.join(','))}`);
    assert.equal(await page.locator('#cases figure').count(), 1);
    assert.match(await page.locator('#cases figcaption').textContent(), /^cottage: /);
    assert.equal(await page.locator('#cases img').count(), 0);
    assert.deepEqual(errors, []);
    await page.goto(`${url}/test/map/harness.html?only=constructor,__proto__`);
    assert.equal(await page.locator('#cases figure').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
