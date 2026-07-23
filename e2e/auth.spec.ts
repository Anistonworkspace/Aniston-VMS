import { test, expect } from '@playwright/test';
import { DEMO_EMAIL, login } from './helpers';

test.describe('authentication', () => {
  test('login page renders the sign-in form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  });

  test('rejects invalid credentials and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill(DEMO_EMAIL);
    await page.locator('#login-password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated visit to a protected page bounces to /login', async ({ page }) => {
    await page.goto('/cameras');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('valid demo credentials land on the dashboard', async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  });
});
