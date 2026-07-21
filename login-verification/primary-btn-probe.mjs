import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5173';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const p = await ctx.newPage();

// Login page primary submit button
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForSelector('#login-email', { timeout: 20000 });
const submit = p.locator('button[type="submit"]').first();
const sb = await submit.evaluate((el) => {
  const s = getComputedStyle(el);
  return { bg: s.backgroundColor, bgImage: s.backgroundImage.slice(0, 80), color: s.color };
});
console.log('LOGIN submit  =>', JSON.stringify(sb));

// Log in, then scan interior for any element whose bg is the teal primary
await p.fill('#login-email', 'admin@anistonvms.example');
await p.fill('#login-password', 'AdminDemo2026!');
await submit.click();
await p.waitForSelector('aside', { timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(1200);

const scan = await p.evaluate(() => {
  const teal = 'rgb(22, 140, 140)';
  const wanted = new Set();
  const bad = new Set();
  document.querySelectorAll('*').forEach((el) => {
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    if (bg === teal) wanted.add(el.tagName.toLowerCase() + (el.className && typeof el.className==='string' ? '.'+el.className.split(' ')[0] : ''));
    // stale cream/purple detectors
    if (/^rgb\(245, 240, 2|^rgb\(139, 92, 246|^rgb\(124, 58, 237/.test(bg)) bad.add(bg);
  });
  return { tealCount: wanted.size, tealSamples: [...wanted].slice(0,5), badCreamPurple: [...bad] };
});
console.log('DASHBOARD teal-bg elements =>', JSON.stringify(scan));
await ctx.close(); await b.close(); console.log('DONE');
