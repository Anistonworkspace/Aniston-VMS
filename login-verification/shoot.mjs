import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = dirname(fileURLToPath(import.meta.url));
const URL = 'http://localhost:5173/login';
const shots = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('#login-email', { timeout: 15000 });
  await page.waitForTimeout(900); // settle fonts/animation
  const file = join(outDir, `login-${s.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  // sample a few key pixels to assert colours in the DOM
  const probe = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const btn = document.querySelector('button[type="submit"]');
    const btnBg = btn ? getComputedStyle(btn).backgroundColor : null;
    const h1 = document.querySelector('h1');
    const h1c = h1 ? getComputedStyle(h1).color : null;
    return { bg, btnBg, h1c };
  });
  console.log(
    `${s.name.padEnd(8)} ${s.width}x${s.height} -> ${file}  probe=${JSON.stringify(probe)}`
  );
  await ctx.close();
}
await browser.close();
console.log('DONE');
