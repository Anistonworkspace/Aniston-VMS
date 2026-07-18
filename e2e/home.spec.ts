import { test, expect } from '@playwright/test';

// Smoke test for the generic skeleton. Replace/extend with real E2E flows as you
// build features — see .claude/skills/skill-testing-patterns.md.
test('home page renders the aniston-vms placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /aniston vms ready/i })).toBeVisible();
});
