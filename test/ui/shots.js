/* global document, window, getComputedStyle, KeyboardEvent */
/**
 * Screenshots of the real game for visual review (not part of npm test).
 *
 *   node test/ui/shots.js OUT_DIR
 *   node test/ui/shots.js OUT_DIR --published
 *
 * Serves the worktree with scripts/serve.js on a free 127.0.0.1 port (it wraps
 * index.html in the artifact host's skeleton, so the shots match production).
 * At 1400, 900 and 360 px wide it plays chapters 1 and 2 with their `solve`
 * lines, beats each boss with the third hint, and walks down into the dungeon.
 * It also shoots the title, a tall window, the touch keys, the intro at 1400
 * and 360, and the intro as still frames with reduced motion. It reports page
 * errors, horizontal overflow, plain `ls` lines that wrap, an input squeezed
 * by a long prompt, a terminal that scrolls sideways, a boss divider printed
 * after the new prompt, cards that open scrolled, a page that scrolls when
 * the app should fit the window, and session calls that overlap when the
 * player clicks everything at once (the session raises on overlap).
 *
 * With --published it checks the build the artifact host publishes instead:
 * it bundles the page with scripts/bundle.js into OUT_DIR/published, serves
 * that, and loads it at 1400 and 360 inside an iframe sandboxed to scripts
 * only, which gives it an opaque origin as on the host. There it reports any
 * page or console error and a title card that never appears, then starts,
 * skips the intro, types whoami and checks the first task completes.
 *
 * Stops the server and the browser it starts.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, errors as playwrightErrors } from 'playwright-core';
import { startServer } from '../../scripts/serve.js';
import { bundlePage } from '../../scripts/bundle.js';
import chapters from '../../src/game/chapters/index.js';

const ROOT = resolve(import.meta.dirname, '../..');
const PLAYABLE = chapters.filter(chapter => !chapter.soon);

async function openPage(browser, base, { width, height = 900, reduced = false, touch = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await context.newPage();
  const errors = watchErrors(page, `${width}px`);
  await page.goto(`${base}/index.html`);
  await page.waitForSelector('#goBtn');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return { page, context, errors };
}

// Errors from the page and from any frame in it, collected under a tag.
function watchErrors(page, tag) {
  const errors = [];
  page.on('pageerror', error => errors.push(`${tag}: ${error}`));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) errors.push(`${tag}: ${msg.text()}`); });
  // The artifact host supplies the tab icon, so a local /favicon.ico 404 is expected.
  page.on('response', res => { if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) errors.push(`${tag}: ${res.status()} ${res.url()}`); });
  return errors;
}

async function appears(locator) {
  let shown = true;
  try {
    await locator.waitFor({ timeout: 10000 });
  } catch (error) {
    if (!(error instanceof playwrightErrors.TimeoutError)) throw error;
    shown = false;
  }
  return shown;
}

async function startSkippingIntro(page) {
  await page.click('#goBtn');
  await page.click('#introSkip');
}

async function type(page, line, wait = 500) {
  await page.fill('#cmd', line);
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(wait);
}

// A tab in a solve line means pressing Tab there (AUTHORING.md).
async function solveLine(page, line) {
  const [typed, rest] = line.split('\t');
  if (rest === undefined) {
    await type(page, line);
    return;
  }
  await page.fill('#cmd', typed);
  await page.press('#cmd', 'Tab');
  await page.waitForTimeout(200);
  await type(page, (await page.inputValue('#cmd')) + rest);
}

async function shot(page, out, name, fullPage = false) {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage });
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function lsWraps(page) {
  await type(page, 'ls');
  // The line after the echoed command is ls's output; game notes may follow it.
  return page.locator('#out .cmdline').last().evaluate(echo => {
    const line = echo.nextElementSibling;
    const rows = line.textContent.split('\n').length;
    return Math.round(line.getBoundingClientRect().height / parseFloat(getComputedStyle(line).lineHeight)) > rows;
  });
}

const LONG_DIR = '~/a_rather_long_directory_name/another_long_directory/third_level_here/fourth';

// A long working directory must not squeeze the input away or scroll the terminal sideways.
async function longPromptProblems(page, width) {
  await type(page, `mkdir -p ${LONG_DIR}`);
  await type(page, `cd ${LONG_DIR}`);
  const { input, glyph, screenWide } = await page.evaluate(() => {
    const screen = document.getElementById('screen');
    const probe = document.createElement('span');
    probe.textContent = '0123456789';
    screen.append(probe);
    const glyphWidth = probe.getBoundingClientRect().width / 10;
    probe.remove();
    return { input: document.getElementById('cmd').getBoundingClientRect().width, glyph: glyphWidth, screenWide: screen.scrollWidth - screen.clientWidth };
  });
  const problems = [];
  if (input < 8 * glyph) problems.push(`${width}px: with a long prompt the input is ${Math.round(input)}px wide`);
  if (screenWide > 0) problems.push(`${width}px: the terminal scrolls sideways by ${screenWide}px`);
  return problems;
}

// The boss room may move the player (the trapdoor), so its divider must already sit under the
// line that opened it, before any new prompt.
async function dividerProblems(page, width, id) {
  const last = (await page.locator('#out .ln').last().textContent()).trim();
  return last.startsWith('-- Boss room:') ? [] : [`${width}px: ${id}: the boss divider is not the last line before the new prompt ("${last}")`];
}

async function cardTopProblems(page, width, name) {
  const top = await page.locator('#card').evaluate(card => card.scrollTop);
  return top === 0 ? [] : [`${width}px: the ${name} opened scrolled down by ${top}px`];
}

async function beatBoss(page) {
  for (let i = 0; i < 3; i += 1) await type(page, 'hint', 300);
  const note = await page.locator('#out .ln.note').last().textContent();
  await type(page, /Hint 3 of 3[^:]*: (.+)/.exec(note)[1].trim(), 2500);
}

async function playChapter(page, out, width, { id, solve }, problems) {
  for (const [i, line] of solve.entries()) {
    if (i === solve.length - 1) await shot(page, out, `${id}-quest-${width}`, true);
    await solveLine(page, line);
  }
  await page.waitForSelector('#card.boss');
  await page.waitForTimeout(800);
  problems.push(...await dividerProblems(page, width, id));
  await shot(page, out, `${id}-boss-${width}`);
  await page.click('#bossGo');
  await beatBoss(page);
  await page.waitForSelector('#card.log');
  await page.waitForTimeout(800);
  problems.push(...await cardTopProblems(page, width, `${id} adventure log`));
  await shot(page, out, `${id}-debrief-${width}`);
}

async function gameShots(browser, base, out, width) {
  const { page, context, errors } = await openPage(browser, base, { width });
  await startSkippingIntro(page);
  if (await lsWraps(page)) errors.push(`${width}px: plain ls lines wrap`);
  await page.locator('#term').screenshot({ path: join(out, `ls-${width}.png`) });
  await playChapter(page, out, width, PLAYABLE[0], errors);
  await page.click('#nextBtn');
  await playChapter(page, out, width, PLAYABLE[1], errors);
  await page.click('#stayBtn');
  await shot(page, out, `cleared-${width}`, true);
  errors.push(...await longPromptProblems(page, width));
  await page.locator('#term').screenshot({ path: join(out, `longprompt-${width}.png`) });
  for (const line of ['cd', 'cd ..']) await type(page, line, 3500);
  await shot(page, out, `stairs-${width}`);
  await type(page, 'cd /', 3500);
  await shot(page, out, `dungeon-${width}`);
  await page.click('#tabbtn-spells');
  await shot(page, out, `spells-${width}`, true);
  await page.click('#tabbtn-levels');
  await shot(page, out, `chapters-${width}`, true);
  await page.click('#roster summary');
  await page.locator('#roster').scrollIntoViewIfNeeded();
  await page.locator('#roster').screenshot({ path: join(out, `mapkey-${width}.png`) });
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

// On a window that fits the app, many lines of output must scroll inside the terminal, never the page.
async function fitProblems(browser, base, out, width, height) {
  const { page, context, errors } = await openPage(browser, base, { width, height });
  await startSkippingIntro(page);
  for (let i = 0; i < 60; i += 1) await type(page, i % 2 ? 'pwd' : 'ls', 60);
  await type(page, 'cat readme.txt');
  const state = await page.evaluate(() => ({
    scrollY: window.scrollY,
    pageTall: document.documentElement.scrollHeight - window.innerHeight,
    hudTop: document.querySelector('.hud').getBoundingClientRect().top,
    inputBottom: document.getElementById('cmd').getBoundingClientRect().bottom,
    viewport: window.innerHeight,
  }));
  await shot(page, out, `fit-${width}x${height}`);
  await context.close();
  const tag = `${width}x${height}`;
  if (state.scrollY !== 0) errors.push(`${tag}: the page scrolled to ${state.scrollY}`);
  if (state.pageTall !== 0) errors.push(`${tag}: the page is ${state.pageTall}px taller than the window`);
  if (state.hudTop < 0) errors.push(`${tag}: the HUD is off the top`);
  if (state.inputBottom > state.viewport) errors.push(`${tag}: the input is below the window`);
  return errors;
}

// A line, Tab, a hint, the sound button, a chapter restart and a reset in one tick: each must wait
// its turn, or the session raises and the page reports an error.
async function rushProblems(browser, base) {
  const { page, context, errors } = await openPage(browser, base, { width: 1400 });
  await startSkippingIntro(page);
  await page.evaluate(() => {
    const cmd = document.getElementById('cmd');
    const press = key => cmd.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const click = selector => document.querySelector(selector).click();
    cmd.value = 'ls';
    press('Enter');
    cmd.value = 'cat rea';
    press('Tab');
    click('#hintBtn');
    click('#soundBtn');
    click('#levels button[data-ch]');
    click('#resetBtn');
    click('#resetBtn');
    click('#soundBtn');
  });
  await page.waitForTimeout(3000);
  await context.close();
  return errors.map(error => `rush: ${error}`);
}

async function titleTallTouch(browser, base, out) {
  const title = await openPage(browser, base, { width: 1400 });
  await shot(title.page, out, 'title-1400');
  await title.context.close();
  const tall = await openPage(browser, base, { width: 1400, height: 1100 });
  await startSkippingIntro(tall.page);
  for (const line of ['ls', 'cat readme.txt']) await type(tall.page, line);
  await tall.page.locator('.side').evaluate(side => { side.scrollTop = 400; });
  await shot(tall.page, out, 'tall-1400');
  await tall.context.close();
  const touch = await openPage(browser, base, { width: 360, height: 740, touch: true });
  await startSkippingIntro(touch.page);
  await touch.page.locator('#term').scrollIntoViewIfNeeded();
  await shot(touch.page, out, 'touch-360');
  await touch.context.close();
  return [...title.errors, ...tall.errors, ...touch.errors];
}

// The host runs the page in a frame sandboxed to scripts only: an opaque origin, no storage, and
// module scripts from a URL fail CORS. The published page must start and play there.
async function framedProblems(browser, base, out, width) {
  const tag = `published ${width}px`;
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 740 : 900 } });
  const page = await context.newPage();
  const errors = watchErrors(page, tag);
  await page.setContent(`<style>body{margin:0}iframe{display:block;border:0;width:100vw;height:100vh}</style>
    <iframe sandbox="allow-scripts" src="${base}/index.html"></iframe>`);
  const frame = page.frameLocator('iframe');
  if (await appears(frame.locator('#goBtn'))) {
    await frame.locator('#goBtn').click();
    await frame.locator('#introSkip').click();
    await frame.locator('#cmd').fill('whoami');
    await frame.locator('#cmd').press('Enter');
    if (!await appears(frame.locator('.quest-log li:first-child.done'))) errors.push(`${tag}: whoami did not complete the first task`);
  } else {
    errors.push(`${tag}: the title card never appeared`);
  }
  await shot(page, out, `published-${width}`);
  await context.close();
  return errors;
}

async function writePublished(out) {
  const site = join(out, 'published');
  await mkdir(site, { recursive: true });
  await writeFile(join(site, 'index.html'), await bundlePage());
  return site;
}

async function publishedShots(browser, base, out) {
  return [...await framedProblems(browser, base, out, 1400), ...await framedProblems(browser, base, out, 360)];
}

async function gameShotsAll(browser, base, out) {
  return [
    ...await titleTallTouch(browser, base, out),
    ...await rushProblems(browser, base),
    ...await fitProblems(browser, base, out, 1400, 900),
    ...await fitProblems(browser, base, out, 900, 700),
    ...await gameShots(browser, base, out, 1400),
    ...await gameShots(browser, base, out, 900),
    ...await gameShots(browser, base, out, 360),
    ...await introShots(browser, base, out, 1400, false),
    ...await introShots(browser, base, out, 360, false),
    ...await introShots(browser, base, out, 900, true),
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const outArg = args.find(arg => !arg.startsWith('--'));
  if (!outArg) throw new Error('usage: node test/ui/shots.js OUT_DIR [--published]');
  const published = args.includes('--published');
  const out = resolve(outArg);
  await mkdir(out, { recursive: true });
  const root = published ? await writePublished(out) : ROOT;
  const { server, url: base } = await startServer({ root, port: 0 });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const errors = [];
  try {
    errors.push(...await (published ? publishedShots : gameShotsAll)(browser, base, out));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(errors.length ? `problems:\n${errors.join('\n')}` : 'no problems found');
}

await main();
