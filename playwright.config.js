/* global process */
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'https://saras-erp-v2-rebuild.vercel.app'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  workers: 1, // serial — tests share auth state
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: {
        storageState: './e2e/.auth/user.json',
      },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        storageState: './e2e/.auth/user.json',
      },
    },
  ],
})
