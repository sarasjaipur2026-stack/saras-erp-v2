import { test, expect } from '@playwright/test'

test.describe('Performance', () => {
  test('dashboard loads in under 5 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto('/', { waitUntil: 'networkidle' })
    const loadTime = Date.now() - start
    expect(loadTime).toBeLessThan(5000)
  })

  test('orders page loads in under 5 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto('/orders', { waitUntil: 'networkidle' })
    const loadTime = Date.now() - start
    expect(loadTime).toBeLessThan(5000)
  })

  test('no console errors on dashboard', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000) // wait for deferred loads
    expect(errors).toHaveLength(0)
  })

  test('navigation between pages is fast', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    // Navigate to orders
    const start = Date.now()
    await page.goto('/orders', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1').first()).toBeVisible()
    const navTime = Date.now() - start
    expect(navTime).toBeLessThan(3000)
  })
})
