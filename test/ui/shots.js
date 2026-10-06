/* global document */
/**
 * Screenshots of the page for visual review (not part of npm test).
 *
 *   node test/ui/shots.js OUT_DIR [--stub]
 *
 * Serves the worktree with python's http.server on a free 127.0.0.1 port and
 * wraps index.html in the skeleton the artifact host adds at publish time, so
 * the shots match production. --stub swaps src/main.js for the stand-in
 * session and map in test/ui/fixtures. Stops the server and browser it starts.
 */

import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '../..');
const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';

function serve() {
  const server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'], { cwd: ROOT });
  return new Promise((done, fail) => {
    server.stdout.on('data', data => {
      const port = /port (\d+)/.exec(String(data))?.[1];
      if (port) done({ server, base: `http://127.0.0.1:${port}` });
    });
    server.on('error', fail);
  });
}

async function openPage(browser, base, { width, height = 900, stub, reduced = false, query = '' }) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const index = await readFile(join(ROOT, 'index.html'), 'utf8');
  await page.route(/\/index\.html(\?.*)?$/, route => route.fulfill({ contentType: 'text/html', body: SKELETON + index }));
  if (stub) await page.route(/\/src\/main\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: "import '../test/ui/fixtures/dev-main.js';" }));
  await page.goto(`${base}/index.html${query}`);
  await page.waitForSelector('#goBtn');
  await page.evaluate(() => document.fonts.ready);
  return { page, context, errors };
}

async function type(page, line) {
  await page.fill('#cmd', line);
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(250);
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function introShots(browser, base, out, width, reduced) {
  const { page, context, errors } = await openPage(browser, base, { width, stub: true, reduced });
  await page.click('#goBtn');
  const steps = await page.$$eval('#introDots li', items => items.length);
  for (let i = 0; i < steps; i += 1) {
    await page.waitForTimeout(reduced ? 300 : 2600);
    await page.screenshot({ path: join(out, `intro-${width}${reduced ? '-still' : ''}-${String(i + 1).padStart(2, '0')}.png`), fullPage: false });
    if (i < steps - 1) await page.click('#introNext');
  }
  await page.click('#introNext');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `yourturn-${width}.png`) });
  await context.close();
  return errors;
}

async function gameShots(browser, base, out, width) {
  const { page, context, errors } = await openPage(browser, base, { width, stub: true, query: '?seen' });
  await page.click('#goBtn');
  for (const line of ['whoami', 'ls', 'cd forest', 'ls -l', 'cat mushroom.txt', 'nosuchcmd', 'cd ..']) await type(page, line);
  await page.click('#hintBtn');
  await page.click('#hintBtn');
  await type(page, 'hint');
  await type(page, 'ouch');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `game-${width}.png`), fullPage: true });
  const wide = await overflow(page);
  await page.click('#tabbtn-spells');
  await page.screenshot({ path: join(out, `spells-${width}.png`), fullPage: true });
  await page.click('#tabbtn-levels');
  await page.screenshot({ path: join(out, `chapters-${width}.png`), fullPage: true });
  await page.click('#tabbtn-quest');
  await type(page, 'boss');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `boss-${width}.png`) });
  await page.click('#bossGo');
  await page.screenshot({ path: join(out, `bossroom-${width}.png`), fullPage: true });
  await type(page, 'win');
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, `debrief-${width}.png`) });
  await context.close();
  return [...errors, ...(wide > 0 ? [`horizontal overflow of ${wide}px at ${width}`] : [])];
}

async function touchShot(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const index = await readFile(join(ROOT, 'index.html'), 'utf8');
  await page.route(/\/index\.html(\?.*)?$/, route => route.fulfill({ contentType: 'text/html', body: SKELETON + index }));
  await page.route(/\/src\/main\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: "import '../test/ui/fixtures/dev-main.js';" }));
  await page.goto(`${base}/index.html?seen`);
  await page.click('#goBtn');
  await page.locator('#term').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'touch-360.png') });
  await context.close();
  return errors;
}

async function main() {
  const [outArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!outArg) throw new Error('usage: node test/ui/shots.js OUT_DIR [--stub]');
  const out = resolve(outArg);
  await mkdir(out, { recursive: true });
  const { server, base } = await serve();
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const errors = [];
  try {
    const { page, context } = await openPage(browser, base, { width: 1400, stub: true });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, 'title-1400.png') });
    await context.close();
    errors.push(...await touchShot(browser, base, out));
    for (const width of [1400, 900, 360]) errors.push(...await gameShots(browser, base, out, width));
    errors.push(...await introShots(browser, base, out, 1400, false));
    errors.push(...await introShots(browser, base, out, 360, false));
    errors.push(...await introShots(browser, base, out, 900, true));
    console.log(errors.length ? `problems:\n${errors.join('\n')}` : 'no page errors, no horizontal overflow');
  } finally {
    await browser.close();
    server.kill();
  }
}

await main();
