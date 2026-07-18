import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { login } from './helpers';

// Auth model (see frontend/src/features/auth/auth.slice.ts): the access token
// lives in memory only; the session is carried by the rotating httpOnly
// `vms_refresh` cookie, and the backend revokes the whole session family if a
// rotated cookie is ever replayed. That rules out Playwright's shared
// storageState file (parallel workers would replay stale cookies and trip
// reuse detection). Instead we authenticate ONCE PER WORKER and keep that
// worker's browser context alive across its tests — every page load's silent
// refresh rotates the cookie inside the live context jar, so no replay ever
// happens, and login traffic stays at ~one request per worker.
type AuthWorkerFixtures = {
  authedContext: BrowserContext;
};

type AuthTestFixtures = {
  /** Page in an authenticated, worker-scoped context (logged in as the demo admin). */
  authedPage: Page;
};

export const test = base.extend<AuthTestFixtures, AuthWorkerFixtures>({
  authedContext: [
    async ({ browser }, use, workerInfo) => {
      // baseURL is test-scoped, so a worker fixture must read it off the project config.
      const { baseURL } = workerInfo.project.use;
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await login(page);
      await page.close();
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  authedPage: async ({ authedContext }, use) => {
    const page = await authedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
