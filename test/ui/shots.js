/* global document */
/**
 * Screenshots of the page for visual review (not part of npm test).
 *
 *   node test/ui/shots.js OUT_DIR [--fixtures]
 *
 * Serves the worktree with python's http.server on a free 127.0.0.1 port and
 * wraps index.html in the skeleton the artifact host adds at publish time, so
 * the shots match production. --fixtures swaps src/main.js for
 * test/ui/fixtures/dev-main.js (the engine's fixture chapters). Plays a quest,
 * a boss room and the adventure log at 1400, 900 and 360 px wide, the intro at
 * 1400 and 360, and the intro as still frames with reduced motion. Stops the
 * server and the browser it starts.
 */

import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '../..');
const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';
const FIXTURES = process.argv.includes('--fixtures');

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

async function openPage(browser, base, { width, height = 900, reduced = false, touch = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`${width}px: ${error}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`${width}px: ${msg.text()}`); });
  const index = await readFile(join(ROOT, 'index.html'), 'utf8');
  await page.route(/\/index\.html$/, route => route.fulfill({ contentType: 'text/html', body: SKELETON + index }));
  if (FIXTURES) await page.route(/\/src\/main\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: "import '../test/ui/fixtures/dev-main.js';" }));
  await page.goto(`${base}/index.html`);
  await page.waitForSelector('#goBtn');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return { page, context, errors };
}

async function startSkippingIntro(page) {
  await page.click('#goBtn');
  await page.click('#introSkip');
}

async function type(page, line, wait = 400) {
  await page.fill('#cmd', line);
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(wait);
}

async function lastLine(page) {
  return (await page.locator('#out .ln').last().textContent()).trim();
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function shot(page, out, name, fullPage = false) {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage });
}

async function playChapter(page, out, width) {
  for (const line of ['whoami', 'ls', 'cd forest', 'ls -l', 'cd ..', 'cat readme.txt', 'nosuchcmd', 'hint']) await type(page, line);
  await page.click('#hintBtn');
  await type(page, 'rm -r ~', 900);
  await shot(page, out, `game-${width}`, true);
  await page.click('#tabbtn-spells');
  await shot(page, out, `spells-${width}`, true);
  await page.click('#tabbtn-levels');
  await shot(page, out, `chapters-${width}`, true);
  await page.click('#tabbtn-quest');
  await type(page, 'pwd');
  await type(page, 'cat letter.txt', 1800);
  await shot(page, out, `boss-${width}`);
  await page.click('#bossGo');
  await type(page, 'cat sign.txt');
  await shot(page, out, `bossroom-${width}`, true);
  await type(page, await lastLine(page), 2200);
  await shot(page, out, `debrief-${width}`);
}

async function gameShots(browser, base, out, width) {
  const { page, context, errors } = await openPage(browser, base, { width });
  await startSkippingIntro(page);
  await playChapter(page, out, width);
  await page.click('#nextBtn');
  await type(page, 'cd forest', 1500);
  await shot(page, out, `forest-${width}`);
  await type(page, 'cd /', 3500);
  await shot(page, out, `dungeon-${width}`);
  await page.click('#roster summary');
  await page.locator('.mapwrap').screenshot({ path: join(out, `mapkey-${width}.png`) });
  const wide = await overflow(page);
  await context.close();
  return [...errors, ...(wide > 0 ? [`horizontal overflow of ${wide}px at ${width}`] : [])];
}

async function introShots(browser, base, out, width, reduced) {
  const { page, context, errors } = await openPage(browser, base, { width, reduced });
  await page.click('#goBtn');
  const steps = await page.$$eval('#introDots li', items => items.length);
  const tag = `intro-${width}${reduced ? '-still' : ''}`;
  for (let i = 0; i < steps; i += 1) {
    await page.waitForTimeout(reduced ? 400 : 3000);
    await shot(page, out, `${tag}-${String(i + 1).padStart(2, '0')}`);
    await page.click('#introNext');
  }
  await page.waitForTimeout(400);
  await shot(page, out, `yourturn-${width}${reduced ? '-still' : ''}`);
  await context.close();
  return errors;
}

async function titleAndTouch(browser, base, out) {
  const title = await openPage(browser, base, { width: 1400 });
  await shot(title.page, out, 'title-1400');
  await title.context.close();
  const touch = await openPage(browser, base, { width: 360, height: 740, touch: true });
  await startSkippingIntro(touch.page);
  await touch.page.locator('#term').scrollIntoViewIfNeeded();
  await shot(touch.page, out, 'touch-360');
  await touch.context.close();
  return [...title.errors, ...touch.errors];
}

async function main() {
  const [outArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!outArg) throw new Error('usage: node test/ui/shots.js OUT_DIR [--fixtures]');
  const out = resolve(outArg);
  await mkdir(out, { recursive: true });
  const { server, base } = await serve();
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const errors = [];
  try {
    errors.push(...await titleAndTouch(browser, base, out));
    for (const width of [1400, 900, 360]) errors.push(...await gameShots(browser, base, out, width));
    errors.push(...await introShots(browser, base, out, 1400, false));
    errors.push(...await introShots(browser, base, out, 360, false));
    errors.push(...await introShots(browser, base, out, 900, true));
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(errors.length ? `problems:\n${errors.join('\n')}` : 'no page errors, no horizontal overflow');
}

await main();
