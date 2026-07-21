import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Usage: node crawl.mjs [baseUrl]
// baseUrl defaults to the served production container; override for vite dev.
const outDir = join(dirname(fileURLToPath(import.meta.url)), 'shots');
const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const DEMO_EMAIL = 'admin@anistonvms.example';
const DEMO_PASSWORD = 'AdminDemo2026!';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];

// Routes reachable from the sidebar (client-side nav keeps the in-memory token).
const ROUTES = [
  { path: '/', label: 'Dashboard' },
  { path: '/live', label: 'Live Wall' },
  { path: '/cameras', label: 'Cameras' },
  { path: '/incidents', label: 'Incidents' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/clips', label: 'Clips' },
  { path: '/reports', label: 'Reports' },
  { path: '/admin', label: 'Admin' },
  { path: '/settings', label: 'Settings' },
];

import { mkdirSync } from 'node:fs';
mkdirSync(outDir, { recursive: true });

const probeFn = () => {
  const rgb = (el, prop) => (el ? getComputedStyle(el)[prop] : null);
  const aside = document.querySelector('aside');
  const card =
    document.querySelector('[class*="rounded-card"]') ||
    document.querySelector('[class*="rounded-2xl"]');
  const primaryBtn = Array.from(document.querySelectorAll('button')).find((b) => {
    const bg = getComputedStyle(b).backgroundColor;
    return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
  });
  return {
    body: rgb(document.body, 'backgroundColor'),
    main: rgb(document.querySelector('main'), 'backgroundColor'),
    sidebar: rgb(aside, 'backgroundColor'),
    sidebarText: rgb(aside, 'color'),
    card: rgb(card, 'backgroundColor'),
    cardText: rgb(card, 'color'),
    btn: primaryBtn ? getComputedStyle(primaryBtn).backgroundColor : null,
    h1: rgb(document.querySelector('h1'), 'color'),
  };
};

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();

// ---- Log in once (token lives in memory only) ----
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#login-email', { timeout: 20000 });
await page.fill('#login-email', DEMO_EMAIL);
await page.fill('#login-password', DEMO_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForSelector('aside, nav[aria-label="Primary"]', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);
console.log(`Logged in; url=${page.url()}`);

const results = [];
for (const r of ROUTES) {
  // navigate client-side at desktop width (sidebar visible >=1024px)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
  const link = page.locator(`a[href="${r.path}"]`).first();
  if (await link.count()) {
    await link.click().catch(() => {});
  } else {
    // fallback: in-app history navigation via a visible nav link text
    await page.getByRole('link', { name: r.label, exact: false }).first().click().catch(() => {});
  }
  await page.waitForTimeout(1100);

  for (const v of VIEWPORTS) {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.waitForTimeout(600);
    const slug = r.path === '/' ? 'dashboard' : r.path.slice(1).replace(/\//g, '-');
    const file = join(outDir, `${slug}-${v.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    if (v.name === 'desktop') {
      const probe = await page.evaluate(probeFn);
      results.push({ route: r.path, ...probe });
      console.log(`${r.path.padEnd(12)} probe=${JSON.stringify(probe)}`);
    }
  }
}

// ---- Zone detail (click first zone in the expanded Zones list) ----
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(150);
const zone = page.locator('a[href^="/zones/"]').first();
if (await zone.count()) {
  await zone.click().catch(() => {});
  await page.waitForTimeout(1100);
  for (const v of VIEWPORTS) {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, `zone-detail-${v.name}.png`) });
  }
  const probe = await page.evaluate(probeFn);
  results.push({ route: '/zones/:id', ...probe });
  console.log(`/zones/:id   probe=${JSON.stringify(probe)}`);
}

console.log('\n=== PROBE SUMMARY (expect: sidebar light-blue ~rgb(216,234,247); card white; teal buttons rgb(22,140,140); navy text ~rgb(20,43,74)) ===');
for (const r of results) console.log(JSON.stringify(r));
await ctx.close();
await browser.close();
console.log('DONE');
