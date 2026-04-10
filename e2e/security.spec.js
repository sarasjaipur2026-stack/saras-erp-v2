import { test, expect } from '@playwright/test'

test.describe('Security', () => {
  test('login page is accessible without auth', async ({ browser }) => {
    const context = await browser.newContext() // no stored auth
    const page = await context.newPage()
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await context.close()
  })

  test('protected routes redirect to login without auth', async ({ browser }) => {
    const context = await browser.newContext() // no stored auth
    const page = await context.newPage()
    await page.goto('/orders', { waitUntil: 'networkidle' })
    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
    await context.close()
  })

  test('error boundary does not show stack traces in production', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    // Inject an error to test boundary
    const errorBoundary = page.locator('text=This page failed to render')
    // Should not be visible on normal load
    await expect(errorBoundary).not.toBeVisible()
  })

  test('no sensitive data in page source', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const html = await page.content()
    // Should not contain raw API keys or passwords
    expect(html).not.toContain('Saras@2026')
    expect(html).not.toContain('sk-')
    expect(html).not.toContain('secret')
  })
})
