/* global document, window, getComputedStyle */
/**
 * Screenshots and checks of both page layouts (not part of npm test).
 *
 *   node test/ui/layouts.js OUT_DIR
 *
 * For each window size in SIZES and each layout ('stacked' and 'side') it
 * starts a fresh game, skips the intro, switches the layout with the HUD
 * button, walks to /usr/bin (the room with the most entries) and back home,
 * and shoots the page. It reports page errors, horizontal overflow, a page
 * that scrolls when the app should fit the window, an input line or a quest
 * panel out of view, windows that overlap, a room list that wraps, and a
 * layout that is not remembered after a reload. It also does the first task
 * and restarts the chapter with the HUD button (two clicks), and reports a
 * restart that does not bring back task 1 and the home directory.
 *
 * Stops the server and the browser it starts.
 */

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from '../../scripts/serve.js';

const ROOT = resolve(import.meta.dirname, '../..');
const SIZES = [[1400, 900], [1280, 720], [1536, 864], [1024, 768], [360, 740]];
const LAYOUTS = ['stacked', 'side'];

async function type(page, line) {
  await page.fill('#cmd', line);
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(500);
}

async function setLayout(page, layout) {
  for (let i = 0; i < LAYOUTS.length; i++) {
    if (await page.getAttribute('#app', 'data-layout') === layout) return;
    await page.click('#layoutBtn');
    await page.waitForTimeout(300);
  }
  throw new Error(`could not switch to the ${layout} layout`);
}

// What the page looks like right now, measured in the browser.
function measure() {
  const box = id => document.getElementById(id).getBoundingClientRect();
  const fits = document.body.scrollHeight <= window.innerHeight + 1;
  const fitMode = getComputedStyle(document.body).overflow === 'hidden';
  const inView = r => r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.height > 0;
  const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const picks = document.getElementById('picks');
  const rows = new Set([...picks.children].map(b => Math.round(b.getBoundingClientRect().top)));
  const map = box('map');
  const quest = box('tab-quest');
  const term = box('term');
  return {
    wide: document.documentElement.scrollWidth - window.innerWidth,
    fits, fitMode,
    inputInView: inView(box('cmd')),
    questInView: Math.min(quest.bottom, window.innerHeight) - Math.max(quest.top, 0) > 60,
    mapTermOverlap: overlap(map, term),
    questTermOverlap: overlap(quest, term),
    mapQuestOverlap: overlap(map, quest),
    pickRows: rows.size,
    picks: picks.children.length,
    sizes: { map: [map.width, map.height], quest: [quest.width, quest.height], term: [term.width, term.height] },
  };
}

function problemsOf(tag, m, { wide }) {
  const problems = [];
  if (m.wide > 0) problems.push(`${tag}: horizontal overflow of ${m.wide}px`);
  if (m.fitMode && !m.fits) problems.push(`${tag}: the page scrolls although the app should fit the window`);
  if (wide && !m.inputInView) problems.push(`${tag}: the input line is out of view`);
  if (wide && !m.questInView) problems.push(`${tag}: the quest panel is out of view`);
  if (m.mapTermOverlap || m.questTermOverlap || m.mapQuestOverlap) problems.push(`${tag}: windows overlap`);
  if (m.pickRows > 1) problems.push(`${tag}: the room list takes ${m.pickRows} rows`);
  return problems;
}

async function restartProblems(page, tag) {
  await type(page, 'whoami');
  const before = await page.textContent('#now');
  await page.click('#restartBtn');
  const armed = await page.textContent('#restartBtn');
  await page.click('#restartBtn');
  await page.waitForTimeout(800);
  const after = await page.textContent('#now');
  const title = await page.textContent('#termTitle');
  const problems = [];
  if (!/^Next task 2 /.test(before)) problems.push(`${tag}: whoami did not finish task 1 ("${before}")`);
  if (armed !== 'Click again to restart') problems.push(`${tag}: the first click on Restart chapter shows "${armed}"`);
  if (!/^Next task 1 /.test(after)) problems.push(`${tag}: after a restart the task strip says "${after}"`);
  if (!title.endsWith(': ~')) problems.push(`${tag}: after a restart the terminal title is "${title}"`);
  return problems;
}

async function check(browser, base, out, [width, height], layout) {
  const tag = `${width}x${height} ${layout}`;
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', error => problems.push(`${tag}: ${error}`));
  await page.goto(`${base}/index.html`);
  await page.click('#goBtn');
  await page.click('#introSkip');
  await page.waitForTimeout(600);
  const wide = width > 760;
  if (wide) await setLayout(page, layout);
  const name = `${width}x${height}-${wide ? layout : 'narrow'}`;
  problems.push(...problemsOf(`${tag} home`, await page.evaluate(measure), { wide }));
  await page.screenshot({ path: join(out, `${name}-home.png`) });
  await type(page, 'cd /usr/bin');
  await page.waitForFunction(() => document.getElementById('picks').children.length > 40, null, { timeout: 8000 }).catch(() => {});
  const bin = await page.evaluate(measure);
  problems.push(...problemsOf(`${tag} /usr/bin`, bin, { wide }));
  if (bin.picks < 40) problems.push(`${tag}: /usr/bin shows only ${bin.picks} room buttons`);
  await page.screenshot({ path: join(out, `${name}-usrbin.png`) });
  problems.push(...await restartProblems(page, tag));
  if (wide) {
    await page.reload();
    await page.waitForSelector('#goBtn');
    const kept = await page.getAttribute('#app', 'data-layout');
    if (kept !== layout) problems.push(`${tag}: after a reload the layout is ${kept}`);
  }
  await context.close();
  return { problems, sizes: bin.sizes };
}

const out = process.argv[2];
if (!out) throw new Error('usage: node test/ui/layouts.js OUT_DIR');
await mkdir(out, { recursive: true });
const { server, url: base } = await startServer({ root: ROOT, port: 0 });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const problems = [];
try {
  for (const size of SIZES) {
    for (const layout of size[0] > 760 ? LAYOUTS : LAYOUTS.slice(0, 1)) {
      const result = await check(browser, base, out, size, layout);
      console.log(`${size.join('x')} ${layout}: map ${result.sizes.map.map(Math.round).join('x')}, quest ${result.sizes.quest.map(Math.round).join('x')}, terminal ${result.sizes.term.map(Math.round).join('x')}`);
      problems.push(...result.problems);
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(problems.length ? problems.join('\n') : 'no problems');
process.exitCode = problems.length ? 1 : 0;
