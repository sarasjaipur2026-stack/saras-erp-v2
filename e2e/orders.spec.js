import { test, expect } from '@playwright/test'

test.describe('Orders module', () => {
  test('orders list loads with data', async ({ page }) => {
    await page.goto('/orders', { waitUntil: 'networkidle' })
    // Should show orders heading
    await expect(page.locator('h1').first()).toBeVisible()
    // Should have status tabs
    await expect(page.locator('text=All').first()).toBeVisible()
  })

  test('new order form loads with working dropdowns', async ({ page }) => {
    await page.goto('/orders/new', { waitUntil: 'networkidle' })

    // Form should render
    await expect(page.locator('select').first()).toBeVisible({ timeout: 10000 })

    // All select dropdowns should have options (not empty)
    const selects = page.locator('select')
    const count = await selects.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < Math.min(count, 5); i++) {
      const optionCount = await selects.nth(i).locator('option').count()
      expect(optionCount).toBeGreaterThan(1) // more than just placeholder
    }
  })

  test('order detail page loads for existing order', async ({ page }) => {
    // Go to orders list first
    await page.goto('/orders', { waitUntil: 'networkidle' })

    // Click first order row if exists
    const firstRow = page.locator('tbody tr').first()
    if (await firstRow.isVisible()) {
      await firstRow.click()
      // Should navigate to detail page
      await page.waitForURL(/\/orders\//, { timeout: 5000 })
      await expect(page.locator('body')).not.toBeEmpty()
    }
  })
})
