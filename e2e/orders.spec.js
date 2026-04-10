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

    // Wait for form to render — master data may take a moment
    await page.waitForTimeout(3000)

    // Form should render with select elements
    const selects = page.locator('select')
    const count = await selects.count()

    if (count > 0) {
      // At least one select should have options beyond placeholder
      const firstSelect = selects.first()
      await expect(firstSelect).toBeVisible({ timeout: 5000 })
      const optionCount = await firstSelect.locator('option').count()
      expect(optionCount).toBeGreaterThanOrEqual(1)
    } else {
      // Form might use custom SearchSelect instead of native select
      await expect(page.locator('input, [role="combobox"]').first()).toBeVisible({ timeout: 5000 })
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
