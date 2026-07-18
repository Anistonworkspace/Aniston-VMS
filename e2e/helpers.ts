import { expect, type Page } from '@playwright/test';

export const DEMO_EMAIL = process.env.PW_EMAIL ?? 'admin@anistonvms.example';
export const DEMO_PASSWORD = process.env.PW_PASSWORD ?? 'AdminDemo2026!';

/** UI login with the seeded demo admin; lands on the Overview dashboard. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(DEMO_EMAIL);
  await page.locator('#login-password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Auth redirect bounces to the app shell — sidebar is the definitive marker.
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({
    timeout: 15_000,
  });
}
