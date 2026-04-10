import { test, expect } from '@playwright/test'

test.describe('Responsive', () => {
  test('mobile viewport — sidebar collapses', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/', { waitUntil: 'networkidle' })
    // Dashboard should render
    await expect(page.locator('body')).not.toBeEmpty()
    // Sidebar should be hidden on mobile
    const sidebar = page.locator('nav, aside').first()
    // Either hidden or overlaid
    const isDesktopSidebar = await sidebar.isVisible()
    // On mobile, sidebar should not permanently overlay content
    if (isDesktopSidebar) {
      const box = await sidebar.boundingBox()
      // If visible, should be narrow or zero width
      expect(box.width).toBeLessThan(280)
    }
  })

  test('tablet viewport — page renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/orders', { waitUntil: 'networkidle' })
    await expect(page.locator('body')).not.toBeEmpty()
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(768 + 20) // small tolerance
  })
})
