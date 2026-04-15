/**
 * Playwright config scoped to the perf-monitor tests only.
 * Keeps the existing `playwright.config.js` untouched for e2e work.
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/perf',
  timeout: 90_000,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
