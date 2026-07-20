import { test, expect } from './fixtures';

// Every sidebar destination: route + the page's h1 heading.
const PAGES: Array<{ path: string; heading: RegExp }> = [
  { path: '/', heading: /overview/i },
  { path: '/live', heading: /live wall/i },
  { path: '/cameras', heading: /^cameras$/i },
  { path: '/incidents', heading: /^incidents$/i },
  { path: '/analytics', heading: /^analytics$/i },
  { path: '/clips', heading: /^clips$/i },
  { path: '/reports', heading: /^reports$/i },
  { path: '/admin', heading: /administration/i },
  { path: '/settings', heading: /^settings$/i },
];

test.describe('app shell + sidebar pages', () => {
  for (const { path, heading } of PAGES) {
    test(`${path} renders its page heading`, async ({ authedPage: page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
        timeout: 15_000,
      });
    });
  }

  test('sidebar navigation reaches every page client-side', async ({ authedPage: page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const clickAndExpect = async (link: RegExp, heading: RegExp) => {
      await nav.getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
        timeout: 15_000,
      });
    };
    await clickAndExpect(/live wall/i, /live wall/i);
    await clickAndExpect(/cameras/i, /^cameras$/i);
    await clickAndExpect(/incidents/i, /^incidents$/i);
    await clickAndExpect(/analytics/i, /^analytics$/i);
    await clickAndExpect(/clips/i, /^clips$/i);
    await clickAndExpect(/reports/i, /^reports$/i);
    await clickAndExpect(/admin/i, /administration/i);
    await clickAndExpect(/settings/i, /^settings$/i);
  });

  test('dashboard zone card navigates to its populated zone page', async ({ authedPage: page }) => {
    await page.goto('/');
    // Zone cards on the overview grid (main content, NOT the sidebar flyout —
    // both render a[href^="/zones/"]) link to their populated /zones/:id page.
    const zoneCard = page.locator('main a[href^="/zones/"]').first();
    await expect(zoneCard).toBeVisible({ timeout: 15_000 });
    await zoneCard.click();
    await expect(page).toHaveURL(/\/zones\/[^/]+$/);
    // The zone page renders the zone name as its h1 + a Dashboard back link.
    // Scope to the zone-detail region: the sidebar also has a "Dashboard" link,
    // so an unscoped getByRole would trip Playwright's strict mode.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId('zone-detail').getByRole('link', { name: /^dashboard$/i })
    ).toBeVisible();
  });

  test('sidebar zone link navigates to the zone page', async ({ authedPage: page }) => {
    await page.goto('/');
    // Expand Zones in the sidebar, then click the first zone entry.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const zoneLink = nav.locator('a[href^="/zones/"]').first();
    await expect(zoneLink).toBeVisible({ timeout: 15_000 });
    await zoneLink.click();
    await expect(page).toHaveURL(/\/zones\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('dashboard KPI tile deep-links into the pre-filtered cameras grid', async ({
    authedPage: page,
  }) => {
    await page.goto('/');
    // The "Healthy" KPI tile is a Link to the status-filtered fleet grid.
    await page.locator('a[href="/cameras?status=HEALTHY"]').click();
    await expect(page).toHaveURL(/\/cameras\?status=HEALTHY$/);
    await expect(page.getByRole('heading', { level: 1, name: /^cameras$/i })).toBeVisible({
      timeout: 15_000,
    });
    // The matching status filter button reflects the deep-linked selection.
    await expect(page.getByRole('button', { name: /^healthy$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
