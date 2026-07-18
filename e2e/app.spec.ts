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
});
