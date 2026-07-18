import { defineConfig, devices } from '@playwright/test';

// E2E suite runs against the LIVE fullstack docker stack:
//   docker compose -f docker/docker-compose.fullstack.yml up -d
// Frontend: http://localhost:5173  ·  Backend API: http://localhost:4000
// Override with PW_BASE_URL if the stack is served elsewhere.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  use: {
    baseURL: process.env.PW_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Uses the system-installed Chrome (channel) instead of a downloaded
      // Playwright chromium build — browser CDN is unreachable on this host.
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
