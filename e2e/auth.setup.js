/* global process */
import { test as setup, expect } from '@playwright/test'

const EMAIL = process.env.SARAS_TEST_EMAIL
const PASSWORD = process.env.SARAS_TEST_PASSWORD

setup('authenticate business test user', async ({ page }) => {
  if (!EMAIL || !PASSWORD) throw new Error('SARAS_TEST_EMAIL and SARAS_TEST_PASSWORD are required')
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.context().storageState({ path: './e2e/.auth/user.json' })
})
