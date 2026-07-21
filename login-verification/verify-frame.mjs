import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

// Geometry + interaction probe for the floating AppShell.
// Usage: node verify-frame.mjs [baseUrl]
const outDir = join(dirname(fileURLToPath(import.meta.url)), 'frame-checks');
mkdirSync(outDir, { recursive: true });
const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const DEMO_EMAIL = 'admin@anistonvms.example';
const DEMO_PASSWORD = 'AdminDemo2026!';

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#login-email', { timeout: 20000 });
await page.fill('#login-email', DEMO_EMAIL);
await page.fill('#login-password', DEMO_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForSelector('aside', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);

const geo = await page.evaluate(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
      borderRadius: cs.borderTopLeftRadius,
      overflow: cs.overflow, margin: cs.margin, bg: cs.backgroundColor,
    };
  };
  const frame = document.querySelector('#root > div');
  const aside = document.querySelector('aside');
  const panel = aside ? aside.nextElementSibling : null;
  const main = document.querySelector('main');
  const de = document.documentElement;
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    frame: rect(frame), sidebar: rect(aside), panel: rect(panel), main: rect(main),
    gutter: frame ? {
      left: Math.round(frame.getBoundingClientRect().left),
      top: Math.round(frame.getBoundingClientRect().top),
      right: Math.round(window.innerWidth - frame.getBoundingClientRect().right),
      bottom: Math.round(window.innerHeight - frame.getBoundingClientRect().bottom),
    } : null,
    horizontalOverflow: de.scrollWidth - de.clientWidth,
    docScrollableY: de.scrollHeight - de.clientHeight,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    frameBg: frame ? getComputedStyle(frame).backgroundColor : null,
    panelFlushWithSidebar: (aside && panel)
      ? Math.round(aside.getBoundingClientRect().right - panel.getBoundingClientRect().left)
      : null,
  };
});
console.log('GEO=' + JSON.stringify(geo, null, 2));

// ---- corner crops (device scale 2 -> crisp) ----
const p = geo.panel, f = geo.frame;
const crops = {
  'corner-top-left': { x: p.x - 34, y: f.y - 6, width: 96, height: 96 },
  'corner-bottom-left': { x: p.x - 34, y: p.bottom - 90, width: 96, height: 96 },
  'corner-top-right': { x: p.right - 90, y: f.y - 6, width: 96, height: 96 },
  'corner-bottom-right': { x: p.right - 90, y: p.bottom - 90, width: 96, height: 96 },
};
for (const [name, clip] of Object.entries(crops)) {
  await page.screenshot({ path: join(outDir, `${name}.png`), clip });
}

// ---- interaction: open menus/popovers to test clipping (check #9) ----
// Account menu (sidebar AnimatedPopover, opens upward)
await page.getByText('Super Admin', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: join(outDir, 'menu-account.png'), fullPage: false });
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(300);

// A content popover: the "Last 24 h" range filter on the dashboard
await page.getByText('Last 24 h', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: join(outDir, 'menu-range.png'), fullPage: false });

console.log('DONE');
await ctx.close();
await browser.close();
