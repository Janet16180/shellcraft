/* global document, window */
// Screenshots of the map harness, for looking at the art by eye.
// Usage: node test/map/shoot.js http://127.0.0.1:PORT OUT_DIR [still|motion|all]
// Serve the worktree root first (python3 -m http.server PORT --bind 127.0.0.1).

import { browserOptions } from '../../scripts/browser.js';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [base, out, mode = 'all'] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: node test/map/shoot.js BASE_URL OUT_DIR [still|motion|all]');
mkdirSync(out, { recursive: true });

const page = url => `${base}/test/map/harness.html?${url}`;

async function stills(browser) {
  const sizes = [
    { w: 640, dpr: 1, cases: null },
    { w: 360, dpr: 2, cases: ['cottage', 'forest', 'hall', 'archive', 'gatehouse', 'armory', 'scrap', 'crowded'] },
    { w: 960, dpr: 1, cases: ['cottage', 'hall'] },
  ];
  for (const { w, dpr, cases } of sizes) {
    const context = await browser.newContext({ viewport: { width: w + 40, height: 900 }, deviceScaleFactor: dpr });
    const tab = await context.newPage();
    await tab.goto(page(`w=${w}${cases ? `&only=${cases.join(',')}` : ''}`));
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForTimeout(600);
    const figures = await tab.locator('figure').all();
    for (const figure of figures) {
      const name = (await figure.locator('figcaption').textContent()).split(':')[0];
      await figure.screenshot({ path: `${out}/${name}-${w}.png` });
    }
    await context.close();
  }
}

async function motion(browser) {
  const trips = [
    { name: 'descend', from: 'cottage', effects: [{ kind: 'travel', from: '/home/hero', to: '/home' }], to: '/home' },
    { name: 'climb', from: 'gatehouse', effects: [{ kind: 'travel', from: '/home', to: '/home/hero' }], to: '/home/hero' },
    { name: 'door', from: 'forest', effects: [{ kind: 'travel', from: '/home/hero/forest', to: '/home/hero/forest/cave' }], to: '/home/hero/forest/cave' },
    { name: 'guardian', from: 'cottage', effects: [{ kind: 'guardian', reason: 'rm -r ~' }, { kind: 'unknown-command' }], to: '/home/hero' },
  ];
  const context = await browser.newContext({ viewport: { width: 680, height: 500 }, deviceScaleFactor: 1 });
  for (const trip of trips) {
    const tab = await context.newPage();
    await tab.goto(page(`w=640&only=${trip.from}`));
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForTimeout(300);
    await tab.evaluate(({ from, effects, to }) => {
      const { maps, observe, busyTree } = window.harness;
      window.trip = maps[from].map.play(effects, observe(to, { tree: busyTree() }));
    }, trip);
    for (const at of [150, 450, 900, 1400, 2000, 2600]) {
      await tab.waitForTimeout(at === 150 ? 150 : 300 + (at > 900 ? 200 : 0));
      await tab.locator('figure').screenshot({ path: `${out}/${trip.name}-${String(at).padStart(4, '0')}.png` });
    }
    await tab.close();
  }
  await context.close();
}

const browser = await chromium.launch(browserOptions());
if (mode !== 'motion') await stills(browser);
if (mode !== 'still') await motion(browser);
await browser.close();
