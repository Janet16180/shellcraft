/* global document, window, getComputedStyle */
/**
 * Screenshots of the real game for visual review (not part of npm test).
 *
 *   node test/ui/shots.js OUT_DIR
 *
 * Serves the worktree with scripts/serve.js on a free 127.0.0.1 port (it wraps
 * index.html in the artifact host's skeleton, so the shots match production).
 * At 1400, 900 and 360 px wide it plays chapters 1 and 2 with their `solve`
 * lines, beats each boss with the third hint, and walks down into the dungeon.
 * It also shoots the title, a tall window, the touch keys, the intro at 1400
 * and 360, and the intro as still frames with reduced motion. It reports page
 * errors, horizontal overflow, plain `ls` lines that wrap, an input squeezed
 * by a long prompt, a terminal that scrolls sideways, cards that open
 * scrolled, and a page that scrolls when the app should fit the window.
 * Stops the server and the browser it starts.
 */

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from '../../scripts/serve.js';
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
  const errors = [];
  page.on('pageerror', error => errors.push(`${width}px: ${error}`));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) errors.push(`${width}px: ${msg.text()}`); });
  // The artifact host supplies the tab icon, so a local /favicon.ico 404 is expected.
  page.on('response', res => { if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) errors.push(`${width}px: ${res.status()} ${res.url()}`); });
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
  return page.locator('#out .ln').last().evaluate(line => {
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

async function main() {
  const [outArg] = process.argv.slice(2);
  if (!outArg) throw new Error('usage: node test/ui/shots.js OUT_DIR');
  const out = resolve(outArg);
  await mkdir(out, { recursive: true });
  const { server, url: base } = await startServer({ root: ROOT, port: 0 });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const errors = [];
  try {
    errors.push(...await titleTallTouch(browser, base, out));
    errors.push(...await fitProblems(browser, base, out, 1400, 900));
    errors.push(...await fitProblems(browser, base, out, 900, 700));
    for (const width of [1400, 900, 360]) errors.push(...await gameShots(browser, base, out, width));
    errors.push(...await introShots(browser, base, out, 1400, false));
    errors.push(...await introShots(browser, base, out, 360, false));
    errors.push(...await introShots(browser, base, out, 900, true));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(errors.length ? `problems:\n${errors.join('\n')}` : 'no problems found');
}

await main();
