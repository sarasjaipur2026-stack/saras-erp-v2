/* global process */
import { test as setup, expect } from '@playwright/test'

const EMAIL = process.env.TEST_EMAIL || 'rpk@saras.com'
const PASSWORD = process.env.TEST_PASSWORD || 'Saras@2026'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')

  // Wait for dashboard to load (redirect after login)
  await expect(page).toHaveURL('/', { timeout: 15000 })
  await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10000 })

  // Save auth state
  await page.context().storageState({ path: './e2e/.auth/user.json' })
})
