import { test, expect } from '@playwright/test';

// Smoke test for the generic skeleton. Replace/extend with real E2E flows as you
// build features — see .claude/skills/skill-testing-patterns.md.
test('home page renders the boilerplate placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /boilerplate ready/i })).toBeVisible();
});
